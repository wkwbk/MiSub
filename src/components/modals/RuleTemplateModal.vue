<script setup>
import { computed, ref } from 'vue';
import Modal from '@/components/forms/Modal.vue';
import RuleTemplateManager from '@/components/settings/sections/ServiceSettings/RuleTemplateManager.vue';
import { useI18n } from '@/i18n/index.js';

defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  zIndex: {
    type: [String, Number],
    default: 1050000,
  },
});

const emit = defineEmits(['update:show', 'saved']);
const { t } = useI18n();

const managerRef = ref(null);
const lastSavedTemplateId = ref('');

const isSaving = computed(() => Boolean(managerRef.value?.isSaving));
const isLoading = computed(() => Boolean(managerRef.value?.isLoading));

function handleManagerSaved(templateId) {
  lastSavedTemplateId.value = templateId || '';
}

async function handleConfirmSave() {
  if (!managerRef.value) return;
  const ok = await managerRef.value.saveTemplates();
  if (ok) {
    emit('saved', lastSavedTemplateId.value);
    emit('update:show', false);
  }
}
</script>

<template>
  <Modal
    :close-on-confirm="false"
    :confirm-disabled="isSaving"
    :confirm-text="isSaving ? t('settings.ruleTemplatesSaving') : t('settings.ruleTemplatesSave')"
    :show="show"
    :z-index="zIndex"
    size="5xl"
    @confirm="handleConfirmSave"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h3 class="text-base font-semibold text-fg">
            {{ t('settings.ruleTemplatesTitle') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.ruleTemplatesDesc') }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            :disabled="isLoading"
            class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-hover hover:text-fg disabled:opacity-50"
            data-testid="modal-refresh-rule-templates"
            type="button"
            @click="managerRef?.refreshTemplates?.()"
          >
            {{ isLoading ? t('settings.ruleTemplatesRefreshing') : t('settings.ruleTemplatesRefresh') }}
          </button>
          <button
            class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover hover:text-fg"
            data-testid="modal-new-rule-template"
            type="button"
            @click="managerRef?.createTemplate?.()"
          >
            {{ t('settings.ruleTemplatesNew') }}
          </button>
        </div>
      </div>
    </template>

    <template #body>
      <RuleTemplateManager ref="managerRef" @saved="handleManagerSaved" />
    </template>
  </Modal>
</template>
