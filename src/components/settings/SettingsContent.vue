<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { ChevronUp, Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import SettingsLayout from '@/components/layout/SettingsLayout.vue';
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';
import type { BackupScope } from '@/composables/useBackupLogic.js';
import type { DisguiseConfig } from '@/composables/useSettingsLogic.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const loadBasicSettings = () => import('@/components/settings/sections/BasicSettings.vue');
const loadHomeSettings = () => import('@/components/settings/sections/HomeSettings.vue');
const loadGlobalSettings = () => import('@/components/settings/sections/GlobalSettings.vue');
const loadTransformSettings = () => import('@/components/settings/sections/TransformSettings.vue');
const loadServiceSettings = () => import('@/components/settings/sections/ServiceSettings.vue');
const loadCustomPageSettings = () => import('@/components/settings/sections/CustomPageSettings.vue');
const loadPortalCustomPageSettings = () => import('@/components/settings/sections/PortalCustomPageSettings.vue');
const loadWebdavBackupSettings = () => import('@/components/settings/sections/WebdavBackupSettings.vue');
const loadSystemSettings = () => import('@/components/settings/sections/SystemSettings.vue');

const BasicSettings = defineAsyncComponent(loadBasicSettings);
const HomeSettings = defineAsyncComponent(loadHomeSettings);
const GlobalSettings = defineAsyncComponent(loadGlobalSettings);
const TransformSettings = defineAsyncComponent(loadTransformSettings);
const ServiceSettings = defineAsyncComponent(loadServiceSettings);
const CustomPageSettings = defineAsyncComponent(loadCustomPageSettings);
const PortalCustomPageSettings = defineAsyncComponent(loadPortalCustomPageSettings);
const WebdavBackupSettings = defineAsyncComponent(loadWebdavBackupSettings);
const SystemSettings = defineAsyncComponent(loadSystemSettings);

/**
 * 设置界面的共享内容区。
 *
 * 此前 SettingsView.vue（独立页面）与 SettingsPanel.vue（弹窗）各自实现了一份，
 * 约 90% 逐行相同，导致「弹窗漏渲染 custom-page」「弹窗漏传 handleReset」两个缺陷
 * —— 改了一边忘了另一边。现在两者的 section 列表、头部信息卡、加载态与保存按钮
 * 都收敛到这里，各自只保留外壳差异。
 *
 * 注意：useSettingsLogic() 是工厂函数（每次调用创建独立的 ref 状态），
 * 所以数据一律由父组件通过 props 传入，本组件不再自行调用，避免出现两份状态。
 */
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    activeTab: string;
    settings: AppSettingsConfig;
    disguiseConfig?: DisguiseConfig | Record<string, unknown>;
    isLoading?: boolean;
    isSaving?: boolean;
    hasWhitespace?: boolean;
    /** 独立页面用 ?focus= 深链定位字段时高亮；弹窗不使用 */
    highlightedFocusId?: string;
    hideFooter?: boolean;
    inModal?: boolean;
    layoutClass?: string;
    exportBackup?: ((scope?: BackupScope) => Promise<void>) | (() => unknown) | null;
    importBackup?: (() => void) | (() => unknown) | null;
    handleReset?: (() => Promise<void>) | (() => unknown) | null;
  }>(),
  {
    disguiseConfig: () => ({ pageType: 'default', redirectUrl: '' }),
    isLoading: false,
    isSaving: false,
    hasWhitespace: false,
    highlightedFocusId: '',
    hideFooter: false,
    inModal: false,
    layoutClass: 'h-full',
    exportBackup: null,
    importBackup: null,
    handleReset: null,
  },
);

const emit = defineEmits<{
  'update:activeTab': [value: string];
  'update:settings': [value: AppSettingsConfig];
  'update:disguiseConfig': [value: DisguiseConfig];
  save: [];
}>();

const activeTabModel = computed({
  get: () => props.activeTab,
  set: (value: string) => emit('update:activeTab', value),
});

const settingsModel = computed<AppSettingsConfig>({
  get: () => props.settings,
  set: (value: AppSettingsConfig) => emit('update:settings', value),
});

