<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import {
  normalizePublicLinksConfig,
  PUBLIC_LINK_CATEGORIES,
  resolvePublicLinkIcon,
  type PublicLinksConfig,
} from '@misub/core/domain/default-public-links.js';

const props = withDefaults(
  defineProps<{
    publicLinks?: PublicLinksConfig | Record<string, unknown>;
  }>(),
  {
    publicLinks: () => ({}),
  },
);

const { t } = useI18n();

const publicLinksConfig = computed(() => normalizePublicLinksConfig(props.publicLinks));
const enabledPublicLinks = computed(() =>
  publicLinksConfig.value.enabled ? (publicLinksConfig.value.items || []).filter((item) => item.enabled !== false) : [],
);

const activeLinkCategory = ref('all');
const availableLinkCategories = computed<Array<{ value: string; label: string }>>(() => {
  const present = new Set(enabledPublicLinks.value.map((item) => item.category || 'other'));
  const dynamicTabs = PUBLIC_LINK_CATEGORIES.filter((cat) => present.has(cat.value)).map((cat) => ({
    value: cat.value,
    label: t(cat.labelKey),
  }));
  return [{ value: 'all', label: t('publicProfiles.allCategories') }, ...dynamicTabs];
});

const displayedPublicLinks = computed(() => {
  if (activeLinkCategory.value === 'all') return enabledPublicLinks.value;
  return enabledPublicLinks.value.filter((item) => (item.category || 'other') === activeLinkCategory.value);
});

const getLinkCategoryLabel = (category?: string): string => {
  const found = PUBLIC_LINK_CATEGORIES.find((cat) => cat.value === category);
  return found ? t(found.labelKey) : category || t('publicLinks.categories.other');
};

const getLinkHostname = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl || '';
  }
};
</script>

<template>
  <div v-if="enabledPublicLinks.length > 0" class="mt-16 pt-12 pb-6 border-t border-line bg-transparent">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8 relative">
        <div class="relative inline-flex flex-col items-center">
          <span class="font-mono text-xs font-semibold tracking-widest text-fg-muted uppercase mb-2">{{
            t('publicProfiles.linksEyebrow')
          }}</span>
          <h2 class="text-2xl md:text-3xl font-bold text-fg tracking-tight">
            {{ t('publicProfiles.linksTitle') }}
          </h2>
          <p class="mt-2 text-sm text-fg-muted max-w-2xl mx-auto">
            {{ t('publicProfiles.linksDescription') }}
          </p>
        </div>
      </div>

      <div v-if="availableLinkCategories.length > 2" class="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button
          v-for="tab in availableLinkCategories"
          :key="tab.value"
          :class="
            activeLinkCategory === tab.value
              ? 'bg-accent text-accent-fg border-accent font-semibold'
              : 'bg-surface text-fg-muted border-line hover:border-line-strong hover:text-fg'
          "
          class="px-3.5 py-1.5 rounded-md font-mono text-xs font-medium transition-colors border"
          type="button"
          @click="activeLinkCategory = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-4">
        <div
          v-for="link in displayedPublicLinks"
          :key="link.id || link.name"
          class="group relative flex h-full flex-col bg-surface rounded-md p-5 hover:-translate-y-1 hover:z-10 border border-line transition-all duration-200"
        >
          <div class="flex items-start gap-4 pb-4">
            <div
              class="h-10 w-10 rounded-md flex items-center justify-center text-xl shadow-none bg-transparent border border-line shrink-0 overflow-hidden"
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
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain rounded-md p-1"
              />
              <span v-else>{{ link.icon || link.name?.slice(0, 1) || '🌐' }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <h3 class="text-sm font-semibold text-fg truncate">
                  {{ link.name }}
                </h3>
                <span
                  class="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-xs font-medium border border-line bg-transparent text-fg-muted shrink-0"
                >
                  {{ getLinkCategoryLabel(link.category) }}
                </span>
              </div>
              <p class="text-fg-muted text-xs line-clamp-2 leading-relaxed h-9">
                {{ link.description }}
              </p>
            </div>
          </div>

          <div class="mt-auto flex items-center justify-between pt-3 border-t border-line">
            <span
              class="font-mono text-xs text-fg-muted bg-transparent border border-line px-2 py-0.5 rounded-md truncate max-w-[60%]"
            >
              {{ getLinkHostname(link.url) }}
            </span>

            <a
              :href="link.url"
              class="font-mono text-xs font-semibold text-fg-muted hover:text-fg transition-colors flex items-center gap-1 group/link shrink-0"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ t('publicProfiles.visitSite') }}
              <ArrowRight class="w-3.5 h-3.5 transform group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
