<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ProfileConfig, SettingsConfig } from '@misub/core/types.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { hasStoredLocale, useI18n } from '@/i18n/index.js';
import { api } from '@/lib/http.js';
import { resolveComponentQueryClient } from '@/lib/query-client.js';
import { fetchPublicProfilesWithQuery } from '@/queries/usePublicProfilesQuery.js';
import ProfileGrid from '@/components/public/ProfileGrid.vue';
import PublicClientsSection from '@/components/public/PublicClientsSection.vue';
import PublicCoresSection from '@/components/public/PublicCoresSection.vue';
import PublicLinksSection from '@/components/public/PublicLinksSection.vue';
import { AlertTriangle } from '@lucide/vue';
import { normalizePublicClientsConfig } from '@misub/core/domain/default-public-clients.js';
import { getProfileShareIdentifier } from '@misub/core/domain/profile-link.js';
import { parseCustomPageSource } from '@/utils/custom-page-source.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const isDev = import.meta.env.DEV;

const NodePreviewModal = defineAsyncComponent(() => import('@/components/modals/NodePreview/NodePreviewModal.vue'));
const AnnouncementCard = defineAsyncComponent(() => import('@/components/public/AnnouncementCard.vue'));
const GuestbookModal = defineAsyncComponent(() => import('@/components/modals/GuestbookModal.vue'));
const QuickImportModal = defineAsyncComponent(() => import('@/components/modals/QuickImportModal.vue'));
const CustomPublicRenderer = defineAsyncComponent(() => import('@/components/public/CustomPublicRenderer.vue'));

interface PublicProfileItem extends ProfileConfig {
  shareId?: string;
  shortLink?: string;
  [key: string]: unknown;
}

interface PublicPageConfig extends Partial<SettingsConfig> {
  announcement?: Record<string, any>;
  hero?: Record<string, any>;
  guestbook?: Record<string, any>;
  customPage?: Record<string, any>;
  defaultLocale?: string;
  [key: string]: any;
}

const publicProfiles = ref<PublicProfileItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { showToast } = useToastStore();
const { t, setLocale } = useI18n();
const config = ref<PublicPageConfig>({});
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
const selectedProfileForImport = ref<PublicProfileItem | null>(null);

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

const queryClient = resolveComponentQueryClient();