const disguiseConfigModel = computed<DisguiseConfig>({
  get: () => props.disguiseConfig as DisguiseConfig,
  set: (value: DisguiseConfig) => emit('update:disguiseConfig', value),
});

// 仅在首次访问对应 tab 时才挂载该分区组件，后续切换通过 v-show 保留内部状态
const visitedTabs = ref<Set<string>>(new Set(props.activeTab ? [props.activeTab] : []));
const customPageSubTab = ref<'public' | 'portal'>('public');
watch(
  () => props.activeTab,
  (tab) => {
    if (tab && !visitedTabs.value.has(tab)) {
      const next = new Set(visitedTabs.value);
      next.add(tab);
      visitedTabs.value = next;
    }
  },
  { immediate: true },
);

const currentTabLabel = computed(() => {
  switch (props.activeTab) {
    case 'basic':
      return t('settings.tabs.basic');
    case 'home':
      return t('settings.tabs.home');
    case 'global':
      return t('settings.tabs.global');
    case 'transform':
      return t('settings.tabs.transform');
    case 'service':
      return t('settings.tabs.service');
    case 'custom-page':
      return t('settings.tabs.customPage');
    case 'system':
      return t('settings.tabs.system');
    default:
      return t('settings.title');
  }
});

const saveDisabled = computed(() => props.isSaving || props.hasWhitespace);

function handleSaveClick(): void {
  if (props.isLoading || saveDisabled.value) return;
  emit('save');
}

// 独立设置页将「回到顶部」收纳进底部操作栏，彻底避免与保存按钮或表单开关重叠
const showScrollTop = ref(false);
const SCROLL_TOP_THRESHOLD = 300;
let scrollRafId: number | null = null;

function updateScrollTopVisibility(): void {
  if (typeof window === 'undefined') return;
  showScrollTop.value = window.scrollY > SCROLL_TOP_THRESHOLD;
}

function handleWindowScroll(): void {
  if (scrollRafId !== null || typeof window === 'undefined') return;
  scrollRafId = window.requestAnimationFrame(() => {
    scrollRafId = null;
    updateScrollTopVisibility();
  });
}

function scrollToTop(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo?.({ top: 0, behavior: 'smooth' });
}

let cancelSectionsPrefetch: () => void = () => {};

onMounted(() => {
  cancelSectionsPrefetch = scheduleIdlePrefetch([
    loadBasicSettings,
    loadHomeSettings,
    loadGlobalSettings,
    loadTransformSettings,
    loadServiceSettings,
    loadCustomPageSettings,
    loadPortalCustomPageSettings,
    loadWebdavBackupSettings,
    loadSystemSettings,
  ]);
  if (props.inModal || props.hideFooter || typeof window === 'undefined') return;
  updateScrollTopVisibility();
  window.addEventListener('scroll', handleWindowScroll, { passive: true });
});

