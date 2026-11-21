<script setup>
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n/index.js';
import Modal from '@/components/ui/Modal.vue';
import SettingsPanel from '@/components/modals/SettingsPanel.vue';

const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  exportBackup: Function,
  importBackup: Function,
});

const emit = defineEmits(['update:show']);

const settingsPanelRef = ref(null);
const isSaving = computed(() => Boolean(settingsPanelRef.value?.isSaving));
const saveDisabled = computed(() => Boolean(settingsPanelRef.value?.saveDisabled));

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
    :close-on-confirm="false"
    :confirm-disabled="saveDisabled"
    :confirm-text="isSaving ? t('settings.saving') : t('settings.saveChanges')"
    :show="show"
    body-class="p-0"
    size="6xl"
    @confirm="handleConfirm"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="bg-transparent px-1 py-0.5">
        <h3 class="text-base font-semibold text-fg">
          {{ t('settings.title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <SettingsPanel ref="settingsPanelRef" :export-backup="props.exportBackup" :import-backup="props.importBackup" />
    </template>
  </Modal>
</template>
