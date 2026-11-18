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
        :show="show"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirmSave"
        :close-on-confirm="false"
        :confirm-disabled="isSaving"
        :confirm-text="
            isSaving ? t('settings.ruleTemplatesSaving') : t('settings.ruleTemplatesSave')
        "
        size="5xl"
        :z-index="zIndex"
    >
        <template #title>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                    <h3 class="text-base font-semibold text-zinc-100">
                        {{ t('settings.ruleTemplatesTitle') }}
                    </h3>
                    <p class="mt-0.5 text-xs text-zinc-400 leading-relaxed">
                        {{ t('settings.ruleTemplatesDesc') }}
                    </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        data-testid="modal-refresh-rule-templates"
                        @click="managerRef?.refreshTemplates?.()"
                        :disabled="isLoading"
                        class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                    >
                        {{
                            isLoading
                                ? t('settings.ruleTemplatesRefreshing')
                                : t('settings.ruleTemplatesRefresh')
                        }}
                    </button>
                    <button
                        type="button"
                        data-testid="modal-new-rule-template"
                        @click="managerRef?.createTemplate?.()"
                        class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-900 hover:text-zinc-100"
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
