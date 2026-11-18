<script setup>
    import { nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
    import SettingsContent from '@/components/settings/SettingsContent.vue';
    import {
        SETTINGS_ACTIVE_TAB_STORAGE_KEY,
        resolveSettingsFocusAnchor,
        resolveSettingsFocusTab,
        resolveSettingsTab,
    } from '@/utils/dashboard-deeplink.js';
    import {
        readSessionPreference,
        writeSessionPreference,
    } from '@/utils/session-preference.js';

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

        const rememberedTab = resolveSettingsTab(
            readSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY)
        );
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

    // --- Dashboard deep-link focus (?focus=mytoken / profileToken) ---
    // The dashboard's "去设置 Token" buttons land here with `?focus=`. Without
    // this the query was ignored and the user had to hunt for the field.
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

        // Highlight immediately so the state is authoritative; scrolling needs
        // the tab's DOM to exist, so that part waits for the next tick.
        highlightedFocusId.value = anchorId;
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
            highlightedFocusId.value = '';
        }, 2400);

        nextTick(() => {
            const target =
                typeof document !== 'undefined' ? document.getElementById(anchorId) : null;
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

    watch(isLoading, (loading, wasLoading) => {
        if (wasLoading && !loading && resolveSettingsFocusTab(route.query?.focus)) {
            applyFocusFromQuery();
        }
    });

    // A deep link can arrive while the view is already mounted (e.g. navigating
    // from the dashboard twice), so react to query changes too.
    watch(
        () => route.query.focus,
        () => {
            applyFocusFromQuery();
        }
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
        }
    );

    onUnmounted(() => {
        clearTimeout(highlightTimer);
    });
</script>

<template>
    <div class="pb-10 md:pb-0">
        <SettingsContent
            :active-tab="activeTab"
            @update:active-tab="handleActiveTabUpdate"
            :settings="settings"
            :disguise-config="disguiseConfig"
            :is-loading="isLoading"
            :is-saving="isSaving"
            :restart-countdown="restartCountdown"
            :has-whitespace="hasWhitespace"
            :highlighted-focus-id="highlightedFocusId"
            :export-backup="exportBackup"
            :import-backup="importBackup"
            :handle-reset="handleReset"
            layout-class="h-full"
            @save="handleSave"
            @reload-now="() => window.location.reload()"
        />
    </div>
</template>
