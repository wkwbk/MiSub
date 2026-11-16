<script setup>
    import { computed, onMounted, ref } from 'vue';
    import MigrationModal from '@/components/modals/MigrationModal.vue';
    import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
    import SettingsContent from '@/components/settings/SettingsContent.vue';

    const {
        settings,
        disguiseConfig,
        isLoading,
        isSaving,
        showMigrationModal,
        restartCountdown,
        hasWhitespace,
        isStorageTypeValid,
        loadSettings,
        handleSave,
        handleMigrationSuccess,
        handleReset,
        exportBackup,
        importBackup,
    } = useSettingsLogic();

    const activeTab = ref('basic');

    // 组件挂载时加载设置
    onMounted(() => {
        loadSettings();
    });

    const saveDisabled = computed(
        () => isSaving.value || hasWhitespace.value || !isStorageTypeValid.value
    );

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
            :is-storage-type-valid="isStorageTypeValid"
            :export-backup="exportBackup"
            :import-backup="importBackup"
            :handle-reset="handleReset"
            always-show-header
            hide-footer
            in-modal
            layout-class="!shadow-none !border-0 !rounded-none !bg-transparent"
            @save="handleSave"
            @reload-now="() => window.location.reload()"
            @migrate="showMigrationModal = true"
        />

        <MigrationModal v-model:show="showMigrationModal" @success="handleMigrationSuccess" />
    </div>
</template>

<style scoped></style>