const fetchPublicProfiles = async () => {
  try {
    loading.value = true;
    error.value = null;
    const data = await fetchPublicProfilesWithQuery(queryClient);
    if (data.success) {
      publicProfiles.value = (data.data || []) as unknown as PublicProfileItem[];
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

const copyLink = async (profile: PublicProfileItem) => {
  const token = config.value.profileToken || 'sub';
  const identifier = profile.shareId || getProfileShareIdentifier(profile);
  const link = `${window.location.origin}/${token}/${identifier}`;

  const copied = await copyTextToClipboard(link);
  showToast(
    copied ? t('publicProfiles.linkCopied') : t('publicProfiles.copyFailedManual'),
    copied ? 'success' : 'error',
  );
};

const copyShortLink = async (profile: PublicProfileItem) => {
  if (!profile?.shortLink) return;
  const copied = await copyTextToClipboard(profile.shortLink);
  showToast(copied ? t('public.shortLinkCopied') : t('publicProfiles.copyFailedManual'), copied ? 'success' : 'error');
};

const publicClients = ref<Record<string, any>>({});
const publicCores = ref<Record<string, any>>({});
const publicLinks = ref<Record<string, any>>({});

const enabledClientsForImport = computed(() => {
  const normalized = normalizePublicClientsConfig(publicClients.value);
  return normalized.enabled ? (normalized.items || []).filter((item) => item.enabled !== false) : [];
});

const fetchClients = async () => {
  try {
    const data = await api.get('/api/clients');
    if (data?.success && data.data && (typeof data.data === 'object' || Array.isArray(data.data))) {
      publicClients.value = data.data;
    }
  } catch (e) {
    // 客户端列表属辅助信息（推荐下载），失败时保持该区块为空即可，不必打扰访客；
    // 核心订阅数据由 loadProfiles 单独处理并向访客提示。
    console.error('Failed to fetch clients', e);
  }
};

const fetchPublicCores = async () => {
  try {
    const data = await api.get('/api/public_cores');
    if (data?.success && data.data && typeof data.data === 'object') {
      publicCores.value = data.data;
    }
  } catch (e) {
    console.error('Failed to fetch public cores', e);
  }
};

const fetchPublicLinks = async () => {
  try {
    const data = await api.get('/api/public_links');
    if (data?.success && data.data && typeof data.data === 'object') {
      publicLinks.value = data.data;
    }
  } catch (e) {
    console.error('Failed to fetch public links', e);
  }
};

const RECENT_UPDATE_DAYS = 7;

const parsePublishedDate = (publishedAt?: string | number | Date | null) => {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatReleaseUpdatedLabel = (publishedAt?: string | number | Date | null) => {
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

const formatReleaseUpdatedTitle = (publishedAt?: string | number | Date | null) => {
  const publishedDate = parsePublishedDate(publishedAt);
  if (!publishedDate) return '';
  return t('publicProfiles.updatedAtTooltip', {
    date: publishedDate.toLocaleString(),
  });
};

const showPreviewModal = ref(false);
const previewProfileId = ref<string | null>(null);
const previewProfileName = ref('');

const handlePreview = (profile: PublicProfileItem) => {
  previewProfileId.value = profile.shareId || getProfileShareIdentifier(profile);
  previewProfileName.value = profile.name;
  showPreviewModal.value = true;
};

const handleQuickImport = (profile: PublicProfileItem) => {
  selectedProfileForImport.value = profile;
  showQuickImportModal.value = true;
};

const expandedQRCards = ref<Set<string>>(new Set());
const qrCanvasRefs = ref<Record<string, HTMLCanvasElement>>({});

const registerQrCanvas = (profileId: string, canvas: HTMLCanvasElement | null) => {
  if (!canvas) return;
  qrCanvasRefs.value[profileId] = canvas;
};

const toggleQRCode = async (profile: PublicProfileItem) => {
  const profileId = profile.id;
  if (expandedQRCards.value.has(profileId)) {
    expandedQRCards.value.delete(profileId);
  } else {
    expandedQRCards.value.add(profileId);
    await nextTick();
    const canvas = qrCanvasRefs.value[profileId];
    if (canvas) {
      const token = config.value.profileToken || 'sub';
      const identifier = profile.shareId || getProfileShareIdentifier(profile);
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

const isQRExpanded = (profileId: string) => expandedQRCards.value.has(profileId);

const downloadQRCode = (profile: PublicProfileItem) => {
  const canvas = qrCanvasRefs.value[profile.id];
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${profile.name || 'subscription'}-qrcode.png`;
  link.href = url;
  link.click();
  showToast(t('publicProfiles.qrDownloaded'), 'success');
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('open-guestbook', handleGuestbookEvent);
  }
  fetchPublicProfiles();
  fetchClients();
  fetchPublicCores();
  fetchPublicLinks();
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
          :profile-token="config.profileToken || 'sub'"
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
          class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-accent text-accent-fg text-sm font-medium border border-accent hover:opacity-90 transition-opacity"
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
              :profile-token="config.profileToken || 'sub'"
              :profiles="publicProfiles"
              @preview="handlePreview"
              @quick-import="handleQuickImport"
              @toggle-qr="toggleQRCode"
              @copy-link="copyLink"
              @copy-short-link="copyShortLink"
              @download-qr="downloadQRCode"
              @register-canvas="registerQrCanvas"
            />
          </div>
        </div>

        <PublicClientsSection
          v-if="!error"
          :format-release-updated-label="formatReleaseUpdatedLabel"
          :format-release-updated-title="formatReleaseUpdatedTitle"
          :public-clients="publicClients"
        />

        <PublicCoresSection
          v-if="!error"
          :format-release-updated-label="formatReleaseUpdatedLabel"
          :format-release-updated-title="formatReleaseUpdatedTitle"
          :public-cores="publicCores"
        />

        <PublicLinksSection v-if="!error" :public-links="publicLinks" />
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
      :clients="enabledClientsForImport"
      :profile="selectedProfileForImport"
      :profile-token="config.profileToken || 'sub'"
      :show="showQuickImportModal"
      @close="showQuickImportModal = false"
    />
  </div>
</template>
