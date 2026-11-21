<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useToastStore } from '@/stores/toast.js';
import { hasStoredLocale, useI18n } from '@/i18n/index.js';
import { api } from '@/lib/http.js';
import ProfileGrid from '@/components/public/ProfileGrid.vue';
import PublicCoresSection from '@/components/public/PublicCoresSection.vue';
import PublicLinksSection from '@/components/public/PublicLinksSection.vue';
import { AlertTriangle, ArrowRight } from '@lucide/vue';
import { parseCustomPageSource } from '@/utils/custom-page-source.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const isDev = import.meta.env.DEV;

const NodePreviewModal = defineAsyncComponent(() => import('@/components/modals/NodePreview/NodePreviewModal.vue'));
const AnnouncementCard = defineAsyncComponent(() => import('@/components/public/AnnouncementCard.vue'));
const GuestbookModal = defineAsyncComponent(() => import('@/components/modals/GuestbookModal.vue'));
const QuickImportModal = defineAsyncComponent(() => import('@/components/modals/QuickImportModal.vue'));
const CustomPublicRenderer = defineAsyncComponent(() => import('@/components/public/CustomPublicRenderer.vue'));

const publicProfiles = ref([]);
const loading = ref(true);
const error = ref(null);
const { showToast } = useToastStore();
const { t, setLocale } = useI18n();
const config = ref({});
const announcement = computed(() => config.value.announcement);
const heroConfig = computed(
  () =>
    config.value.hero || {
      title1: t('publicProfiles.heroTitle1'),
      title2: t('publicProfiles.heroTitle2'),
      description: t('publicProfiles.heroDescription'),
    },
);
const guestbookConfig = computed(() => config.value.guestbook || {});
const customPageConfig = computed(() => config.value.customPage || {});
const parsedCustomPageSource = computed(() =>
  parseCustomPageSource(customPageConfig.value.content || '', customPageConfig.value.css || ''),
);
const isInitialLoading = computed(
  () =>
    loading.value && !error.value && publicProfiles.value.length === 0 && Object.keys(config.value || {}).length === 0,
);

const initialDocumentTitle = typeof document !== 'undefined' ? document.title : '';
const initialDescription =
  typeof document !== 'undefined'
    ? document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
    : '';

const ensureDescriptionMeta = () => {
  if (typeof document === 'undefined') return null;
  let el = document.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'description');
    document.head.appendChild(el);
  }
  return el;
};

const applyCustomPageDocumentMeta = () => {
  if (typeof document === 'undefined') return;
  if (customPageConfig.value.enabled !== true) return;

  const parsed = parsedCustomPageSource.value;
  if (parsed.title) {
    document.title = parsed.title;
  }

  if (parsed.description) {
    const meta = ensureDescriptionMeta();
    meta?.setAttribute('content', parsed.description);
  }
};

const restoreCustomPageDocumentMeta = () => {
  if (typeof document === 'undefined') return;
  document.title = initialDocumentTitle;
  const meta = document.querySelector('meta[name="description"]');
  if (!meta) return;
  if (initialDescription) {
    meta.setAttribute('content', initialDescription);
  } else {
    meta.remove();
  }
};

const showGuestbookModal = ref(false);
const showQuickImportModal = ref(false);
const selectedProfileForImport = ref(null);

const handleGuestbookTrigger = () => {
  if (guestbookConfig.value && guestbookConfig.value.enabled === false) {
    showToast(t('publicProfiles.guestbookDisabled'), 'warning');
    return;
  }
  showGuestbookModal.value = true;
};

const handleGuestbookEvent = () => {
  handleGuestbookTrigger();
};

const fetchPublicProfiles = async () => {
  try {
    loading.value = true;
    error.value = null;
    const data = await api.get('/api/public/profiles');
    if (data.success) {
      publicProfiles.value = data.data;
      config.value = data.config || {};

      // 应用服务端默认显示语言（仅当访客未显式选择过语言时）
      const serverLocale = config.value.defaultLocale;
      if (serverLocale && !hasStoredLocale()) {
        setLocale(serverLocale);
      }
    } else {
      error.value = t('publicProfiles.fetchFailed');
    }
  } catch (err) {
    error.value = t('publicProfiles.fetchFailed');
    console.error('Fetch error:', err);
  } finally {
    loading.value = false;
  }
};

