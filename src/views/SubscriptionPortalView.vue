<script setup lang="ts">
import { computed, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { Languages, Moon, Sun } from '@lucide/vue';
import { useThemeStore } from '@/stores/useThemeStore.js';
import { useI18n } from '@/i18n/index.js';
import PortalOverviewCard from '@/components/portal/PortalOverviewCard.vue';
import PortalQuickImportCard from '@/components/portal/PortalQuickImportCard.vue';
import PortalMultiSocksTable from '@/components/portal/PortalMultiSocksTable.vue';
import CustomPortalRenderer from '@/components/portal/CustomPortalRenderer.vue';
import type { SubscriptionPortalPayload } from '@/utils/portal-bootstrap.js';

const props = defineProps<{
  portalData: SubscriptionPortalPayload;
}>();

const activePinia = getActivePinia();
const themeStore = activePinia ? useThemeStore() : null;
const { t, locale, setLocale } = useI18n();

const logoFailed = ref(false);
const currentTheme = computed(() => themeStore?.theme ?? 'light');
const toggleTheme = (): void => {
  themeStore?.toggleTheme({ instant: true });
};
const isZh = computed(() => locale.value === 'zh-CN');
const toggleLocale = (): void => {
  setLocale(isZh.value ? 'en-US' : 'zh-CN');
};

const customConfig = computed(() => props.portalData.portalCustomPage);
const useCustomPortal = computed(() =>
  Boolean(customConfig.value?.enabled && customConfig.value?.content && customConfig.value.content.trim()),
);
const useDefaultLayout = computed(() => !useCustomPortal.value || customConfig.value?.useDefaultLayout !== false);
const hideHeader = computed(() => Boolean(useCustomPortal.value && customConfig.value?.hideHeader));
const hideFooter = computed(() => Boolean(useCustomPortal.value && customConfig.value?.hideFooter));
const hideBranding = computed(() => Boolean(useCustomPortal.value && customConfig.value?.hideBranding));

const statusToneClass = computed(() => {
  if (props.portalData.isExpired || props.portalData.expireStatus === '已到期') {
    return 'bg-status-danger-bg text-status-danger border-status-danger-border';
  }
  if (props.portalData.expireStatus === '即将到期') {
    return 'bg-status-warning-bg text-status-warning border-status-warning-border';
  }
  return 'bg-status-success-bg text-status-success border-status-success-border';
});

const statusLabel = computed(() => {
  if (props.portalData.isExpired || props.portalData.expireStatus === '已到期') {
    return t('portal.statusExpired');
  }
  if (props.portalData.expireStatus === '即将到期') {
    return t('portal.statusExpiringSoon');
  }
  return props.portalData.expireStatus || t('portal.statusNormal');
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-canvas text-fg transition-colors duration-200">
    <header
      v-if="!hideHeader"
      class="sticky top-0 z-40 bg-white/75 dark:bg-[#0e0e0e]/75 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.09] transition-colors duration-200"
      data-testid="portal-header"
    >
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex h-14 items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div v-if="!hideBranding" class="nav-brand-badge nav-brand-badge-sm shrink-0" aria-hidden="true">
              <img
                v-if="!logoFailed"
                alt="MiSub"
                decoding="async"
                height="24"
                src="/logo.png"
                width="24"
                @error="logoFailed = true"
              />
              <svg
                v-else
                fill="none"
                height="24"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                width="24"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3.6 9h16.8M3.6 15h16.8" />
                <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
            </div>
            <h1 class="text-sm sm:text-base font-semibold tracking-tight text-fg truncate" data-testid="portal-title">
              {{ portalData.title }}
            </h1>
            <span
              :class="statusToneClass"
              class="shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium"
              data-testid="portal-status-badge"
            >
              {{ statusLabel }}
            </span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              :aria-label="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
              :title="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
              class="nav-action-btn nav-action-btn-neutral rounded-md"
              data-testid="portal-lang-toggle"
              type="button"
              @click="toggleLocale"
            >
              <Languages class="h-4 w-4" />
            </button>
            <button
              :aria-label="currentTheme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
              :aria-pressed="currentTheme === 'dark'"
              :title="currentTheme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
              class="nav-action-btn nav-action-btn-neutral rounded-md"
              data-testid="portal-theme-toggle"
              type="button"
              @click="toggleTheme"
            >
              <Sun v-if="currentTheme === 'dark'" class="h-4 w-4" />
              <Moon v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <main
      :class="
        useDefaultLayout
          ? 'grow w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4'
          : 'grow w-full min-h-[100dvh]'
      "
    >
      <CustomPortalRenderer
        v-if="useCustomPortal"
        :content="customConfig?.content"
        :css="customConfig?.css"
        :portal-data="portalData"
      >
        <template #overview>
          <PortalOverviewCard :portal-data="portalData" />
        </template>
        <template #quick_import>
          <PortalQuickImportCard :portal-data="portalData" />
        </template>
        <template #multi_socks>
          <PortalMultiSocksTable :portal-data="portalData" />
        </template>
      </CustomPortalRenderer>

      <template v-else>
        <PortalOverviewCard :portal-data="portalData" />
        <PortalQuickImportCard :portal-data="portalData" />
        <PortalMultiSocksTable :portal-data="portalData" />
      </template>
    </main>

    <footer
      v-if="!hideFooter"
      class="border-t border-line py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-fg-subtle font-mono"
      data-testid="portal-footer"
    >
      <span v-if="!hideBranding">Powered by MiSub · v{{ portalData.version }}</span>
      <span v-else>{{ portalData.title }}</span>
    </footer>
  </div>
</template>
