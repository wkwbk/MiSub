<script lang="ts">
interface CollectionItemBase {
  id: string;
  name?: string;
  description?: string;
  url?: string;
  icon?: string;
  enabled?: boolean;
}

interface CollectionConfig<Item extends CollectionItemBase = CollectionItemBase> {
  enabled: boolean;
  items: Item[];
}

interface CollectionTab {
  value: string;
  label: string;
}

interface CollectionLabels {
  resetBtn: string;
  addBtn: string;
  emptyText: string;
  addModalTitle: string;
  editModalTitle: string;
  resetConfirmQuestion: string;
  resetConfirmDesc: string;
  deleteConfirmQuestion: string;
  fetchErrorText?: string;
  saveErrorText?: string;
  saveErrorFormatter?: (message: string) => string;
}
</script>

<script setup lang="ts" generic="TItem extends CollectionItemBase = CollectionItemBase">
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, ChevronUp, ExternalLink, Loader2, SquarePen, Trash2, Upload } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import Modal from '@/components/ui/Modal.vue';
import Switch from '@/components/ui/Switch.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { fetchPublicResource, initPublicResource, savePublicResource } from '@/lib/api.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { readFileAsDataUrl } from '@/utils/import-file.js';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    tone?: string;
    endpoint: string;
    defaultConfig: object;
    normalizeConfig: (raw: unknown) => CollectionConfig<TItem>;
    tabs?: CollectionTab[];
    filterItem: (item: TItem, tab: string) => boolean;
    resolveIcon: (item: TItem) => string;
    fallbackEmoji?: string;
    iconPlaceholder?: string;
    getCategoryBadge?: ((item: TItem) => string) | null;
    createNewItem: (tab: string) => TItem;
    prepareEditItem?: (item: TItem) => TItem;
    validateAndBuildItem: (item: TItem) => { item: TItem; error?: undefined } | { error: string; item?: undefined };
    labels: CollectionLabels;
  }>(),
  {
    description: '',
    tone: 'blue',
    tabs: () => [],
    fallbackEmoji: '🌐',
    iconPlaceholder: '',
    getCategoryBadge: null,
    prepareEditItem: (item: TItem) => item,
  },
);

const { t } = useI18n();
const { showToast } = useToastStore();

const config = ref<CollectionConfig<TItem>>(props.normalizeConfig(props.defaultConfig));
const loading = ref(false);
const activeTab = ref('all');
const showEditModal = ref(false);
const showResetConfirm = ref(false);
const showDeleteConfirm = ref(false);
const itemToDeleteId = ref<string | null>(null);
const isNew = ref(false);
const saving = ref(false);
const ordering = ref(false);
const iconFileInput = ref<HTMLInputElement | null>(null);
const uploadingIcon = ref(false);
const editingItem = ref<TItem>(props.createNewItem('all'));

const isDataIcon = computed(() => {
  const icon = editingItem.value?.icon;
  return typeof icon === 'string' && icon.startsWith('data:');
});

const iconInputValue = computed({
  get() {
    const icon = editingItem.value?.icon;
    if (!icon || (typeof icon === 'string' && icon.startsWith('data:'))) return '';
    return icon;
  },
  set(value: string) {
    editingItem.value = {
      ...editingItem.value,
      icon: value,
    };
  },
});

const filteredItems = computed(() => {
  const items = (config.value.items || []) as TItem[];
  if (activeTab.value === 'all') return items;
  return items.filter((item) => props.filterItem(item, activeTab.value));
});

const isImageIcon = (item: TItem) => {
  const resolved = props.resolveIcon(item);
  return Boolean(resolved && (resolved.includes('/') || resolved.startsWith('data:') || resolved.startsWith('http')));
};

const getHostname = (rawUrl?: string) => {
  try {
    return new URL(rawUrl || '').hostname.replace(/^www\./, '');
  } catch {
    return rawUrl || '';
  }
};

