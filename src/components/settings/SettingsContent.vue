<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { ChevronUp, Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import SettingsLayout from '@/components/layout/SettingsLayout.vue';
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';

const loadBasicSettings = () => import('@/components/settings/sections/BasicSettings.vue');
const loadHomeSettings = () => import('@/components/settings/sections/HomeSettings.vue');
const loadGlobalSettings = () => import('@/components/settings/sections/GlobalSettings.vue');
const loadServiceSettings = () => import('@/components/settings/sections/ServiceSettings.vue');
const loadCustomPageSettings = () => import('@/components/settings/sections/CustomPageSettings.vue');
const loadWebdavBackupSettings = () => import('@/components/settings/sections/WebdavBackupSettings.vue');
const loadSystemSettings = () => import('@/components/settings/sections/SystemSettings.vue');

const BasicSettings = defineAsyncComponent(loadBasicSettings);
const HomeSettings = defineAsyncComponent(loadHomeSettings);
const GlobalSettings = defineAsyncComponent(loadGlobalSettings);
const ServiceSettings = defineAsyncComponent(loadServiceSettings);
const CustomPageSettings = defineAsyncComponent(loadCustomPageSettings);
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

const props = defineProps({
  activeTab: {
    type: String,
    required: true,
  },
  settings: {
    type: Object,
    required: true,
  },
  disguiseConfig: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isSaving: {
    type: Boolean,
    default: false,
  },
  restartCountdown: {
    type: Number,
    default: null,
  },
  hasWhitespace: {
    type: Boolean,
    default: false,
  },
  /** 独立页面用 ?focus= 深链定位字段时高亮；弹窗不使用 */
  highlightedFocusId: {
    type: String,
    default: '',
  },
  hideFooter: {
    type: Boolean,
    default: false,
  },
  inModal: {
    type: Boolean,
    default: false,
  },
  layoutClass: {
    type: String,
    default: 'h-full',
  },
  exportBackup: {
    type: Function,
    default: null,
  },
  importBackup: {
    type: Function,
    default: null,
  },
  handleReset: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(['update:activeTab', 'save', 'reload-now']);

const activeTabModel = computed({
  get: () => props.activeTab,
  set: (value) => emit('update:activeTab', value),
});

// 仅在首次访问对应 tab 时才挂载该分区组件，后续切换通过 v-show 保留内部状态
const visitedTabs = ref(new Set(props.activeTab ? [props.activeTab] : []));
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

function handleSaveClick() {
  if (props.isLoading || saveDisabled.value) return;
  emit('save');
}

// 独立设置页将「回到顶部」收纳进底部操作栏，彻底避免与保存按钮或表单开关重叠
const showScrollTop = ref(false);
const SCROLL_TOP_THRESHOLD = 300;
let scrollRafId = null;

function updateScrollTopVisibility() {
  if (typeof window === 'undefined') return;
  showScrollTop.value = window.scrollY > SCROLL_TOP_THRESHOLD;
}

function handleWindowScroll() {
  if (scrollRafId !== null || typeof window === 'undefined') return;
  scrollRafId = window.requestAnimationFrame(() => {
    scrollRafId = null;
    updateScrollTopVisibility();
  });
}

function scrollToTop() {
  if (typeof window === 'undefined') return;
  window.scrollTo?.({ top: 0, behavior: 'smooth' });
}

let cancelSectionsPrefetch = () => {};

onMounted(() => {
  cancelSectionsPrefetch = scheduleIdlePrefetch([
    loadBasicSettings,
    loadHomeSettings,
    loadGlobalSettings,
    loadServiceSettings,
    loadCustomPageSettings,
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
      <div
        v-if="restartCountdown !== null"
        aria-live="polite"
        class="flex items-center justify-between gap-3 rounded-md bg-amber-500/10 px-4 py-3 text-xs text-amber-200 border border-amber-500/20"
        role="status"
      >
        <span class="flex items-center gap-2 font-mono">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
          {{ t('settings.reloadCountdown', { seconds: restartCountdown }) }}
        </span>
        <button
          class="shrink-0 rounded-md border border-line-strong bg-transparent px-3 py-1 text-xs font-medium text-fg hover:bg-hover"
          type="button"
          @click="$emit('reload-now')"
        >
          {{ t('settings.reloadNow') }}
        </button>
      </div>

      <BasicSettings
        v-if="visitedTabs.has('basic')"
        v-show="activeTab === 'basic'"
        :disguiseConfig="disguiseConfig"
        :highlighted-focus-id="highlightedFocusId"
        :settings="settings"
      />
      <HomeSettings v-if="visitedTabs.has('home')" v-show="activeTab === 'home'" :settings="settings" />
      <GlobalSettings v-if="visitedTabs.has('global')" v-show="activeTab === 'global'" :settings="settings" />
      <ServiceSettings v-if="visitedTabs.has('service')" v-show="activeTab === 'service'" :settings="settings" />
      <CustomPageSettings
        v-if="visitedTabs.has('custom-page')"
        v-show="activeTab === 'custom-page'"
        :settings="settings"
      />
      <div v-if="visitedTabs.has('system')" v-show="activeTab === 'system'" class="space-y-4">
        <WebdavBackupSettings :settings="settings" />
        <SystemSettings
          :exportBackup="exportBackup"
          :handleReset="handleReset"
          :importBackup="importBackup"
          :settings="settings"
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
