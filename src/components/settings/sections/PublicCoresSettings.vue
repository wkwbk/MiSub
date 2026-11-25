<script setup lang="ts">
import { computed } from 'vue';
import { Cpu } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import Textarea from '@/components/ui/Textarea.vue';
import ResourceCollectionCard from '@/components/settings/ResourceCollectionCard.vue';
import {
  DEFAULT_PUBLIC_CORES_CONFIG,
  normalizeCoreTags,
  normalizePublicCoresConfig,
  PUBLIC_CORE_CATEGORIES,
  resolvePublicCoreIcon,
} from '@misub/core/domain/default-public-cores.js';

interface CollectionCoreItem {
  id: string;
  name?: string;
  category?: string;
  tags?: string[];
  _tagsInput?: string;
  description?: string;
  url?: string;
  icon?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

const { t } = useI18n();

const categoryTabs = computed(() => [
  { value: 'all', label: t('publicProfiles.allCategories') },
  ...PUBLIC_CORE_CATEGORIES.map((cat) => ({
    value: cat.value,
    label: t(cat.labelKey),
  })),
]);

const labels = computed(() => ({
  resetBtn: t('publicCores.resetDefault'),
  addBtn: t('publicCores.addCore'),
  emptyText: t('publicCores.emptyCategory'),
  addModalTitle: t('publicCores.addModalTitle'),
  editModalTitle: t('publicCores.editModalTitle'),
  resetConfirmQuestion: t('publicCores.resetConfirmQuestion'),
  resetConfirmDesc: t('publicCores.resetConfirmDesc'),
  deleteConfirmQuestion: t('publicCores.deleteConfirmQuestion'),
}));

const getCategoryLabel = (category: unknown): string => {
  const catValue = typeof category === 'string' ? category : '';
  const found = PUBLIC_CORE_CATEGORIES.find((c) => c.value === catValue);
  return found ? t(found.labelKey) : catValue || t('publicCores.categories.other');
};

const normalizeCoreUrl = (rawUrl: unknown): string => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const filterItem = (item: CollectionCoreItem, activeTab: string): boolean => item.category === activeTab;

const createNewItem = (activeTab: string): CollectionCoreItem => ({
  id: '',
  name: '',
  category: activeTab === 'all' ? 'multipurpose' : activeTab,
  tags: [],
  _tagsInput: '',
  description: '',
  url: '',
  icon: '',
  enabled: true,
});

const prepareEditItem = (core: CollectionCoreItem): CollectionCoreItem => ({
  ...core,
  category: core.category || 'other',
  _tagsInput: normalizeCoreTags(core.tags).join(', '),
});

const validateAndBuildItem = (
  editingCore: CollectionCoreItem,
): { item: CollectionCoreItem; error?: undefined } | { error: string; item?: undefined } => {
  const name = String(editingCore.name || '').trim();
  if (!name) return { error: t('publicCores.nameRequired') };

  const normalizedUrl = normalizeCoreUrl(editingCore.url);
  if (!normalizedUrl) return { error: t('publicCores.urlRequired') };

  try {
    const parsed = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: t('publicCores.invalidUrl') };
    }
  } catch {
    return { error: t('publicCores.invalidUrl') };
  }

  const { _tagsInput, ...rest } = editingCore;
  return {
    item: {
      ...rest,
      id: editingCore.id || `core-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: editingCore.category || 'other',
      tags: normalizeCoreTags(_tagsInput),
      description: String(editingCore.description || '').trim(),
      url: normalizedUrl,
      icon: String(editingCore.icon || '').trim(),
      enabled: editingCore.enabled !== false,
    },
  };
};
</script>

<template>
  <ResourceCollectionCard
    :create-new-item="createNewItem"
    :default-config="DEFAULT_PUBLIC_CORES_CONFIG"
    :description="t('publicCores.managerDesc')"
    :filter-item="filterItem"
    :get-category-badge="(item) => getCategoryLabel(item.category)"
    :icon-placeholder="t('publicCores.iconPlaceholder')"
    :labels="labels"
    :normalize-config="normalizePublicCoresConfig"
    :prepare-edit-item="prepareEditItem"
    :resolve-icon="resolvePublicCoreIcon"
    :tabs="categoryTabs"
    :title="t('publicCores.managerTitle')"
    :validate-and-build-item="validateAndBuildItem"
    endpoint="/api/public_cores"
    fallback-emoji="⚙️"
    tone="emerald"
  >
    <template #icon>
      <Cpu class="h-4 w-4" />
    </template>

    <template #badges="{ item }">
      <div v-if="item.tags && item.tags.length > 0" class="flex flex-wrap gap-1 mt-1.5">
        <span
          v-for="tag in item.tags"
          :key="tag"
          class="px-1.5 py-0.5 text-xs rounded-md border border-line bg-elevated-card text-fg-muted font-mono"
        >
          {{ tag }}
        </span>
      </div>
    </template>

    <template #form="{ editingItem }">
      <div>
        <label class="block text-xs font-medium text-fg-muted">
          {{ t('publicCores.nameLabel') }}
          <span class="text-red-400">*</span>
        </label>
        <input
          v-model="editingItem.name"
          :placeholder="t('publicCores.namePlaceholder')"
          class="mt-1 block w-full rounded-md border border-line bg-inset text-fg shadow-none focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-sm px-3 py-2 font-medium"
          type="text"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-fg-muted mb-2">
          {{ t('publicCores.categoryLabel') }}
        </label>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            v-for="cat in PUBLIC_CORE_CATEGORIES"
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
          {{ t('publicCores.tagsLabel') }}
        </label>
        <input
          v-model="editingItem._tagsInput"
          :placeholder="t('publicCores.tagsPlaceholder')"
          class="mt-1 block w-full rounded-md border border-line bg-inset text-fg font-mono shadow-none focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs px-3 py-2"
          type="text"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-fg-muted">
          {{ t('publicCores.urlLabel') }}
          <span class="text-red-400">*</span>
        </label>
        <div class="mt-1 flex rounded-md shadow-none">
          <span
            class="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-line bg-elevated-card text-fg-subtle font-mono text-xs"
            >URL</span
          >
          <input
            v-model="editingItem.url"
            :placeholder="t('publicCores.urlPlaceholder')"
            class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-line bg-inset text-fg font-mono focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong sm:text-xs"
            type="text"
          />
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-fg-muted">
          {{ t('publicCores.descriptionLabel') }}
        </label>
        <Textarea
          v-model="editingItem.description"
          :placeholder="t('publicCores.descriptionPlaceholder')"
          class="sm:text-sm px-3 py-2 resize-none"
          rows="3"
          wrapperClass="mt-1"
        />
      </div>
    </template>
  </ResourceCollectionCard>
</template>