const copyLink = async (profile) => {
  const token = config.value.profileToken || 'profiles';
  const identifier = profile.customId || profile.id;
  const link = `${window.location.origin}/${token}/${identifier}`;

  const copied = await copyTextToClipboard(link);
  showToast(
    copied ? t('publicProfiles.linkCopied') : t('publicProfiles.copyFailedManual'),
    copied ? 'success' : 'error',
  );
};

const clients = ref([]);

const fetchClients = async () => {
  try {
    const data = await api.get('/api/clients');
    if (data.success && data.data && data.data.length > 0) {
      clients.value = data.data;
    }
  } catch (e) {
    // 客户端列表属辅助信息（推荐下载），失败时保持该区块为空即可，不必打扰访客；
    // 核心订阅数据由 loadProfiles 单独处理并向访客提示。
    console.error('Failed to fetch clients', e);
  }
};

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

const fetchClientVersions = async () => {
  clients.value.forEach(async (client) => {
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
      if (data) {
        if (data.tag_name) {
          client.version = data.tag_name;
        }
        if (data.published_at) {
          client.publishedAt = data.published_at;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch version for ${client.name}`, e);
    }
  });
};

const getPlatformLabel = (p) => {
  const map = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    android: 'Android',
    ios: 'iOS',
    HarmonyOS: 'HarmonyOS',
  };
  return map[p] || p;
};

const CLIENT_PLATFORM_ORDER = ['windows', 'macos', 'linux', 'android', 'ios', 'HarmonyOS'];
const activeClientPlatform = ref('all');
const availableClientPlatforms = computed(() => {
  const present = new Set();
  clients.value.forEach((client) => {
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
  if (activeClientPlatform.value === 'all') return clients.value;
  return clients.value.filter(
    (client) => Array.isArray(client.platforms) && client.platforms.includes(activeClientPlatform.value),
  );
});

const getClientVersionLabel = (client) => {
  if (client.version) return client.version;
  if (!client.repo && client.platforms?.includes('ios')) return t('publicProfiles.appStoreVersion');
  return t('publicProfiles.stableVersion');
};

const RECENT_UPDATE_DAYS = 7;

const parsePublishedDate = (publishedAt) => {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatReleaseUpdatedLabel = (publishedAt) => {
  const publishedDate = parsePublishedDate(publishedAt);
  if (!publishedDate) return '';

  const diffMs = Date.now() - publishedDate.getTime();
  if (diffMs >= 0) {
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return t('publicProfiles.updatedToday');
    if (diffDays <= RECENT_UPDATE_DAYS) {
      return t('publicProfiles.updatedDaysAgo', { days: diffDays });
    }
  }

  const year = publishedDate.getFullYear();
  const month = String(publishedDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishedDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatReleaseUpdatedTitle = (publishedAt) => {
  const publishedDate = parsePublishedDate(publishedAt);
  if (!publishedDate) return '';
  return t('publicProfiles.updatedAtTooltip', {
    date: publishedDate.toLocaleString(),
  });
};

const getClientUpdatedLabel = (client) => formatReleaseUpdatedLabel(client?.publishedAt);

const getClientUpdatedTitle = (client) => formatReleaseUpdatedTitle(client?.publishedAt);

const showPreviewModal = ref(false);
const previewProfileId = ref(null);
const previewProfileName = ref('');

const handlePreview = (profile) => {
  previewProfileId.value = profile.id;
  previewProfileName.value = profile.name;
  showPreviewModal.value = true;
};

const handleQuickImport = (profile) => {
  selectedProfileForImport.value = profile;
  showQuickImportModal.value = true;
};

const expandedQRCards = ref(new Set());
const qrCanvasRefs = ref({});

const registerQrCanvas = (profileId, canvas) => {
  if (!canvas) return;
  qrCanvasRefs.value[profileId] = canvas;
};

const toggleQRCode = async (profile) => {
  const profileId = profile.id;
  if (expandedQRCards.value.has(profileId)) {
    expandedQRCards.value.delete(profileId);
  } else {
    expandedQRCards.value.add(profileId);
    await nextTick();
    const canvas = qrCanvasRefs.value[profileId];
    if (canvas) {
      const token = config.value.profileToken || 'profiles';
      const identifier = profile.customId || profile.id;
      const link = `${window.location.origin}/${token}/${identifier}`;
      try {
        const { default: QRCode } = await import('qrcode');
        await QRCode.toCanvas(canvas, link, {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      } catch (err) {
        // 生成失败时卡片内是空白，访客会以为功能坏了，需给出提示
        console.error('Failed to generate QR code:', err);
        showToast(t('publicProfiles.qrGenerateFailed'), 'error');
      }
    }
  }
};

const isQRExpanded = (profileId) => expandedQRCards.value.has(profileId);

const downloadQRCode = (profile) => {
  const canvas = qrCanvasRefs.value[profile.id];
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${profile.name || 'subscription'}-qrcode.png`;
  link.href = url;
  link.click();
  showToast(t('publicProfiles.qrDownloaded'), 'success');
};

const getPlatformStyle = (p) => {
  const map = {
    windows:
      'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30',
    macos:
      'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-200 dark:border-slate-500/30',
    linux:
      'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30',
    android:
      'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300 border border-green-200 dark:border-green-500/30',
    HarmonyOS:
      'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30',
    ios: 'bg-gray-800 text-white dark:bg-white dark:text-gray-900 border border-gray-700 dark:border-gray-200',
  };
  return map[p] || 'bg-elevated-card text-fg-muted border border-line';
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('open-guestbook', handleGuestbookEvent);
  }
  fetchPublicProfiles();
  await fetchClients();
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => fetchClientVersions(), { timeout: 1500 });
  } else {
    setTimeout(fetchClientVersions, 200);
  }
});

