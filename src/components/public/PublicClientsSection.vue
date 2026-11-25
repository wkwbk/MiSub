<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowRight } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { api } from '@/lib/http.js';
import {
  CLIENT_PLATFORM_ORDER,
  CLIENT_PLATFORMS,
  normalizePublicClientsConfig,
  resolvePublicClientIcon,
} from '@misub/core/domain/default-public-clients.js';

const props = defineProps({
  publicClients: {
    type: [Object, Array],
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

const publicClientsConfig = computed(() => normalizePublicClientsConfig(props.publicClients));
const enabledPublicClients = computed(() =>
  publicClientsConfig.value.enabled
    ? (publicClientsConfig.value.items || []).filter((item) => item.enabled !== false)
    : [],
);

const getPlatformLabel = (p) => {
  const found = CLIENT_PLATFORMS.find((opt) => opt.value === p);
  return found ? found.label : p;
};

const activeClientPlatform = ref('all');
const availableClientPlatforms = computed(() => {
  const present = new Set();
  enabledPublicClients.value.forEach((client) => {
    (client.platforms || []).forEach((p) => present.add(p));
  });
  const dynamicTabs = CLIENT_PLATFORM_ORDER.filter((p) => present.has(p)).map((p) => ({
    value: p,
    label: getPlatformLabel(p),
  }));
  present.forEach((p) => {
    if (!CLIENT_PLATFORM_ORDER.includes(p)) {
      dynamicTabs.push({ value: p, label: getPlatformLabel(p) });
    }
  });
  return [{ value: 'all', label: t('publicProfiles.allCategories') }, ...dynamicTabs];
});

const displayedClients = computed(() => {
  if (activeClientPlatform.value === 'all') return enabledPublicClients.value;
  return enabledPublicClients.value.filter(
    (client) => Array.isArray(client.platforms) && client.platforms.includes(activeClientPlatform.value),
  );
});

const extractAppStoreInfo = (rawUrl) => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== 'apps.apple.com' && parsed.hostname !== 'itunes.apple.com') {
      return null;
    }
    const idMatch = parsed.pathname.match(/\/id(\d+)/i);
    if (!idMatch) return null;
    const countryMatch = parsed.pathname.match(/^\/([a-z]{2})\//i);
    return {
      id: idMatch[1],
      country: countryMatch ? countryMatch[1].toLowerCase() : 'us',
    };
  } catch {
    return null;
  }
};

const clientReleases = ref({});
const fetchedClientKeys = new Set();

const getReleaseKey = (client) => {
  if (client?.repo) return `gh:${client.repo}`;
  const appStore = extractAppStoreInfo(client?.url);
  if (appStore) return `as:${appStore.country}:${appStore.id}`;
  return '';
};

const fetchClientReleases = async (clients = []) => {
  clients.forEach(async (client) => {
    const key = getReleaseKey(client);
    if (!key || fetchedClientKeys.has(key)) return;
    fetchedClientKeys.add(key);

    let endpoint = '';
    if (client.repo) {
      endpoint = `/api/github/release?repo=${client.repo}`;
    } else {
      const appStore = extractAppStoreInfo(client.url);
      if (!appStore) return;
      endpoint = `/api/appstore/release?id=${appStore.id}&country=${appStore.country}`;
    }

    try {
      const data = await api.get(endpoint);
      if (data?.tag_name || data?.published_at) {
        clientReleases.value = {
          ...clientReleases.value,
          [key]: {
            version: data.tag_name || '',
            publishedAt: data.published_at || '',
          },
        };
      }
    } catch (e) {
      console.warn(`Failed to fetch version for ${client.name}`, e);
    }
  });
};

const getClientVersionLabel = (client) => {
  const key = getReleaseKey(client);
  const fetchedVersion = key ? clientReleases.value[key]?.version : '';
  if (fetchedVersion) return fetchedVersion;
  if (client.version) return client.version;
  if (!client.repo && client.platforms?.includes('ios')) return t('publicProfiles.appStoreVersion');
  return t('publicProfiles.stableVersion');
};

const getClientUpdatedLabel = (client) => {
  const key = getReleaseKey(client);
  const publishedAt = (key && clientReleases.value[key]?.publishedAt) || client?.publishedAt;
  return props.formatReleaseUpdatedLabel(publishedAt);
};

const getClientUpdatedTitle = (client) => {
  const key = getReleaseKey(client);
  const publishedAt = (key && clientReleases.value[key]?.publishedAt) || client?.publishedAt;
  return props.formatReleaseUpdatedTitle(publishedAt);
};

watch(
  enabledPublicClients,
  (clients) => {
    if (clients.length > 0) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(() => fetchClientReleases(clients), { timeout: 1500 });
      } else {
        setTimeout(() => fetchClientReleases(clients), 200);
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="enabledPublicClients.length > 0" class="mt-16 pt-12 pb-2 border-t border-line bg-transparent">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8 relative">
        <div class="relative inline-flex flex-col items-center">
          <span class="font-mono text-xs font-semibold tracking-widest text-fg-muted uppercase mb-2">{{
            t('publicProfiles.clientsEyebrow')
          }}</span>
          <h2 class="text-2xl md:text-3xl font-bold text-fg tracking-tight">
            {{ t('publicProfiles.clientsTitle') }}
          </h2>
          <p class="mt-2 text-sm text-fg-muted max-w-2xl mx-auto">
            {{ t('publicProfiles.clientsDescription') }}
          </p>
        </div>
      </div>

      <div v-if="availableClientPlatforms.length > 2" class="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button
          v-for="tab in availableClientPlatforms"
          :key="tab.value"
          :class="
            activeClientPlatform === tab.value
              ? 'bg-accent text-accent-fg border-accent font-semibold'
              : 'bg-surface text-fg-muted border-line hover:border-line-strong hover:text-fg'
          "
          class="px-3.5 py-1.5 rounded-md font-mono text-xs font-medium transition-colors border"
          type="button"
          @click="activeClientPlatform = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="client in displayedClients"
          :key="client.id || client.name"
          class="group relative bg-surface rounded-md p-5 hover:-translate-y-1 hover:z-10 border border-line transition-all duration-200"
        >
          <div class="flex items-start gap-4">
            <div
              class="h-10 w-10 rounded-md flex items-center justify-center text-xl shadow-none bg-transparent border border-line shrink-0 overflow-hidden"
            >
              <img
                v-if="
                  resolvePublicClientIcon(client) &&
                  (resolvePublicClientIcon(client).includes('/') ||
                    resolvePublicClientIcon(client).startsWith('data:') ||
                    resolvePublicClientIcon(client).startsWith('http'))
                "
                :alt="client.name"
                :src="resolvePublicClientIcon(client)"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain rounded-md p-1"
              />
              <span v-else>{{ client.icon || client.name?.slice(0, 1) || '💻' }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <h3 class="text-sm font-semibold text-fg truncate">
                  {{ client.name }}
                </h3>
              </div>
              <div v-if="client.platforms && client.platforms.length > 0" class="flex flex-wrap gap-1 mb-2">
                <span
                  v-for="platform in client.platforms"
                  :key="platform"
                  class="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-xs font-medium border border-line bg-transparent text-fg-muted"
                >
                  {{ getPlatformLabel(platform) }}
                </span>
              </div>
              <p class="text-fg-muted text-xs line-clamp-2 leading-relaxed h-9">
                {{ client.description }}
              </p>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-line">
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="font-mono text-xs text-fg-muted bg-transparent border border-line px-2 py-0.5 rounded-md shrink-0"
              >
                {{ getClientVersionLabel(client) }}
              </span>
              <span
                v-if="getClientUpdatedLabel(client)"
                :title="getClientUpdatedTitle(client)"
                class="font-mono text-xs text-fg-subtle truncate"
              >
                {{ getClientUpdatedLabel(client) }}
              </span>
            </div>

            <a
              :href="client.url"
              class="font-mono text-xs font-semibold text-fg-muted hover:text-fg transition-colors flex items-center gap-1 group/link shrink-0"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ t('publicProfiles.download') }}
              <ArrowRight class="w-3.5 h-3.5 transform group-hover/link:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
