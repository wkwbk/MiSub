<script setup>
    import { computed, onMounted, ref, watch } from 'vue';
    import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
    import SettingsContent from '@/components/settings/SettingsContent.vue';
    import {
        SETTINGS_ACTIVE_TAB_STORAGE_KEY,
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

    const activeTab = ref(
        resolveSettingsTab(readSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY)) || 'basic'
    );

    watch(activeTab, (tabId) => {
        const resolved = resolveSettingsTab(tabId) || 'basic';
        writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, resolved);
    });

    // 组件挂载时加载设置
    onMounted(() => {
        loadSettings();
    });

    const saveDisabled = computed(() => isSaving.value || hasWhitespace.value);

    const handleSaveAndReturnStatus = async () => {
        return handleSave();
    };

    // 暴露 handleSave 与保存状态给父组件（SettingsModal）
    defineExpose({
        handleSave: handleSaveAndReturnStatus,
        isSaving,
        saveDisabled,
    });
</script>

<template>
    <div class="w-full bg-transparent">
        <SettingsContent
            v-model:activeTab="activeTab"
            :settings="settings"
            :disguise-config="disguiseConfig"
            :is-loading="isLoading"
            :is-saving="isSaving"
            :restart-countdown="restartCountdown"
            :has-whitespace="hasWhitespace"
            :export-backup="exportBackup"
            :import-backup="importBackup"
            :handle-reset="handleReset"
            hide-footer
            in-modal
            @save="handleSave"
            @reload-now="() => window.location.reload()"
        />
    </div>
</template>

<style scoped></style>