onUnmounted(() => {
  cancelSectionsPrefetch();
  if (typeof window !== 'undefined') {
    if (scrollRafId !== null) {
      window.cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
    window.removeEventListener('scroll', handleWindowScroll);
  }
});
</script>

<template>
  <SettingsLayout :class="layoutClass" :hide-footer="hideFooter" :in-modal="inModal">
    <template #sidebar>
      <SettingsSidebar v-model:activeTab="activeTabModel" :in-modal="inModal" />
    </template>

    <div v-if="isLoading" class="text-center p-12 rounded-lg border border-line bg-surface">
      <Loader2 class="animate-spin h-6 w-6 text-fg-muted mx-auto mb-3" />
      <p class="text-xs text-fg-subtle">{{ t('settings.loading') }}</p>
    </div>

    <div v-else :aria-label="currentTabLabel" class="flex flex-col gap-4 w-full" role="tabpanel">
      <BasicSettings
        v-if="visitedTabs.has('basic')"
        v-show="activeTab === 'basic'"
        v-model:disguise-config="disguiseConfigModel"
        v-model:settings="settingsModel"
        :highlighted-focus-id="highlightedFocusId"
      />
      <HomeSettings v-if="visitedTabs.has('home')" v-show="activeTab === 'home'" v-model:settings="settingsModel" />
      <GlobalSettings
        v-if="visitedTabs.has('global')"
        v-show="activeTab === 'global'"
        v-model:settings="settingsModel"
      />
      <TransformSettings
        v-if="visitedTabs.has('transform')"
        v-show="activeTab === 'transform'"
        v-model:settings="settingsModel"
      />
      <ServiceSettings
        v-if="visitedTabs.has('service')"
        v-show="activeTab === 'service'"
        v-model:settings="settingsModel"
      />
      <div v-if="visitedTabs.has('custom-page')" v-show="activeTab === 'custom-page'" class="space-y-4">
        <div class="inline-flex items-center gap-0.5 rounded-md border border-line bg-inset p-0.5">
          <button
            :aria-pressed="customPageSubTab === 'public'"
            :class="
              customPageSubTab === 'public'
                ? 'border-line-strong bg-active font-semibold text-fg'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-hover'
            "
            class="px-3 py-1.5 rounded border text-xs font-medium transition-colors"
            data-testid="custom-page-subtab-public"
            type="button"
            @click="customPageSubTab = 'public'"
          >
            {{ t('settings.customPageTitle') }}
          </button>
          <button
            :aria-pressed="customPageSubTab === 'portal'"
            :class="
              customPageSubTab === 'portal'
                ? 'border-line-strong bg-active font-semibold text-fg'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-hover'
            "
            class="px-3 py-1.5 rounded border text-xs font-medium transition-colors"
            data-testid="custom-page-subtab-portal"
            type="button"
            @click="customPageSubTab = 'portal'"
          >
            {{ t('settings.portalCustomPageTitle') }}
          </button>
        </div>

        <CustomPageSettings
          v-show="customPageSubTab === 'public'"
          v-model:settings="settingsModel"
          :is-active="activeTab === 'custom-page' && customPageSubTab === 'public'"
          :is-saving="isSaving"
          :save-disabled="saveDisabled"
          @save="handleSaveClick"
        />

        <PortalCustomPageSettings
          v-if="customPageSubTab === 'portal'"
          v-model:settings="settingsModel"
          :is-active="activeTab === 'custom-page' && customPageSubTab === 'portal'"
          :is-saving="isSaving"
          :save-disabled="saveDisabled"
          @save="handleSaveClick"
        />
      </div>
      <div v-if="visitedTabs.has('system')" v-show="activeTab === 'system'" class="space-y-4">
        <WebdavBackupSettings v-model:settings="settingsModel" />
        <SystemSettings
          v-model:settings="settingsModel"
          :exportBackup="exportBackup ?? undefined"
          :handleReset="handleReset ?? undefined"
          :importBackup="importBackup ?? undefined"
        />
      </div>
    </div>

    <template #footer>
      <div class="pointer-events-auto flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
        <button
          :class="
            saveDisabled
              ? 'bg-active border-line text-fg-subtle cursor-not-allowed'
              : 'bg-accent border-accent text-accent-fg hover:opacity-90'
          "
          :disabled="saveDisabled"
          :title="hasWhitespace ? t('settings.noWhitespace') : t('settings.saveChanges')"
          class="flex-1 sm:flex-none h-[38px] px-5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-2 border shadow-[0_4px_16px_rgba(0,0,0,0.16)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.55)]"
          type="button"
          @click="handleSaveClick"
        >
          <Loader2 v-if="isSaving" class="animate-spin h-4 w-4 text-fg-subtle" />
          <span>{{ isSaving ? t('settings.saving') : t('settings.saveChanges') }}</span>
        </button>
        <button
          v-if="showScrollTop && !inModal"
          :aria-label="t('common.scrollToTop')"
          :title="t('common.scrollToTop')"
          class="p-2.5 shrink-0 rounded-md bg-accent text-accent-fg hover:opacity-90 border border-accent transition-colors inline-flex items-center justify-center shadow-none"
          data-testid="settings-footer-scroll-top"
          type="button"
          @click="scrollToTop"
        >
          <ChevronUp class="h-4 w-4" />
        </button>
      </div>
    </template>
  </SettingsLayout>
</template>
