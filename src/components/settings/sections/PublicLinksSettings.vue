<script setup lang="ts">
import { computed } from 'vue';
import { Compass } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import Textarea from '@/components/ui/Textarea.vue';
import ResourceCollectionCard from '@/components/settings/ResourceCollectionCard.vue';
import { normalizeWebsiteUrl } from '@/utils/url-origin.js';
import {
  DEFAULT_PUBLIC_LINKS_CONFIG,
  normalizePublicLinksConfig,
  PUBLIC_LINK_CATEGORIES,
  resolvePublicLinkIcon,
} from '@misub/core/domain/default-public-links.js';

interface CollectionLinkItem {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  url?: string;
  icon?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

const { t } = useI18n();

const categoryTabs = computed(() => [
  { value: 'all', label: t('publicProfiles.allCategories') },
  ...PUBLIC_LINK_CATEGORIES.map((cat) => ({
    value: cat.value,
    label: t(cat.labelKey),
  })),
]);

const labels = computed(() => ({
  resetBtn: t('publicLinks.resetDefault'),
  addBtn: t('publicLinks.addLink'),
  emptyText: t('publicLinks.emptyCategory'),
  addModalTitle: t('publicLinks.addModalTitle'),
  editModalTitle: t('publicLinks.editModalTitle'),
  resetConfirmQuestion: t('publicLinks.resetConfirmQuestion'),
  resetConfirmDesc: t('publicLinks.resetConfirmDesc'),
  deleteConfirmQuestion: t('publicLinks.deleteConfirmQuestion'),
}));

const getCategoryLabel = (category: unknown): string => {
  const catValue = typeof category === 'string' ? category : '';
  const found = PUBLIC_LINK_CATEGORIES.find((c) => c.value === catValue);
  return found ? t(found.labelKey) : catValue || t('publicLinks.categories.other');
};

const filterItem = (item: CollectionLinkItem, activeTab: string): boolean => item.category === activeTab;

const createNewItem = (activeTab: string): CollectionLinkItem => ({
  id: '',
  name: '',
  category: activeTab === 'all' ? 'speedtest' : activeTab,
  description: '',
  url: '',
  icon: '',
  enabled: true,
});

const prepareEditItem = (link: CollectionLinkItem): CollectionLinkItem => ({
  ...link,
  category: link.category || 'other',
});

const validateAndBuildItem = (
  editingLink: CollectionLinkItem,
): { item: CollectionLinkItem; error?: undefined } | { error: string; item?: undefined } => {
  const name = String(editingLink.name || '').trim();
  if (!name) return { error: t('publicLinks.nameRequired') };

  const normalizedUrl = normalizeWebsiteUrl(editingLink.url);
  if (!normalizedUrl) return { error: t('publicLinks.urlRequired') };

  try {
    const parsed = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: t('publicLinks.invalidUrl') };
    }
  } catch {
    return { error: t('publicLinks.invalidUrl') };
  }

  return {
    item: {
      ...editingLink,
      id: editingLink.id || `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: editingLink.category || 'other',
      description: String(editingLink.description || '').trim(),
      url: normalizedUrl,
      icon: String(editingLink.icon || '').trim(),
      enabled: editingLink.enabled !== false,
    },
  };
};
</script>

<template>
  <ResourceCollectionCard
    :create-new-item="createNewItem"
    :default-config="DEFAULT_PUBLIC_LINKS_CONFIG"
    :description="t('publicLinks.managerDesc')"
    :filter-item="filterItem"
    :get-category-badge="(item) => getCategoryLabel(item.category)"
    :icon-placeholder="t('settings.clientIconPlaceholder')"
    :labels="labels"
    :normalize-config="normalizePublicLinksConfig"
    :prepare-edit-item="prepareEditItem"
    :resolve-icon="resolvePublicLinkIcon"
    :tabs="categoryTabs"
    :title="t('publicLinks.managerTitle')"
    :validate-and-build-item="validateAndBuildItem"
    endpoint="/api/public_links"
    fallback-emoji="🌐"
    tone="blue"
  >
    <template #icon>
      <Compass class="h-4 w-4" />
    </template>

    <template #form="{ editingItem }">
      <div>
        <label class="block text-xs font-medium text-fg-muted">
          {{ t('publicLinks.nameLabel') }}
          <span class="text-red-400">*</span>
        </label>
        <input
          v-model="editingItem.name"
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
              editingItem.category === cat.value
                ? 'bg-elevated-card border-line-strong text-fg'
                : 'bg-transparent border-line text-fg-subtle hover:bg-hover hover:text-fg-muted'
            "
            class="p-2 rounded-md border text-xs font-medium transition-colors text-center"
            type="button"
            @click="editingItem.category = cat.value"
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
            v-model="editingItem.url"
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
          v-model="editingItem.description"
          :placeholder="t('publicLinks.descriptionPlaceholder')"
          class="sm:text-sm px-3 py-2 resize-none"
          rows="3"
          wrapperClass="mt-1"
        />
      </div>
    </template>
  </ResourceCollectionCard>
</template>