const fetchItems = async () => {
  loading.value = true;
  try {
    const data = await fetchPublicResource(props.endpoint);
    if (data?.success && data.data) {
      config.value = props.normalizeConfig(data.data);
    } else if (data?.success === false) {
      showToast(props.labels.fetchErrorText || data.message || t('settings.loadFailed'), 'error');
    }
  } catch {
    showToast(t('settings.networkError'), 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(fetchItems);

const persistConfig = async (nextConfig = config.value) => {
  try {
    const res = await savePublicResource(props.endpoint, nextConfig);
    if (res?.success === false) {
      showToast(res.message || props.labels.saveErrorText || t('settings.saveFailed'), 'error');
      return false;
    }
    if (res?.data) {
      config.value = props.normalizeConfig(res.data);
    }
    return true;
  } catch (error: unknown) {
    const extracted = extractErrorMessage(error);
    const msg = props.labels.saveErrorFormatter
      ? props.labels.saveErrorFormatter(extracted)
      : extracted || t('settings.saveFailed');
    showToast(msg, 'error');
    return false;
  }
};

const handleEnabledToggle = async () => {
  await persistConfig();
};

const handleIconFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const allowedTypes = [
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ];
  if (!allowedTypes.includes(file.type)) {
    showToast(t('settings.clientIconInvalidType'), 'error');
    return;
  }

  if (file.size > 200 * 1024) {
    showToast(t('settings.clientIconTooLarge'), 'error');
    return;
  }

  uploadingIcon.value = true;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl) {
      editingItem.value = {
        ...editingItem.value,
        icon: dataUrl,
      };
    }
  } catch {
    showToast(t('settings.clientIconReadFailed'), 'error');
  } finally {
    uploadingIcon.value = false;
  }
};

const triggerIconFileSelect = () => {
  iconFileInput.value?.click();
};

const clearIcon = () => {
  editingItem.value = {
    ...editingItem.value,
    icon: '',
  };
};

const handleAdd = () => {
  isNew.value = true;
  editingItem.value = props.createNewItem(activeTab.value);
  showEditModal.value = true;
};

const handleEdit = (item: TItem) => {
  isNew.value = false;
  editingItem.value = props.prepareEditItem(JSON.parse(JSON.stringify(item)) as TItem);
  showEditModal.value = true;
};

const moveItem = async (itemId: string, direction: number) => {
  const fullList = [...((config.value.items || []) as TItem[])];
  const currentVisList = filteredItems.value;
  const visIdx = currentVisList.findIndex((item) => item.id === itemId);
  const targetVisIdx = visIdx + direction;
  if (visIdx === -1 || targetVisIdx < 0 || targetVisIdx >= currentVisList.length) return;

  const itemA = currentVisList[visIdx];
  const itemB = currentVisList[targetVisIdx];
  const fullIdxA = fullList.findIndex((item) => item.id === itemA.id);
  const fullIdxB = fullList.findIndex((item) => item.id === itemB.id);
  if (fullIdxA === -1 || fullIdxB === -1) return;

  const temp = fullList[fullIdxA];
  fullList[fullIdxA] = fullList[fullIdxB];
  fullList[fullIdxB] = temp;

  config.value = {
    ...config.value,
    items: fullList,
  };
  ordering.value = true;
  try {
    const saved = await persistConfig();
    if (saved) {
      showToast(t('settings.clientOrderSaved'), 'success');
    }
  } finally {
    ordering.value = false;
  }
};

const handleSave = async () => {
  const result = props.validateAndBuildItem(editingItem.value as TItem);
  if (result?.error) {
    showToast(result.error, 'error');
    return;
  }
  const nextItem = result.item;
  if (!nextItem) return;

  saving.value = true;
  try {
    const list = [...((config.value.items || []) as TItem[])];
    const existingIdx = list.findIndex((item) => item.id === nextItem.id);
    if (existingIdx !== -1) {
      list[existingIdx] = nextItem;
    } else {
      list.push(nextItem);
    }

    config.value = {
      ...config.value,
      items: list,
    };

    const saved = await persistConfig();
    if (!saved) return;
    showEditModal.value = false;
    showToast(t('settings.clientSaveSuccess'), 'success');
  } finally {
    saving.value = false;
  }
};

const handleDelete = (id: string) => {
  itemToDeleteId.value = id;
  showDeleteConfirm.value = true;
};

const executeDelete = async () => {
  if (!itemToDeleteId.value) return;
  const nextItems = ((config.value.items || []) as TItem[]).filter((item) => item.id !== itemToDeleteId.value);
  config.value = {
    ...config.value,
    items: nextItems,
  };
  showDeleteConfirm.value = false;
  itemToDeleteId.value = null;
  const saved = await persistConfig();
  if (!saved) return;
  showToast(t('settings.clientDeleted'), 'success');
};

