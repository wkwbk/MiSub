<script setup>
import { nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
import SettingsContent from '@/components/settings/SettingsContent.vue';
import {
  resolveSettingsFocusAnchor,
  resolveSettingsFocusTab,
  resolveSettingsTab,
  SETTINGS_ACTIVE_TAB_STORAGE_KEY,
} from '@/utils/dashboard-deeplink.js';
import { readSessionPreference, writeSessionPreference } from '@/utils/session-preference.js';

const {
  settings,
  disguiseConfig,
  isLoading,
  isSaving,
  restartCountdown,
  hasWhitespace,
  loadSettings,
  handleSave,
  handleReset,
  exportBackup,
  importBackup,
} = useSettingsLogic();

const route = useRoute();
const router = useRouter();

function resolveInitialTab() {
  const focusTab = resolveSettingsFocusTab(route.query?.focus);
  if (focusTab) return focusTab;

  const queryTab = resolveSettingsTab(route.query?.tab);
  if (queryTab) return queryTab;

  const rememberedTab = resolveSettingsTab(readSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY));
  if (rememberedTab) return rememberedTab;

  return 'basic';
}

const activeTab = ref(resolveInitialTab());

function syncTabToRoute(tabId) {
  const currentQueryTab = resolveSettingsTab(route.query?.tab) || 'basic';
  const hasFocus = Boolean(route.query?.focus);
  if (!hasFocus && currentQueryTab === tabId) return;

  const nextQuery = { ...route.query };
  delete nextQuery.focus;
  if (tabId === 'basic') {
    delete nextQuery.tab;
  } else {
    nextQuery.tab = tabId;
  }

  Promise.resolve(router.replace({ query: nextQuery })).catch(() => {});
}

function handleActiveTabUpdate(nextTab) {
  const resolved = resolveSettingsTab(nextTab) || 'basic';
  activeTab.value = resolved;
  writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, resolved);
  syncTabToRoute(resolved);

  if (typeof window !== 'undefined' && window.scrollY > 120) {
    window.scrollTo?.({ top: 0, behavior: 'auto' });
  }
}

// The dashboard's "去设置 Token" buttons land here with `?focus=`. Without
const highlightedFocusId = ref('');
let highlightTimer = null;

function applyFocusFromQuery() {
  const focus = route.query?.focus;
  const tab = resolveSettingsFocusTab(focus);
  if (!tab) return false;

  activeTab.value = tab;
  writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, tab);

  const anchorId = resolveSettingsFocusAnchor(focus);
  if (!anchorId) return true;

  highlightedFocusId.value = anchorId;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightedFocusId.value = '';
  }, 2400);

  nextTick(() => {
    const target = typeof document !== 'undefined' ? document.getElementById(anchorId) : null;
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  });

  return true;
}

function syncStateOnEnter() {
  if (applyFocusFromQuery()) return;

  const queryTab = resolveSettingsTab(route.query?.tab);
  if (queryTab) {
    activeTab.value = queryTab;
    writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, queryTab);
    return;
  }

  if (activeTab.value !== 'basic') {
    syncTabToRoute(activeTab.value);
  }
}

onMounted(() => {
  loadSettings();
  syncStateOnEnter();
});

onActivated(() => {
  loadSettings();
  syncStateOnEnter();
});

watch(isLoading, (loading, wasLoading) => {
  if (wasLoading && !loading && resolveSettingsFocusTab(route.query?.focus)) {
    applyFocusFromQuery();
  }
});

watch(
  () => route.query.focus,
  () => {
    applyFocusFromQuery();
  },
);

watch(
  () => route.query.tab,
  (newRawTab, oldRawTab) => {
    if (resolveSettingsFocusTab(route.query?.focus)) return;

    const nextTab = resolveSettingsTab(newRawTab);
    if (nextTab) {
      activeTab.value = nextTab;
      writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, nextTab);
      return;
    }

    if (oldRawTab !== undefined && newRawTab === undefined) {
      activeTab.value = 'basic';
      writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, 'basic');
    }
  },
);

onUnmounted(() => {
  clearTimeout(highlightTimer);
});
</script>

<template>
  <div class="pb-10 md:pb-0">
    <SettingsContent
      :active-tab="activeTab"
      :disguise-config="disguiseConfig"
      :export-backup="exportBackup"
      :handle-reset="handleReset"
      :has-whitespace="hasWhitespace"
      :highlighted-focus-id="highlightedFocusId"
      :import-backup="importBackup"
      :is-loading="isLoading"
      :is-saving="isSaving"
      :restart-countdown="restartCountdown"
      :settings="settings"
      layout-class="h-full"
      @save="handleSave"
      @update:active-tab="handleActiveTabUpdate"
      @reload-now="() => window.location.reload()"
    />
  </div>
</template>
