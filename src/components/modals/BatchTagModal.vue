<script setup>
    import { computed, ref, watch } from 'vue';
    import { Tag } from '@lucide/vue';
    import Modal from '@/components/forms/Modal.vue';
    import TagInput from '@/components/ui/TagInput.vue';
    import { useI18n } from '@/i18n/index.js';

    const props = defineProps({
        show: Boolean,
        tags: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits(['update:show', 'confirm']);
    const { t } = useI18n();

    const mode = ref('append'); // 'append' | 'replace' | 'remove' | 'clear'
    const selectedTags = ref([]);

    const modes = computed(() => [
        { key: 'append', label: t('tags.batchModeAppend') },
        { key: 'replace', label: t('tags.batchModeReplace') },
        { key: 'remove', label: t('tags.batchModeRemove') },
        { key: 'clear', label: t('tags.batchModeClear') },
    ]);

    const modeDescription = computed(() => {
        switch (mode.value) {
            case 'replace':
                return t('tags.batchReplaceDesc');
            case 'remove':
                return t('tags.batchRemoveDesc');
            case 'clear':
                return t('tags.batchClearDesc');
            case 'append':
            default:
                return t('tags.batchAppendDesc');
        }
    });

    watch(
        () => props.show,
        (visible) => {
            if (visible) {
                mode.value = 'append';
                selectedTags.value = [];
            }
        }
    );

    const handleConfirm = () => {
        emit('confirm', {
            mode: mode.value,
            tags: mode.value === 'clear' ? [] : selectedTags.value,
        });
        emit('update:show', false);
    };
</script>

<template>
    <Modal
        :show="show"
        size="lg"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirm"
    >
        <template #title>
            <div class="flex items-center gap-2">
                <Tag class="h-4 w-4 text-zinc-500" />
                <h3 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ t('tags.batchTitle') }}
                </h3>
            </div>
        </template>

        <template #body>
            <div class="space-y-4 py-2">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                        v-for="item in modes"
                        :key="item.key"
                        type="button"
                        class="px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer"
                        :class="
                            mode === item.key
                                ? 'bg-zinc-900 text-zinc-100 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 font-semibold'
                                : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                        "
                        @click="mode = item.key"
                    >
                        {{ item.label }}
                    </button>
                </div>

                <p class="text-xs text-zinc-500">
                    {{ modeDescription }}
                </p>

                <div v-if="mode !== 'clear'" class="flex flex-col">
                    <label class="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {{ t('tags.label') }}
                    </label>
                    <TagInput
                        v-model="selectedTags"
                        :suggestions="tags"
                        :placeholder="t('tags.placeholder')"
                    />
                </div>
            </div>
        </template>
    </Modal>
</template>
