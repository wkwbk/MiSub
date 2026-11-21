<script setup>
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, ChevronUp, Loader2, Monitor, SquarePen, Trash2, Upload } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/ui/Modal.vue';
import Textarea from '@/components/ui/Textarea.vue';
import { api } from '@/lib/http.js';
import SectionHeader from '@/components/settings/SectionHeader.vue';

const clients = ref([]);
const loading = ref(false);
const { showToast } = useToastStore();
const { t } = useI18n();

const showEditModal = ref(false);
const editingClient = ref({});
const isNew = ref(false);
const saving = ref(false);
const ordering = ref(false);
const iconFileInput = ref(null);
const uploadingIcon = ref(false);
const isDataIcon = computed(() => {
  const icon = editingClient.value?.icon;
  return typeof icon === 'string' && icon.startsWith('data:');
});
const iconInputValue = computed({
  get() {
    const icon = editingClient.value?.icon;
    if (!icon || (typeof icon === 'string' && icon.startsWith('data:'))) return '';
    return icon;
  },
  set(value) {
    editingClient.value = {
      ...editingClient.value,
      icon: value,
    };
  },
});

const platformOptions = [
  {
    value: 'windows',
    label: 'Windows',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
  {
    value: 'macos',
    label: 'macOS',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
  {
    value: 'linux',
    label: 'Linux',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
  {
    value: 'android',
    label: 'Android',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
  {
    value: 'ios',
    label: 'iOS',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
  {
    value: 'HarmonyOS',
    label: 'HarmonyOS',
    class: 'border border-line bg-transparent text-fg-muted font-mono',
  },
];

const activePlatform = ref('all');

const platformTabs = computed(() => [
  { value: 'all', label: t('publicProfiles.allCategories') },
  ...platformOptions.map((opt) => ({
    value: opt.value,
    label: opt.label,
  })),
]);

const filteredClients = computed(() => {
  if (activePlatform.value === 'all') return clients.value;
  return clients.value.filter((c) => Array.isArray(c.platforms) && c.platforms.includes(activePlatform.value));
});

const handleIconFileSelect = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const allowedTypes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
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
      editingClient.value = {
        ...editingClient.value,
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
  editingClient.value = {
    ...editingClient.value,
    icon: '',
  };
};

const fetchClients = async () => {
  loading.value = true;
  try {
    const data = await api.get('/api/clients');
    if (data.success) {
      clients.value = data.data || [];
    } else {
      showToast(t('settings.clientFetchFailed'), 'error');
    }
  } catch (e) {
    showToast(t('settings.networkError'), 'error');
  } finally {
    loading.value = false;
  }
};

const showResetConfirm = ref(false);

const handleInit = () => {
  showResetConfirm.value = true;
};

const executeReset = async () => {
  loading.value = true;
  try {
    const data = await api.post('/api/clients/init');
    if (data.success) {
      clients.value = data.data;
      showToast(t('settings.clientResetSuccess'), 'success');
    }
  } catch (e) {
    showToast(t('settings.clientResetFailed'), 'error');
  } finally {
    loading.value = false;
  }
};

const handleAdd = () => {
  isNew.value = true;
  editingClient.value = {
    id: '',
    name: '',
    icon: '',
    description: '',
    platforms: activePlatform.value === 'all' ? [] : [activePlatform.value],
    url: '',
    repo: '',
  };
  showEditModal.value = true;
};

const handleEdit = (client) => {
  isNew.value = false;
  editingClient.value = JSON.parse(JSON.stringify(client));
  if (!editingClient.value.platforms) editingClient.value.platforms = [];
  showEditModal.value = true;
};

const saveClientOrder = async () => {
  ordering.value = true;
  try {
    const data = await api.post('/api/clients', clients.value);
    if (data.success) {
      clients.value = data.data;
      showToast(t('settings.clientOrderSaved'), 'success');
    } else {
      showToast(data.message || t('settings.clientOrderSaveFailed'), 'error');
    }
  } catch (e) {
    showToast(t('settings.clientOrderSaveFailedWithMessage', { message: e.message }), 'error');
  } finally {
    ordering.value = false;
  }
};

const moveClient = async (clientId, direction) => {
  const fullList = [...clients.value];
  const currentVisList = filteredClients.value;
  const visIdx = currentVisList.findIndex((item) => item.id === clientId);
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
  clients.value = fullList;
  await saveClientOrder();
};

const handleSave = async () => {
  if (!editingClient.value.name) return showToast(t('settings.clientNameRequired'), 'error');

  saving.value = true;
  try {
    const data = await api.post('/api/clients', editingClient.value);
    if (data.success) {
      showToast(t('settings.clientSaveSuccess'), 'success');
      showEditModal.value = false;
      // Update local list (server returns full list or we refetch)
      // API handler currently returns full list
      clients.value = data.data;
    } else {
      showToast(data.message || t('settings.clientSaveFailed'), 'error');
    }
  } catch (e) {
    showToast(t('settings.clientSaveFailedWithMessage', { message: e.message }), 'error');
  } finally {
    saving.value = false;
  }
};

const showDeleteConfirm = ref(false);
const clientToDeleteId = ref(null);

const handleDelete = (id) => {
  clientToDeleteId.value = id;
  showDeleteConfirm.value = true;
};

const executeDelete = async () => {
  if (!clientToDeleteId.value) return;
  try {
    const data = await api.del(`/api/clients?id=${clientToDeleteId.value}`);
    if (data.success) {
      clients.value = data.data;
      showToast(t('settings.clientDeleted'), 'success');
      showDeleteConfirm.value = false;
    }
  } catch (e) {
    showToast(t('settings.clientDeleteFailed'), 'error');
  }
};

const getPlatformClass = (platform) => {
  const option = platformOptions.find((opt) => opt.value === platform);
  return option ? option.class : 'border border-line bg-transparent text-fg-muted font-mono';
};

onMounted(fetchClients);
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.clientManagerDesc')"
        :title="t('settings.clientManagerTitle')"
        tone="blue"
      >
        <template #icon>
          <Monitor class="h-4 w-4" />
        </template>
        <template #actions>
          <button
            class="px-3.5 py-1.5 text-center text-xs font-medium text-fg-muted bg-transparent hover:bg-hover hover:text-fg rounded-md border border-line"
            @click="handleInit"
          >
            {{ t('settings.clientResetDefault') }}
          </button>
          <button
            class="px-4 py-1.5 text-center text-xs font-semibold text-accent-fg bg-accent hover:opacity-90 rounded-md border border-accent shadow-none"
            @click="handleAdd"
          >
            {{ t('settings.clientAdd') }}
          </button>
        </template>
      </SectionHeader>

      <div v-if="loading" class="text-center py-8 text-xs text-fg-subtle">
        {{ t('common.loading') }}
      </div>

      <div v-else class="space-y-4">
        <!-- Platform Filter Tabs -->
        <div class="flex flex-wrap items-center gap-2 pb-2 border-b border-line">
          <button
            v-for="tab in platformTabs"
            :key="tab.value"
            :class="
              activePlatform === tab.value
                ? 'bg-accent text-accent-fg border-accent font-semibold'
                : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg'
            "
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors border"
            type="button"
            @click="activePlatform = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div
          v-if="filteredClients.length === 0"
          class="py-8 text-center text-xs text-fg-subtle border border-dashed border-line rounded-md"
        >
          {{ t('settings.clientEmptyPlatform') }}
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="(client, index) in filteredClients"
            :key="client.id"
            class="relative bg-transparent border border-line rounded-md p-4 shadow-none transition-colors hover:border-line-strong group"
          >
            <div class="flex items-start gap-3 min-w-0">
              <div
                class="h-11 w-11 rounded-md flex items-center justify-center text-xl shrink-0 bg-transparent text-fg-muted overflow-hidden border border-line"
              >
                <img
                  v-if="client.icon && (client.icon.includes('/') || client.icon.startsWith('data:'))"
                  :alt="client.name"
                  :src="client.icon"
                  class="w-full h-full object-cover rounded-md p-1"
                />
                <span v-else>{{ client.icon }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="text-sm font-semibold text-fg truncate pr-1">
                  {{ client.name }}
                </h4>
                <p class="text-xs text-fg-subtle truncate">
                  {{ client.description }}
                </p>
                <div class="flex flex-wrap gap-1 mt-2">
                  <span
                    v-for="p in client.platforms"
                    :key="p"
                    :class="getPlatformClass(p)"
                    class="px-1.5 py-0.5 text-[10px] rounded-md"
                  >
                    {{ platformOptions.find((opt) => opt.value === p)?.label || p }}
                  </span>
                </div>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 border-t border-line pt-3">
              <button
                :disabled="ordering || index === 0"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
                @click.stop="moveClient(client.id, -1)"
              >
                <ChevronUp class="w-3.5 h-3.5" />
                <span>{{ t('actions.moveUp') }}</span>
              </button>
              <button
                :disabled="ordering || index === filteredClients.length - 1"
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors disabled:opacity-40"
                @click.stop="moveClient(client.id, 1)"
              >
                <ChevronDown class="w-3.5 h-3.5" />
                <span>{{ t('actions.moveDown') }}</span>
              </button>
              <button
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-fg-muted hover:bg-hover hover:text-fg rounded-md transition-colors"
                @click.stop="handleEdit(client)"
              >
                <SquarePen class="w-3.5 h-3.5" />
                <span>{{ t('actions.edit') }}</span>
              </button>
              <button
                class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-line text-red-400 hover:border-red-900/60 hover:bg-red-950/40 rounded-md transition-colors"
                @click.stop="handleDelete(client.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>{{ t('actions.delete') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Modal
      v-model:show="showEditModal"
      :title="isNew ? t('settings.clientAddModalTitle') : t('settings.clientEditModalTitle')"
      size="5xl"
    >
      <template #body>
        <div class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
            <!-- Left Column: Visual Identity (30-40%) -->
            <div class="md:col-span-5 lg:col-span-4">
              <div class="bg-transparent rounded-md p-6 flex flex-col items-center gap-8 h-full border border-line">
                <div class="text-center space-y-3 w-full">
                  <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientIconPreview') }}</label>
                  <div
                    class="aspect-square w-full max-w-[180px] mx-auto rounded-md flex items-center justify-center text-6xl bg-inset text-fg-muted border border-line overflow-hidden shadow-none"
                  >
                    <img
                      v-if="
                        editingClient.icon &&
                        (editingClient.icon.includes('/') || editingClient.icon.startsWith('data:'))
                      "
                      :alt="editingClient.name"
                      :src="editingClient.icon"
                      class="w-full h-full object-cover rounded-md p-1"
                    />
                    <span v-else>{{ editingClient.icon || '?' }}</span>
                  </div>
                </div>

                <div class="w-full space-y-4 mt-2">
                  <div class="space-y-2">
                    <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientLocalIcon') }}</label>
                    <input
                      ref="iconFileInput"
                      accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp"
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
                        <span>{{
                          uploadingIcon ? t('settings.clientUploading') : t('settings.clientUploadImage')
                        }}</span>
                      </button>
                      <button
                        v-if="editingClient.icon"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 bg-transparent border border-line rounded-md hover:border-red-900/60 hover:bg-red-950/40 transition-colors"
                        type="button"
                        @click="clearIcon"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                        <span>{{ t('actions.clearAll') }}</span>
                      </button>
                    </div>
                    <p class="text-xs text-center text-fg-subtle">
                      {{ t('settings.clientIconSupportHint') }}
                    </p>
                    <p v-if="isDataIcon" class="text-xs text-center text-fg-muted">
                      {{ t('settings.clientUsingLocalIcon') }}
                    </p>
                  </div>
                  <div class="space-y-2">
                    <label class="block text-xs font-medium text-fg-muted">URL / Emoji</label>
                    <div class="relative rounded-md">
                      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span class="text-fg-subtle sm:text-xs font-mono">URL</span>
                      </div>
                      <input
                        v-model="iconInputValue"
                        :placeholder="t('settings.clientIconPlaceholder')"
                        class="block w-full pl-11 pr-3 rounded-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs py-2"
                        type="text"
                      />
                    </div>
                    <p class="text-xs text-center text-fg-subtle">
                      {{ t('settings.clientIconInputHint') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Form Details (60-70%) -->
            <div class="md:col-span-7 lg:col-span-8 flex flex-col gap-6">
              <!-- Basic Info -->
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-fg-muted"
                    >{{ t('settings.clientName') }} <span class="text-red-400">*</span></label
                  >
                  <input
                    v-model="editingClient.name"
                    :placeholder="t('settings.clientNamePlaceholder')"
                    class="mt-1 block w-full rounded-md border border-line bg-inset text-fg shadow-none focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-sm px-3 py-2 font-medium"
                    type="text"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientDescription') }}</label>
                  <Textarea
                    v-model="editingClient.description"
                    :placeholder="t('settings.clientDescriptionPlaceholder')"
                    class="sm:text-sm px-3 py-2 resize-none"
                    rows="3"
                    wrapperClass="mt-1"
                  />
                </div>
              </div>

              <!-- Platforms Grid -->
              <div>
                <label class="block text-xs font-medium text-fg-muted mb-2">{{ t('settings.clientPlatforms') }}</label>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  <label
                    v-for="opt in platformOptions"
                    :key="opt.value"
                    :class="
                      editingClient.platforms.includes(opt.value)
                        ? 'bg-elevated-card border-line-strong text-fg'
                        : 'bg-transparent border-line text-fg-subtle hover:bg-hover hover:text-fg-muted'
                    "
                    class="cursor-pointer group relative flex flex-col items-center justify-center p-2.5 rounded-md border transition-colors select-none text-center font-mono"
                  >
                    <input v-model="editingClient.platforms" :value="opt.value" class="hidden" type="checkbox" />
                    <span class="text-xs font-medium">{{ opt.label }}</span>
                    <div
                      v-if="editingClient.platforms.includes(opt.value)"
                      class="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-500 rounded-full"
                    ></div>
                  </label>
                </div>
              </div>

              <!-- Links -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                <div>
                  <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientDownloadUrl') }}</label>
                  <div class="mt-1 flex rounded-md shadow-none">
                    <span
                      class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-line bg-elevated-card text-fg-subtle font-mono text-xs"
                      >URL</span
                    >
                    <input
                      v-model="editingClient.url"
                      :aria-label="t('settings.clientDownloadUrl')"
                      class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
                      placeholder="https://..."
                      type="text"
                    />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-fg-muted">GitHub Repo</label>
                  <div class="mt-1 flex rounded-md shadow-none">
                    <span
                      class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-line bg-elevated-card text-fg-subtle sm:text-xs"
                    >
                      <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          clip-rule="evenodd"
                          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                          fill-rule="evenodd"
                        />
                      </svg>
                    </span>
                    <input
                      v-model="editingClient.repo"
                      :aria-label="t('settings.clientRepoLabel')"
                      class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
                      placeholder="owner/repo"
                      type="text"
                    />
                  </div>
                  <p class="mt-1 text-xs text-fg-subtle">
                    {{ t('settings.clientRepoHint') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 text-xs font-medium text-fg-muted bg-transparent border border-line rounded-md hover:bg-hover hover:text-fg"
            @click="showEditModal = false"
          >
            {{ t('actions.cancel') }}
          </button>
          <button
            :disabled="saving"
            class="px-4 py-1.5 text-xs font-semibold text-accent-fg bg-accent border border-accent rounded-md hover:opacity-90 disabled:opacity-50"
            @click="handleSave"
          >
            {{ saving ? t('settings.saving') : t('actions.save') }}
          </button>
        </div>
      </template>
    </Modal>

    <!-- Reset Confirmation Modal -->
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
          <div class="flex items-center gap-2.5 text-fg bg-transparent p-3 rounded-md border border-line">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
            <p class="text-xs font-medium">{{ t('settings.clientDangerWarning') }}</p>
          </div>
          <p class="text-xs text-fg-muted">
            {{ t('settings.clientResetConfirmQuestion') }}
            <br />
            {{ t('settings.clientResetConfirmDesc') }}
          </p>
        </div>
      </template>
    </Modal>

    <!-- Delete Confirmation Modal -->
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
          <div class="flex items-center gap-2.5 text-fg bg-transparent p-3 rounded-md border border-line">
            <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
            <p class="text-xs font-medium">{{ t('settings.clientDangerWarning') }}</p>
          </div>
          <p class="text-xs text-fg-muted">
            {{ t('settings.clientDeleteConfirmQuestion') }}
          </p>
        </div>
      </template>
    </Modal>
  </div>
</template>
