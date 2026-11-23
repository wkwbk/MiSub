<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, ChevronUp, Compass, ExternalLink, Loader2, SquarePen, Trash2, Upload } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/toast.js';
import Modal from '@/components/ui/Modal.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { api } from '@/lib/http.js';
import {
  DEFAULT_PUBLIC_LINKS_CONFIG,
  normalizePublicLinksConfig,
  PUBLIC_LINK_CATEGORIES,
  resolvePublicLinkIcon,
} from '@shared/default-public-links.js';

const { t } = useI18n();
const { showToast } = useToastStore();

const publicLinksConfig = ref(normalizePublicLinksConfig(DEFAULT_PUBLIC_LINKS_CONFIG));
const loading = ref(false);

const fetchPublicLinks = async () => {
  loading.value = true;
  try {
    const data = await api.get('/api/public_links');
    if (data?.success && data.data) {
      publicLinksConfig.value = normalizePublicLinksConfig(data.data);
    } else if (data?.success === false) {
      showToast(data.message || t('settings.loadFailed'), 'error');
    }
  } catch {
    showToast(t('settings.networkError'), 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(fetchPublicLinks);

const activeCategory = ref('all');
const showEditModal = ref(false);
const showResetConfirm = ref(false);
const showDeleteConfirm = ref(false);
const linkToDeleteId = ref(null);
const isNew = ref(false);
const saving = ref(false);
const iconFileInput = ref(null);
const uploadingIcon = ref(false);

const editingLink = ref({
  id: '',
  name: '',
  category: 'speedtest',
  description: '',
  url: '',
  icon: '',
  enabled: true,
});

const isDataIcon = computed(() => {
  const icon = editingLink.value?.icon;
  return typeof icon === 'string' && icon.startsWith('data:');
});

const iconInputValue = computed({
  get() {
    const icon = editingLink.value?.icon;
    if (!icon || (typeof icon === 'string' && icon.startsWith('data:'))) return '';
    return icon;
  },
  set(value) {
    editingLink.value = {
      ...editingLink.value,
      icon: value,
    };
  },
});

const categoryTabs = computed(() => [
  { value: 'all', label: t('publicProfiles.allCategories') },
  ...PUBLIC_LINK_CATEGORIES.map((cat) => ({
    value: cat.value,
    label: t(cat.labelKey),
  })),
]);

const filteredLinks = computed(() => {
  const items = publicLinksConfig.value.items || [];
  if (activeCategory.value === 'all') return items;
  return items.filter((item) => item.category === activeCategory.value);
});

const getCategoryLabel = (category) => {
  const found = PUBLIC_LINK_CATEGORIES.find((c) => c.value === category);
  return found ? t(found.labelKey) : category || t('publicLinks.categories.other');
};

const getHostname = (rawUrl) => {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl || '';
  }
};

const normalizeWebsiteUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const persistPublicLinks = async (nextConfig = publicLinksConfig.value) => {
  try {
    const res = await api.post('/api/public_links', nextConfig);
    if (res?.success === false) {
      showToast(res.message || t('settings.saveFailed'), 'error');
      return false;
    }
    if (res?.data) {
      publicLinksConfig.value = normalizePublicLinksConfig(res.data);
    }
    return true;
  } catch (error) {
    showToast(error?.message || t('settings.saveFailed'), 'error');
    return false;
  }
};

const handleEnabledToggle = async () => {
  await persistPublicLinks();
};

const handleIconFileSelect = (event) => {
  const file = event.target.files?.[0];
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

  const maxSize = 200 * 1024;
  if (file.size > maxSize) {
    showToast(t('settings.clientIconTooLarge'), 'error');
    return;
  }

  uploadingIcon.value = true;
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result;
    if (result) {
      editingLink.value = {
        ...editingLink.value,
        icon: result,
      };
    }
    uploadingIcon.value = false;
  };
  reader.onerror = () => {
    showToast(t('settings.clientIconReadFailed'), 'error');
    uploadingIcon.value = false;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
};

const triggerIconFileSelect = () => {
  iconFileInput.value?.click();
};

const clearIcon = () => {
  editingLink.value = {
    ...editingLink.value,
    icon: '',
  };
};

const handleAdd = () => {
  isNew.value = true;
  editingLink.value = {
    id: '',
    name: '',
    category: activeCategory.value === 'all' ? 'speedtest' : activeCategory.value,
    description: '',
    url: '',
    icon: '',
    enabled: true,
  };
  showEditModal.value = true;
};

const handleEdit = (link) => {
  isNew.value = false;
  editingLink.value = JSON.parse(JSON.stringify(link));
  if (!editingLink.value.category) editingLink.value.category = 'other';
  showEditModal.value = true;
};

const handleSaveLink = async () => {
  const name = String(editingLink.value.name || '').trim();
  if (!name) {
    showToast(t('publicLinks.nameRequired'), 'error');
    return;
  }

  const normalizedUrl = normalizeWebsiteUrl(editingLink.value.url);
  if (!normalizedUrl) {
    showToast(t('publicLinks.urlRequired'), 'error');
    return;
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      showToast(t('publicLinks.invalidUrl'), 'error');
      return;
    }
  } catch {
    showToast(t('publicLinks.invalidUrl'), 'error');
    return;
  }

  saving.value = true;
  try {
    const nextItem = {
      ...editingLink.value,
      id: editingLink.value.id || `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: editingLink.value.category || 'other',
      description: String(editingLink.value.description || '').trim(),
      url: normalizedUrl,
      icon: String(editingLink.value.icon || '').trim(),
      enabled: editingLink.value.enabled !== false,
    };

    const list = [...(publicLinksConfig.value.items || [])];
    const existingIdx = list.findIndex((item) => item.id === nextItem.id);
    if (existingIdx !== -1) {
      list[existingIdx] = nextItem;
    } else {
      list.push(nextItem);
    }

    publicLinksConfig.value = {
      ...publicLinksConfig.value,
      items: list,
    };

    const saved = await persistPublicLinks();
    if (!saved) return;
    showEditModal.value = false;
    showToast(t('settings.clientSaveSuccess'), 'success');
  } finally {
    saving.value = false;
  }
};

const moveLink = async (linkId, direction) => {
  const fullList = [...(publicLinksConfig.value.items || [])];
  const currentVisList = filteredLinks.value;
  const visIdx = currentVisList.findIndex((item) => item.id === linkId);
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

  publicLinksConfig.value = {
    ...publicLinksConfig.value,
    items: fullList,
  };
  const saved = await persistPublicLinks();
  if (!saved) return;
  showToast(t('settings.clientOrderSaved'), 'success');
};

const handleDelete = (id) => {
  linkToDeleteId.value = id;
  showDeleteConfirm.value = true;
};

const executeDelete = async () => {
  if (!linkToDeleteId.value) return;
  const nextItems = (publicLinksConfig.value.items || []).filter((item) => item.id !== linkToDeleteId.value);
  publicLinksConfig.value = {
    ...publicLinksConfig.value,
    items: nextItems,
  };
  showDeleteConfirm.value = false;
  linkToDeleteId.value = null;
  const saved = await persistPublicLinks();
  if (!saved) return;
  showToast(t('settings.clientDeleted'), 'success');
};

const executeReset = async () => {
  showResetConfirm.value = false;
  try {
    const res = await api.post('/api/public_links/init');
    if (res?.success && res.data) {
      publicLinksConfig.value = normalizePublicLinksConfig(res.data);
      showToast(t('settings.clientResetSuccess'), 'success');
    } else {
      showToast(res?.message || t('settings.clientResetFailed'), 'error');
    }
  } catch (error) {
    showToast(error?.message || t('settings.clientResetFailed'), 'error');
  }
};
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <SectionHeader
      :description="t('publicLinks.managerDesc')"
      :no-margin="!publicLinksConfig.enabled"
      :title="t('publicLinks.managerTitle')"
      tone="blue"
    >
      <template #icon>
        <Compass class="h-4 w-4" />
      </template>
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <Switch v-model="publicLinksConfig.enabled" @change="handleEnabledToggle" />
          <template v-if="publicLinksConfig.enabled">
            <button
              class="px-3 py-1.5 text-center text-xs font-medium text-fg-muted bg-transparent hover:bg-hover hover:text-fg rounded-md border border-line"
              type="button"
              @click="showResetConfirm = true"
            >
              {{ t('publicLinks.resetDefault') }}
            </button>
            <button
              class="px-3.5 py-1.5 text-center text-xs font-semibold text-accent-fg bg-accent hover:opacity-90 rounded-md border border-accent shadow-none"
              type="button"
              @click="handleAdd"
            >
              {{ t('publicLinks.addLink') }}
            </button>
          </template>
        </div>
      </template>
    </SectionHeader>

    <div v-if="publicLinksConfig.enabled" class="space-y-4">
      <div v-if="loading" class="text-center py-8 text-xs text-fg-muted">
        {{ t('common.loading') }}
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 pb-2 border-b border-line">
        <button
          v-for="tab in categoryTabs"
          :key="tab.value"
          :class="
            activeCategory === tab.value
              ? 'bg-accent text-accent-fg border-accent font-semibold'
              : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg'
          "
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors border"
          type="button"
          @click="activeCategory = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        v-if="filteredLinks.length === 0"
        class="py-8 text-center text-xs text-fg-muted border border-dashed border-line rounded-md"
      >
        {{ t('publicLinks.emptyCategory') }}
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="(link, index) in filteredLinks"
          :key="link.id"
          class="relative bg-transparent border border-line rounded-md p-4 shadow-none transition-colors hover:border-line-strong group"
        >
          <div class="flex items-start gap-3 min-w-0">
            <div
              class="h-11 w-11 rounded-md flex items-center justify-center text-lg shrink-0 bg-transparent text-fg-muted overflow-hidden border border-line"
            >
              <img
                v-if="
                  resolvePublicLinkIcon(link) &&
                  (resolvePublicLinkIcon(link).includes('/') ||
                    resolvePublicLinkIcon(link).startsWith('data:') ||
                    resolvePublicLinkIcon(link).startsWith('http'))
                "
                :alt="link.name"
                :src="resolvePublicLinkIcon(link)"
                class="w-full h-full object-contain rounded-md p-1"
              />
              <span v-else>{{ link.icon || link.name?.slice(0, 1) || '🌐' }}</span>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-semibold text-fg truncate">
                  {{ link.name }}
                </h4>
                <span
                  class="px-1.5 py-0.5 text-xs rounded-md border border-line bg-transparent text-fg-muted font-mono shrink-0"
                >
                  {{ getCategoryLabel(link.category) }}
                </span>
              </div>
              <p class="text-xs text-fg-muted truncate mt-1">
                {{ link.description }}
              </p>
              <a
                :href="link.url"
                class="inline-flex items-center gap-1 text-xs font-mono text-fg-subtle hover:text-fg-muted mt-1.5 truncate max-w-full"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span class="truncate">{{ getHostname(link.url) }}</span>
                <ExternalLink class="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 border-t border-line pt-3">
            <button
              :disabled="index === 0"
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
              type="button"
              @click.stop="moveLink(link.id, -1)"
            >
              <ChevronUp class="w-3.5 h-3.5" />
              <span>{{ t('actions.moveUp') }}</span>
            </button>
            <button
              :disabled="index === filteredLinks.length - 1"
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
              type="button"
              @click.stop="moveLink(link.id, 1)"
            >
              <ChevronDown class="w-3.5 h-3.5" />
              <span>{{ t('actions.moveDown') }}</span>
            </button>
            <button
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors"
              type="button"
              @click.stop="handleEdit(link)"
            >
              <SquarePen class="w-3.5 h-3.5" />
              <span>{{ t('actions.edit') }}</span>
            </button>
            <button
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-red-400 hover:border-red-900/60 hover:bg-red-950/40 rounded-md transition-colors"
              type="button"
              @click.stop="handleDelete(link.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>{{ t('actions.delete') }}</span>
            </button>
          </div>
        </div>
      </div>
      </template>
    </div>

    <Modal
      v-model:show="showEditModal"
      :title="isNew ? t('publicLinks.addModalTitle') : t('publicLinks.editModalTitle')"
      size="4xl"
    >
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
                    v-if="
                      resolvePublicLinkIcon(editingLink) &&
                      (resolvePublicLinkIcon(editingLink).includes('/') ||
                        resolvePublicLinkIcon(editingLink).startsWith('data:') ||
                        resolvePublicLinkIcon(editingLink).startsWith('http'))
                    "
                    :alt="editingLink.name"
                    :src="resolvePublicLinkIcon(editingLink)"
                    class="w-full h-full object-contain rounded-md p-3"
                  />
                  <span v-else>{{ editingLink.icon || editingLink.name?.slice(0, 1) || '🌐' }}</span>
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
                      v-if="editingLink.icon"
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
                  <label class="block text-xs font-medium text-fg-muted">URL / Emoji</label>
                  <input
                    v-model="iconInputValue"
                    :placeholder="t('settings.clientIconPlaceholder')"
                    class="block w-full px-3 py-2 rounded-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
                    type="text"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="md:col-span-7 lg:col-span-8 flex flex-col gap-5">
            <div>
              <label class="block text-xs font-medium text-fg-muted">
                {{ t('publicLinks.nameLabel') }}
                <span class="text-red-400">*</span>
              </label>
              <input
                v-model="editingLink.name"
                :placeholder="t('publicLinks.namePlaceholder')"
                class="mt-1 block w-full rounded-md border border-line bg-inset text-fg shadow-none focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-sm px-3 py-2 font-medium"
                type="text"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-fg-muted mb-2">
                {{ t('publicLinks.categoryLabel') }}
              </label>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  v-for="cat in PUBLIC_LINK_CATEGORIES"
                  :key="cat.value"
                  :class="
                    editingLink.category === cat.value
                      ? 'bg-elevated-card border-line-strong text-fg'
                      : 'bg-transparent border-line text-fg-subtle hover:bg-hover hover:text-fg-muted'
                  "
                  class="p-2 rounded-md border text-xs font-medium transition-colors text-center"
                  type="button"
                  @click="editingLink.category = cat.value"
                >
                  {{ t(cat.labelKey) }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-fg-muted">
                {{ t('publicLinks.urlLabel') }}
                <span class="text-red-400">*</span>
              </label>
              <div class="mt-1 flex rounded-md shadow-none">
                <span
                  class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-line bg-elevated-card text-fg-subtle font-mono text-xs"
                  >URL</span
                >
                <input
                  v-model="editingLink.url"
                  :placeholder="t('publicLinks.urlPlaceholder')"
                  class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
                  type="text"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-fg-muted">
                {{ t('publicLinks.descriptionLabel') }}
              </label>
              <Textarea
                v-model="editingLink.description"
                :placeholder="t('publicLinks.descriptionPlaceholder')"
                class="sm:text-sm px-3 py-2 resize-none"
                rows="3"
                wrapperClass="mt-1"
              />
            </div>
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
            @click="handleSaveLink"
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
            {{ t('publicLinks.resetConfirmQuestion') }}
            <br />
            {{ t('publicLinks.resetConfirmDesc') }}
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
            {{ t('publicLinks.deleteConfirmQuestion') }}
          </p>
        </div>
      </template>
    </Modal>
  </section>
</template>