const executeReset = async () => {
  showResetConfirm.value = false;
  loading.value = true;
  try {
    const res = await initPublicResource(props.endpoint);
    if (res?.success && res.data) {
      config.value = props.normalizeConfig(res.data);
      showToast(t('settings.clientResetSuccess'), 'success');
    } else {
      showToast(res?.message || t('settings.clientResetFailed'), 'error');
    }
  } catch (error: unknown) {
    showToast(extractErrorMessage(error, t('settings.clientResetFailed')), 'error');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <SettingCard :description="description" :no-margin="!config.enabled" :title="title" :tone="tone">
    <template #icon>
      <slot name="icon" />
    </template>
    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <Switch v-model="config.enabled" @change="handleEnabledToggle" />
        <template v-if="config.enabled">
          <button
            class="px-3 py-1.5 text-center text-xs font-medium text-fg-muted bg-transparent hover:bg-hover hover:text-fg rounded-md border border-line"
            type="button"
            @click="showResetConfirm = true"
          >
            {{ labels.resetBtn }}
          </button>
          <button
            class="px-3.5 py-1.5 text-center text-xs font-semibold text-accent-fg bg-accent hover:opacity-90 rounded-md border border-accent shadow-none"
            type="button"
            @click="handleAdd"
          >
            {{ labels.addBtn }}
          </button>
        </template>
      </div>
    </template>

    <div v-if="config.enabled" class="space-y-4">
      <div v-if="loading" class="text-center py-8 text-xs text-fg-muted">
        {{ t('common.loading') }}
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 pb-2 border-b border-line">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            :class="
              activeTab === tab.value
                ? 'bg-accent text-accent-fg border-accent font-semibold'
                : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg'
            "
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors border"
            type="button"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div
          v-if="filteredItems.length === 0"
          class="py-8 text-center text-xs text-fg-muted border border-dashed border-line rounded-md"
        >
          {{ labels.emptyText }}
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4">
          <div
            v-for="(item, index) in filteredItems"
            :key="item.id"
            class="relative flex h-full flex-col bg-transparent border border-line rounded-md p-4 shadow-none transition-colors hover:border-line-strong group"
          >
            <div class="flex items-start gap-3 min-w-0 pb-4">
              <div
                class="h-11 w-11 rounded-md flex items-center justify-center text-lg shrink-0 bg-transparent text-fg-muted overflow-hidden border border-line"
              >
                <img
                  v-if="isImageIcon(item)"
                  :alt="item.name"
                  :src="resolveIcon(item)"
                  class="w-full h-full object-contain rounded-md p-1"
                />
                <span v-else>{{ item.icon || item.name?.slice(0, 1) || fallbackEmoji }}</span>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-sm font-semibold text-fg truncate">
                    {{ item.name }}
                  </h4>
                  <span
                    v-if="getCategoryBadge"
                    class="px-1.5 py-0.5 text-xs rounded-md border border-line bg-transparent text-fg-muted font-mono shrink-0"
                  >
                    {{ getCategoryBadge(item) }}
                  </span>
                </div>
                <slot :item="item" name="badges" />
                <p class="text-xs text-fg-muted truncate mt-1">
                  {{ item.description }}
                </p>
                <a
                  v-if="item.url"
                  :href="item.url"
                  class="inline-flex items-center gap-1 text-xs font-mono text-fg-subtle hover:text-fg-muted mt-1.5 truncate max-w-full"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span class="truncate">{{ getHostname(item.url) }}</span>
                  <ExternalLink class="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>

            <div class="mt-auto grid grid-cols-2 sm:flex sm:flex-wrap gap-2 border-t border-line pt-3">
              <button
                :disabled="ordering || index === 0"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
                type="button"
                @click.stop="moveItem(item.id, -1)"
              >
                <ChevronUp class="w-3.5 h-3.5" />
                <span>{{ t('actions.moveUp') }}</span>
              </button>
              <button
                :disabled="ordering || index === filteredItems.length - 1"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
                type="button"
                @click.stop="moveItem(item.id, 1)"
              >
                <ChevronDown class="w-3.5 h-3.5" />
                <span>{{ t('actions.moveDown') }}</span>
              </button>
              <button
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors"
                type="button"
                @click.stop="handleEdit(item)"
              >
                <SquarePen class="w-3.5 h-3.5" />
                <span>{{ t('actions.edit') }}</span>
              </button>
              <button
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-red-400 hover:border-red-900/60 hover:bg-red-950/40 rounded-md transition-colors"
                type="button"
                @click.stop="handleDelete(item.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>{{ t('actions.delete') }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <Modal v-model:show="showEditModal" :title="isNew ? labels.addModalTitle : labels.editModalTitle" size="4xl">
      <template #body>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div class="md:col-span-5 lg:col-span-4">
            <div class="bg-transparent rounded-md p-6 flex flex-col items-center gap-6 h-full border border-line">
              <div class="text-center space-y-3 w-full">
                <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientIconPreview') }}</label>
                <div
                  class="aspect-square w-full max-w-[140px] mx-auto rounded-md flex items-center justify-center text-5xl bg-inset text-fg-muted border border-line overflow-hidden shadow-none"
                >
                  <img
                    v-if="isImageIcon(editingItem as TItem)"
                    :alt="editingItem.name"
                    :src="resolveIcon(editingItem as TItem)"
                    class="w-full h-full object-contain rounded-md p-3"
                  />
                  <span v-else>{{ editingItem.icon || editingItem.name?.slice(0, 1) || fallbackEmoji }}</span>
                </div>
              </div>

              <div class="w-full space-y-4">
                <div class="space-y-2">
                  <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientLocalIcon') }}</label>
                  <input
                    ref="iconFileInput"
                    accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp,image/x-icon"
                    class="hidden"
                    type="file"
                    @change="handleIconFileSelect"
                  />
                  <div class="flex gap-2 justify-center">
                    <button
                      :disabled="uploadingIcon"
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-fg-muted bg-transparent border border-line rounded-md hover:bg-hover hover:text-fg transition-colors"
                      type="button"
                      @click="triggerIconFileSelect"
                    >
                      <Upload v-if="!uploadingIcon" class="w-3.5 h-3.5" />
                      <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                      <span>{{ uploadingIcon ? t('settings.clientUploading') : t('settings.clientUploadImage') }}</span>
                    </button>
                    <button
                      v-if="editingItem.icon"
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 bg-transparent border border-line rounded-md hover:border-red-900/60 hover:bg-red-950/40 transition-colors"
                      type="button"
                      @click="clearIcon"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                      <span>{{ t('actions.clearAll') }}</span>
                    </button>
                  </div>
                  <p v-if="isDataIcon" class="text-xs text-center text-fg-muted">
                    {{ t('settings.clientUsingLocalIcon') }}
                  </p>
                </div>

                <div class="space-y-2">
                  <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientIconUrlOrEmoji') }}</label>
                  <input
                    v-model="iconInputValue"
                    :placeholder="iconPlaceholder"
                    class="block w-full px-3 py-2 rounded-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
                    type="text"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="md:col-span-7 lg:col-span-8 flex flex-col gap-5">
            <slot :editing-item="(editingItem as TItem)" :is-new="isNew" name="form" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 text-xs font-medium text-fg-muted bg-transparent border border-line rounded-md hover:bg-hover hover:text-fg"
            type="button"
            @click="showEditModal = false"
          >
            {{ t('actions.cancel') }}
          </button>
          <button
            :disabled="saving"
            class="px-4 py-1.5 text-xs font-semibold text-accent-fg bg-accent border border-accent rounded-md hover:opacity-90 disabled:opacity-50"
            type="button"
            @click="handleSave"
          >
            {{ saving ? t('settings.saving') : t('actions.save') }}
          </button>
        </div>
      </template>
    </Modal>

    <Modal
      v-model:show="showResetConfirm"
      :cancelText="t('actions.cancel')"
      :confirmText="t('settings.clientResetConfirmAction')"
      :title="t('settings.clientResetConfirmTitle')"
      size="sm"
      @confirm="executeReset"
    >
      <template #body>
        <div class="space-y-3">
          <div class="callout-warning font-medium">
            {{ t('settings.clientDangerWarning') }}
          </div>
          <p class="text-xs text-fg-muted">
            {{ labels.resetConfirmQuestion }}
            <br />
            {{ labels.resetConfirmDesc }}
          </p>
        </div>
      </template>
    </Modal>

    <Modal
      v-model:show="showDeleteConfirm"
      :cancelText="t('actions.cancel')"
      :confirmText="t('settings.clientDeleteConfirmAction')"
      :title="t('settings.clientDeleteConfirmTitle')"
      size="sm"
      @confirm="executeDelete"
    >
      <template #body>
        <div class="space-y-3">
          <div class="callout-danger font-medium">
            {{ t('settings.clientDangerWarning') }}
          </div>
          <p class="text-xs text-fg-muted">
            {{ labels.deleteConfirmQuestion }}
          </p>
        </div>
      </template>
    </Modal>
  </SettingCard>
</template>
