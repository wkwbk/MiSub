<script setup lang="ts">
import { computed } from 'vue';
import { Monitor } from '@lucide/vue';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { useI18n } from '@/i18n/index.js';
import Textarea from '@/components/ui/Textarea.vue';
import ResourceCollectionCard from '@/components/settings/ResourceCollectionCard.vue';
import {
  CLIENT_PLATFORMS,
  DEFAULT_PUBLIC_CLIENTS_CONFIG,
  normalizePublicClientsConfig,
  resolvePublicClientIcon,
} from '@misub/core/domain/default-public-clients.js';

interface CollectionClientItem {
  id: string;
  name?: string;
  icon?: string;
  description?: string;
  platforms: string[];
  url?: string;
  repo?: string | null;
  enabled?: boolean;
  [key: string]: unknown;
}

const { t } = useI18n();

const platformOptions = CLIENT_PLATFORMS.map((p) => ({
  ...p,
  class: 'border border-line bg-transparent text-fg-muted font-mono',
}));

const platformTabs = computed(() => [
  { value: 'all', label: t('publicProfiles.allCategories') },
  ...platformOptions.map((opt) => ({
    value: opt.value,
    label: opt.label,
  })),
]);

const labels = computed(() => ({
  resetBtn: t('settings.clientResetDefault'),
  addBtn: t('settings.clientAdd'),
  emptyText: t('settings.clientEmptyPlatform'),
  addModalTitle: t('settings.clientAddModalTitle'),
  editModalTitle: t('settings.clientEditModalTitle'),
  resetConfirmQuestion: t('settings.clientResetConfirmQuestion'),
  resetConfirmDesc: t('settings.clientResetConfirmDesc'),
  deleteConfirmQuestion: t('settings.clientDeleteConfirmQuestion'),
  fetchErrorText: t('settings.clientFetchFailed'),
  saveErrorText: t('settings.clientSaveFailed'),
  saveErrorFormatter: (message: string) => t('settings.clientSaveFailedWithMessage', { message }),
}));

const filterItem = (client: CollectionClientItem, activeTab: string): boolean =>
  Array.isArray(client.platforms) && client.platforms.includes(activeTab);

const createNewItem = (activeTab: string): CollectionClientItem => ({
  id: '',
  name: '',
  icon: '',
  description: '',
  platforms: activeTab === 'all' ? [] : [activeTab],
  url: '',
  repo: '',
  enabled: true,
});

const prepareEditItem = (client: CollectionClientItem): CollectionClientItem => ({
  ...client,
  platforms: Array.isArray(client.platforms) ? client.platforms : [],
});

const validateAndBuildItem = (
  editingClient: CollectionClientItem,
): { item: CollectionClientItem; error?: undefined } | { error: string; item?: undefined } => {
  const name = String(editingClient.name || '').trim();
  if (!name) return { error: t('settings.clientNameRequired') };

  return {
    item: {
      ...editingClient,
      id: editingClient.id || `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      description: String(editingClient.description || '').trim(),
      url: String(editingClient.url || '').trim(),
      repo: editingClient.repo ? String(editingClient.repo).trim() : null,
      icon: String(editingClient.icon || '').trim(),
      platforms: Array.isArray(editingClient.platforms) ? editingClient.platforms : [],
      enabled: editingClient.enabled !== false,
    },
  };
};

const getPlatformClass = (platform: string): string => {
  const option = platformOptions.find((opt) => opt.value === platform);
  return option ? option.class : 'border border-line bg-transparent text-fg-muted font-mono';
};
</script>

<template>
  <ResourceCollectionCard
    :create-new-item="createNewItem"
    :default-config="DEFAULT_PUBLIC_CLIENTS_CONFIG"
    :description="t('settings.clientManagerDesc')"
    :endpoint="API_ENDPOINTS.CLIENTS"
    :filter-item="filterItem"
    :icon-placeholder="t('settings.clientIconPlaceholder')"
    :labels="labels"
    :normalize-config="normalizePublicClientsConfig as any"
    :prepare-edit-item="prepareEditItem"
    :resolve-icon="resolvePublicClientIcon"
    :tabs="platformTabs"
    :title="t('settings.clientManagerTitle')"
    :validate-and-build-item="validateAndBuildItem"
    fallback-emoji="💻"
    tone="blue"
  >
    <template #icon>
      <Monitor class="h-4 w-4" />
    </template>

    <template #badges="{ item }">
      <div v-if="item.platforms && item.platforms.length > 0" class="flex flex-wrap gap-1 mt-1.5">
        <span
          v-for="p in item.platforms"
          :key="p"
          :class="getPlatformClass(p)"
          class="px-1.5 py-0.5 text-xs rounded-md"
        >
          {{ platformOptions.find((opt) => opt.value === p)?.label || p }}
        </span>
      </div>
    </template>

    <template #form="{ editingItem }">
      <div>
        <label class="block text-xs font-medium text-fg-muted"
          >{{ t('settings.clientName') }} <span class="text-red-400">*</span></label
        >
        <input
          v-model="editingItem.name"
          :placeholder="t('settings.clientNamePlaceholder')"
          class="mt-1 block w-full rounded-md border border-line bg-inset text-fg shadow-none focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-sm px-3 py-2 font-medium"
          type="text"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-fg-muted mb-2">{{ t('settings.clientPlatforms') }}</label>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label
            v-for="opt in platformOptions"
            :key="opt.value"
            :class="
              editingItem.platforms.includes(opt.value)
                ? 'bg-elevated-card border-line-strong text-fg'
                : 'bg-transparent border-line text-fg-subtle hover:bg-hover hover:text-fg-muted'
            "
            class="cursor-pointer group relative flex flex-col items-center justify-center p-2 rounded-md border transition-colors select-none text-center font-mono"
          >
            <input v-model="editingItem.platforms" :value="opt.value" class="hidden" type="checkbox" />
            <span class="text-xs font-medium">{{ opt.label }}</span>
            <div
              v-if="editingItem.platforms.includes(opt.value)"
              class="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-500 rounded-full"
            ></div>
          </label>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientDownloadUrl') }}</label>
          <div class="mt-1 flex rounded-md shadow-none">
            <span
              class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-line bg-elevated-card text-fg-subtle font-mono text-xs"
              >URL</span
            >
            <input
              v-model="editingItem.url"
              :aria-label="t('settings.clientDownloadUrl')"
              class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
              placeholder="https://..."
              type="text"
            />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientRepoLabel') }}</label>
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
              v-model="editingItem.repo"
              :aria-label="t('settings.clientRepoLabel')"
              class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
              placeholder="owner/repo"
              type="text"
            />
          </div>
          <p class="mt-1 text-xs text-fg-muted">
            {{ t('settings.clientRepoHint') }}
          </p>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-fg-muted">{{ t('settings.clientDescription') }}</label>
        <Textarea
          v-model="editingItem.description"
          :placeholder="t('settings.clientDescriptionPlaceholder')"
          class="sm:text-sm px-3 py-2 resize-none"
          rows="3"
          wrapperClass="mt-1"
        />
      </div>
    </template>
  </ResourceCollectionCard>
</template>
