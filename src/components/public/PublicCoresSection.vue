<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { api } from '@/lib/http.js';
import {
  normalizePublicCoresConfig,
  PUBLIC_CORE_CATEGORIES,
  resolvePublicCoreIcon,
} from '@shared/default-public-cores.js';

const props = defineProps({
  publicCores: {
    type: Object,
    default: () => ({}),
  },
  formatReleaseUpdatedLabel: {
    type: Function,
    default: () => '',
  },
  formatReleaseUpdatedTitle: {
    type: Function,
    default: () => '',
  },
});

const { t } = useI18n();

const publicCoresConfig = computed(() => normalizePublicCoresConfig(props.publicCores));
const enabledPublicCores = computed(() =>
  publicCoresConfig.value.enabled ? (publicCoresConfig.value.items || []).filter((item) => item.enabled !== false) : [],
);

const activeCoreCategory = ref('all');
const availableCoreCategories = computed(() => {
  const present = new Set(enabledPublicCores.value.map((item) => item.category || 'other'));
  const dynamicTabs = PUBLIC_CORE_CATEGORIES.filter((cat) => present.has(cat.value)).map((cat) => ({
    value: cat.value,
    label: t(cat.labelKey),
  }));
  return [{ value: 'all', label: t('publicProfiles.allCategories') }, ...dynamicTabs];
});

const displayedPublicCores = computed(() => {
  if (activeCoreCategory.value === 'all') return enabledPublicCores.value;
  return enabledPublicCores.value.filter((item) => (item.category || 'other') === activeCoreCategory.value);
});

const getCoreCategoryLabel = (category) => {
  const found = PUBLIC_CORE_CATEGORIES.find((cat) => cat.value === category);
  return found ? t(found.labelKey) : category || t('publicCores.categories.other');
};

const getLinkHostname = (rawUrl) => {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl || '';
  }
};

const extractGithubRepo = (item) => {
  if (item?.repo && /^[\w\-.]+\/[\w\-.]+$/.test(item.repo)) {
    return item.repo;
  }
  if (!item?.url) return null;
  try {
    const parsed = new URL(item.url);
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
      return null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    const slug = `${owner}/${repo}`;
    return /^[\w\-.]+\/[\w\-.]+$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
};

const coreReleases = ref({});
const fetchedCoreRepos = new Set();

const fetchCoreReleases = async (cores = []) => {
  cores.forEach(async (core) => {
    const repo = extractGithubRepo(core);
    if (!repo || fetchedCoreRepos.has(repo)) return;
    fetchedCoreRepos.add(repo);
    try {
      const data = await api.get(`/api/github/release?repo=${repo}`);
      if (data?.tag_name || data?.published_at) {
        coreReleases.value = {
          ...coreReleases.value,
          [repo]: {
            version: data.tag_name || '',
            publishedAt: data.published_at || '',
          },
        };
      }
    } catch (e) {
      console.warn(`Failed to fetch release info for ${core.name}`, e);
    }
  });
};

const getCoreVersionLabel = (core) => {
  const repo = extractGithubRepo(core);
  const version = repo ? coreReleases.value[repo]?.version : '';
  return version || getLinkHostname(core.url);
};

const getCoreUpdatedLabel = (core) => {
  const repo = extractGithubRepo(core);
  return repo ? props.formatReleaseUpdatedLabel(coreReleases.value[repo]?.publishedAt) : '';
};

const getCoreUpdatedTitle = (core) => {
  const repo = extractGithubRepo(core);
  return repo ? props.formatReleaseUpdatedTitle(coreReleases.value[repo]?.publishedAt) : '';
};

watch(
  enabledPublicCores,
  (cores) => {
    if (cores.length > 0) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(() => fetchCoreReleases(cores), { timeout: 2000 });
      } else {
        setTimeout(() => fetchCoreReleases(cores), 300);
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="enabledPublicCores.length > 0"
    class="mt-16 pt-12 pb-2 border-t border-line bg-transparent"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8 relative">
        <div class="relative inline-flex flex-col items-center">
          <span class="font-mono text-xs font-semibold tracking-widest text-fg-muted uppercase mb-2">{{
            t('publicProfiles.coresEyebrow')
          }}</span>
          <h2 class="text-2xl md:text-3xl font-bold text-fg tracking-tight">
            {{ t('publicProfiles.coresTitle') }}
          </h2>
          <p class="mt-2 text-sm text-fg-muted max-w-2xl mx-auto">
            {{ t('publicProfiles.coresDescription') }}
          </p>
        </div>
      </div>

      <div v-if="availableCoreCategories.length > 2" class="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button
          v-for="tab in availableCoreCategories"
          :key="tab.value"
          :class="
            activeCoreCategory === tab.value
              ? 'bg-accent text-accent-fg border-accent font-semibold'
              : 'bg-surface text-fg-muted border-line hover:border-line-strong hover:text-fg'
          "
          class="px-3.5 py-1.5 rounded-md font-mono text-xs font-medium transition-colors border"
          type="button"
          @click="activeCoreCategory = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="core in displayedPublicCores"
          :key="core.id || core.name"
          class="group relative bg-surface rounded-md p-5 hover:-translate-y-1 hover:z-10 border border-line transition-all duration-200"
        >
          <div class="flex items-start gap-4">
            <div
              class="h-10 w-10 rounded-md flex items-center justify-center text-xl shadow-none bg-transparent border border-line shrink-0 overflow-hidden"
            >
              <img
                v-if="
                  resolvePublicCoreIcon(core) &&
                  (resolvePublicCoreIcon(core).includes('/') ||
                    resolvePublicCoreIcon(core).startsWith('data:') ||
                    resolvePublicCoreIcon(core).startsWith('http'))
                "
                :alt="core.name"
                :src="resolvePublicCoreIcon(core)"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain rounded-md p-1"
              />
              <span v-else>{{ core.icon || core.name?.slice(0, 1) || '⚙️' }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <h3 class="text-sm font-semibold text-fg truncate">
                  {{ core.name }}
                </h3>
                <span
                  class="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] font-medium border border-line bg-transparent text-fg-muted shrink-0"
                >
                  {{ getCoreCategoryLabel(core.category) }}
                </span>
              </div>
              <div v-if="core.tags && core.tags.length > 0" class="flex flex-wrap gap-1 mb-2">
                <span
                  v-for="tag in core.tags"
                  :key="tag"
                  class="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] font-medium border border-line bg-transparent text-fg-muted"
                >
                  {{ tag }}
                </span>
              </div>
              <p class="text-fg-muted text-xs line-clamp-2 leading-relaxed h-9">
                {{ core.description }}
              </p>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-line">
            <div class="flex items-center gap-2 min-w-0">
              <span
                :title="getCoreVersionLabel(core)"
                class="font-mono text-xs text-fg-muted bg-transparent border border-line px-2 py-0.5 rounded-md truncate max-w-[140px] shrink-0"
              >
                {{ getCoreVersionLabel(core) }}
              </span>
              <span
                v-if="getCoreUpdatedLabel(core)"
                :title="getCoreUpdatedTitle(core)"
                class="font-mono text-[11px] text-fg-subtle truncate"
              >
                {{ getCoreUpdatedLabel(core) }}
              </span>
            </div>

            <a
              :href="core.url"
              class="font-mono text-xs font-semibold text-fg-muted hover:text-fg transition-colors flex items-center gap-1 group/link shrink-0"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ t('publicProfiles.viewRepo') }}
              <ArrowRight class="w-3.5 h-3.5 transform group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
