<script setup>
    import { Check } from 'lucide-vue-next';
    import StatusIndicator from './StatusIndicator.vue';
    import { useI18n } from '@/i18n/index.js';

    defineProps({
        isDirty: Boolean,
        saveState: String,
    });

    defineEmits(['save', 'discard']);
    const { t } = useI18n();
</script>

<template>
    <Transition name="slide-fade">
        <div
            v-if="isDirty || saveState === 'success'"
            class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[95%] max-w-2xl px-4 py-3 rounded-md flex flex-row items-center justify-between transition-all duration-200 gap-4 shadow-none bg-[#171717] border border-zinc-800"
        >
            <div class="flex items-center gap-2.5">
                <span
                    class="inline-flex rounded-full h-1.5 w-1.5 shrink-0"
                    :class="saveState === 'success' ? 'bg-emerald-500' : 'bg-amber-500'"
                ></span>
                <p class="text-xs font-medium text-zinc-200">
                    {{
                        saveState === 'success'
                            ? t('common.allChangesSaved')
                            : t('common.unsavedChanges')
                    }}
                </p>
            </div>

            <div class="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                    v-if="saveState !== 'success'"
                    @click="$emit('discard')"
                    class="flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 border border-zinc-800 bg-transparent hover:bg-zinc-900 transition-colors rounded-md whitespace-nowrap"
                >
                    {{ t('actions.discard') }}
                </button>
                <button
                    @click.prevent="$emit('save')"
                    :disabled="saveState !== 'idle'"
                    class="flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap bg-zinc-100 text-zinc-900 hover:bg-white border border-zinc-100"
                >
                    <div v-if="saveState === 'saving'" class="flex items-center">
                        <StatusIndicator status="loading" size="sm" class="mr-2" />
                        <span>{{ t('settings.saving') }}</span>
                    </div>
                    <div v-else-if="saveState === 'success'" class="flex items-center">
                        <Check class="w-3.5 h-3.5 mr-1.5" />
                        <span>{{ t('common.saved') }}</span>
                    </div>
                    <span v-else>{{ t('common.saveNow') }}</span>
                </button>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
    .slide-fade-enter-active,
    .slide-fade-leave-active {
        transition: all 0.3s ease-out;
    }

    .slide-fade-enter-from,
    .slide-fade-leave-to {
        transform: translateY(-20px);
        opacity: 0;
    }
</style>