watch(
  () => [customPageConfig.value.enabled, parsedCustomPageSource.value.title, parsedCustomPageSource.value.description],
  () => {
    if (customPageConfig.value.enabled === true) {
      applyCustomPageDocumentMeta();
    } else {
      restoreCustomPageDocumentMeta();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('open-guestbook', handleGuestbookEvent);
  }
  restoreCustomPageDocumentMeta();
});
</script>

<template>
  <div class="bg-transparent transition-colors duration-200 relative">
    <template v-if="isInitialLoading">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
        <div class="space-y-6 animate-pulse">
          <div class="h-9 w-36 rounded-md bg-active"></div>
          <div class="space-y-3">
            <div class="h-10 w-full max-w-3xl rounded-md bg-active"></div>
            <div class="h-10 w-full max-w-2xl rounded-md bg-zinc-200/70 dark:bg-zinc-800/70"></div>
            <div class="h-4 w-full max-w-4xl rounded-md bg-zinc-200/60 dark:bg-zinc-800/60"></div>
            <div class="h-4 w-full max-w-3xl rounded-md bg-zinc-200/50 dark:bg-zinc-800/50"></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
            <div v-for="i in 6" :key="i" class="h-[260px] rounded-md bg-surface border border-line"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- 自定义渲染模式 -->
    <CustomPublicRenderer
      v-else-if="config.customPage?.enabled"
      :class="
        customPageConfig.useDefaultLayout !== false
          ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12'
          : 'min-h-[100dvh] w-full'
      "
      :config="config"
      :content="config.customPage.content"
      :css="config.customPage.css"
      :profiles="publicProfiles"
    >
      <template #hero>
        <div class="relative pt-10 pb-10 lg:pt-16 lg:pb-14 z-10 overflow-visible">
          <div class="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <h1 class="text-4xl sm:text-6xl lg:text-8xl font-black tracking-tight leading-[1.1] mb-8 break-words">
              <span class="block text-fg">{{ heroConfig.title1 }}</span>
              <span
                class="block text-3xl sm:text-5xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-primary-600 via-purple-500 to-indigo-500 dark:from-primary-400 dark:via-purple-400 dark:to-indigo-400 bg-[length:200%_auto] animate-gradient pb-2 mt-2"
              >
                {{ heroConfig.title2 }}
              </span>
            </h1>
            <p class="text-base md:text-lg text-fg-subtle leading-relaxed font-medium max-w-5xl">
              {{ heroConfig.description }}
            </p>
          </div>
        </div>
      </template>

      <template #announcements>
        <div v-if="announcement && announcement.enabled" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <AnnouncementCard :announcement="announcement" />
        </div>
      </template>

      <template #profiles>
        <div v-if="loading" aria-live="polite" role="status">
          {{ t('publicProfiles.loading') }}
        </div>
        <div v-else-if="error" role="alert">
          <p>{{ error }}</p>
          <button type="button" @click="fetchPublicProfiles">
            {{ t('publicProfiles.retry') }}
          </button>
        </div>
        <div v-else-if="publicProfiles.length === 0" role="status">
          {{ t('publicProfiles.empty') }}
        </div>
        <ProfileGrid
          v-else
          :is-qr-expanded="isQRExpanded"
          :profile-token="config.profileToken || 'profiles'"
          :profiles="publicProfiles"
          @preview="handlePreview"
          @quick-import="handleQuickImport"
          @toggle-qr="toggleQRCode"
          @copy-link="copyLink"
          @download-qr="downloadQRCode"
          @register-canvas="registerQrCanvas"
        />
      </template>

      <template #guestbook>
        <button
          v-if="guestbookConfig?.enabled !== false"
          class="px-6 py-2 bg-indigo-500 text-white rounded-lg"
          @click="handleGuestbookTrigger"
        >
          {{ t('publicProfiles.guestbook') }}
        </button>
      </template>
    </CustomPublicRenderer>

    <!-- 默认布局模式 -->
    <template v-else>
      <div class="relative pt-10 pb-8 lg:pt-14 lg:pb-10 z-10 overflow-visible">
        <div
          class="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative"
        >
          <div class="text-left relative z-10 lg:col-span-12 xl:col-span-12">
            <div
              class="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-line bg-transparent mb-6 shadow-none"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span class="font-mono text-xs font-medium text-fg-muted tracking-widest uppercase">{{
                t('publicProfiles.badge')
              }}</span>
            </div>

            <div v-if="isInitialLoading" class="max-w-5xl space-y-4 animate-pulse">
              <div class="h-10 w-44 rounded-md bg-elevated-card sm:h-14 sm:w-56 lg:h-16 lg:w-72"></div>
              <div class="h-10 w-56 rounded-md bg-elevated-card sm:h-14 sm:w-72 lg:h-16 lg:w-96"></div>
              <div class="h-4 w-full max-w-3xl rounded-md bg-elevated-card"></div>
              <div class="h-4 w-5/6 max-w-2xl rounded-md bg-elevated-card"></div>
            </div>

            <template v-else>
              <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 break-words">
                <span class="block text-fg">
                  {{ heroConfig.title1 }}
                </span>
                <span class="block text-2xl sm:text-4xl lg:text-5xl text-fg-muted pb-2 mt-2">
                  {{ heroConfig.title2 }}
                </span>
              </h1>

              <p class="text-sm md:text-base text-fg-muted leading-relaxed max-w-4xl mb-4 break-words">
                {{ heroConfig.description }}
              </p>
            </template>
          </div>
        </div>
      </div>

      <div class="relative z-10 pt-4">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnnouncementCard v-if="announcement && announcement.enabled" :announcement="announcement" class="mb-10" />

          <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="i in 6"
              :key="i"
              class="h-[260px] bg-surface rounded-md p-6 shadow-none border border-line animate-pulse"
            >
              <div class="flex items-center gap-4 mb-6">
                <div class="h-10 w-10 bg-elevated-card rounded-md"></div>
                <div class="h-5 bg-elevated-card rounded-md w-1/2"></div>
              </div>
              <div class="h-4 bg-elevated-card rounded-md w-full mb-3"></div>
              <div class="h-4 bg-elevated-card rounded-md w-5/6 mb-8"></div>
              <div class="mt-auto h-10 bg-elevated-card rounded-md"></div>
            </div>
          </div>

          <div v-else-if="error" class="text-center py-16 bg-transparent rounded-md border border-line">
            <div
              class="inline-flex items-center justify-center w-12 h-12 rounded-md border border-line bg-transparent mb-4"
            >
              <AlertTriangle class="w-6 h-6 text-red-400" />
            </div>
            <h3 class="text-base font-semibold text-fg mb-2">
              {{ t('publicProfiles.loadFailed') }}
            </h3>
            <p class="text-xs text-fg-muted mb-6">{{ error }}</p>
            <button
              class="px-5 py-2 bg-accent hover:opacity-90 text-accent-fg text-xs font-semibold rounded-md shadow-none transition-colors"
              @click="fetchPublicProfiles"
            >
              {{ t('publicProfiles.retry') }}
            </button>
          </div>
          <div
            v-else-if="publicProfiles.length === 0"
            class="py-14 px-6 text-center text-sm text-fg-subtle bg-surface border border-line rounded-md"
            role="status"
          >
            {{ t('publicProfiles.empty') }}
          </div>

          <div v-else-if="publicProfiles.length > 0">
            <ProfileGrid
              :is-qr-expanded="isQRExpanded"
              :profile-token="config.profileToken || 'profiles'"
              :profiles="publicProfiles"
              @preview="handlePreview"
              @quick-import="handleQuickImport"
              @toggle-qr="toggleQRCode"
              @copy-link="copyLink"
              @download-qr="downloadQRCode"
              @register-canvas="registerQrCanvas"
            />
          </div>
        </div>

        <div class="mt-16 pt-12 pb-2 border-t border-line bg-transparent">
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

            <div
              v-if="!error && availableClientPlatforms.length > 2"
              class="flex flex-wrap items-center justify-center gap-2 mb-8"
            >
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
                    class="h-10 w-10 rounded-md flex items-center justify-center text-2xl shadow-none bg-transparent border border-line shrink-0 overflow-hidden"
                  >
                    <img
                      v-if="client.icon && (client.icon.includes('/') || client.icon.startsWith('data:'))"
                      :alt="client.name"
                      :src="client.icon"
                      loading="lazy"
                      decoding="async"
                      class="w-full h-full object-cover rounded-md p-1"
                    />
                    <span v-else>{{ client.icon }}</span>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1.5">
                      <h3 class="text-sm font-semibold text-fg truncate">
                        {{ client.name }}
                      </h3>
                    </div>
                    <div class="flex flex-wrap gap-1 mb-2">
                      <span
                        v-for="platform in client.platforms"
                        :key="platform"
                        class="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] font-medium border border-line bg-transparent text-fg-muted"
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
                      class="font-mono text-[11px] text-fg-subtle truncate"
                    >
                      {{ getClientUpdatedLabel(client) }}
                    </span>
                  </div>

                  <a
                    :href="client.url"
                    class="font-mono text-xs font-semibold text-fg-muted hover:text-fg transition-colors flex items-center gap-1 group/link shrink-0"
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

        <PublicCoresSection
          v-if="!error"
          :format-release-updated-label="formatReleaseUpdatedLabel"
          :format-release-updated-title="formatReleaseUpdatedTitle"
          :public-cores="config.publicCores"
        />

        <PublicLinksSection v-if="!error" :public-links="config.publicLinks" />
      </div>
    </template>

    <NodePreviewModal
      v-if="showPreviewModal"
      :profile-id="previewProfileId"
      :profile-name="previewProfileName"
      :show="showPreviewModal"
      api-endpoint="/api/public/preview"
      @update:show="showPreviewModal = $event"
    />

    <GuestbookModal :config="guestbookConfig" :show="showGuestbookModal" @close="showGuestbookModal = false" />

    <QuickImportModal
      :clients="clients"
      :profile="selectedProfileForImport"
      :profile-token="config.profileToken || 'profiles'"
      :show="showQuickImportModal"
      @close="showQuickImportModal = false"
    />
  </div>
</template>
