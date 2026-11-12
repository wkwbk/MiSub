<script setup>
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();
    import { ref, watch } from 'vue';
    import Modal from '../forms/Modal.vue';
    import SettingsPanel from './SettingsPanel.vue';

    const props = defineProps({
        show: Boolean,
        exportBackup: Function,
        importBackup: Function,
    });

    const emit = defineEmits(['update:show']);

    const settingsPanelRef = ref(null);

    const handleConfirm = async () => {
        if (!settingsPanelRef.value) return;

        const didSave = await settingsPanelRef.value.handleSave();
        if (didSave) {
            emit('update:show', false);
        }
    };
</script>

<template>
    <Modal
        :show="show"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirm"
        :close-on-confirm="false"
        size="6xl"
    >
        <template #title>
            <div
                class="bg-transparent px-1 py-0.5"
            >
                <h3 class="text-base font-semibold text-zinc-100">
                    {{ t('settings.title') }}
                </h3>
            </div>
        </template>
        <template #body>
            <SettingsPanel
                ref="settingsPanelRef"
                :export-backup="props.exportBackup"
                :import-backup="props.importBackup"
            />
        </template>
    </Modal>
</template>
