<script setup>
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();
    const props = defineProps({
        isSelectionMode: {
            type: Boolean,
            default: false,
        },
        isAllSelected: {
            type: Boolean,
            default: false,
        },
        selectedCount: {
            type: Number,
            default: 0,
        },
        groups: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits(['toggle-select-all', 'batch-group', 'batch-delete', 'exit']);

    const handleMoveToGroup = () => {
        emit('batch-group');
    };
</script>

<template>
    <Transition name="slide-fade-sm">
        <div
            v-if="isSelectionMode"
            class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] sm:w-auto max-w-xl bg-[#171717] shadow-none rounded-md px-4 py-3 sm:px-6 sm:py-3 flex flex-col sm:flex-row items-center justify-between sm:justify-center gap-3 sm:gap-4 z-50 border border-zinc-800"
        >
            <div class="flex items-center justify-between w-full sm:w-auto gap-4">
                <button
                    @click="emit('toggle-select-all')"
                    class="text-xs font-medium text-zinc-200 hover:text-white underline underline-offset-2 whitespace-nowrap"
                >
                    {{ isAllSelected ? t('actions.deselectAll') : t('actions.selectAllPage') }}
                </button>
                <span
                    class="text-xs font-mono font-medium text-zinc-400 whitespace-nowrap"
                    >{{ t('manualNodes.selectedCount', { count: selectedCount }) }}</span
                >
            </div>

            <div
                class="h-px w-full sm:w-px sm:h-4 bg-zinc-800 flex-shrink-0 hidden sm:block"
            ></div>

            <div class="grid grid-cols-2 sm:flex sm:items-center w-full sm:w-auto gap-3 sm:gap-2">
                <div
                    class="col-span-2 sm:col-span-1 flex items-center justify-center w-full sm:w-auto gap-2 sm:gap-3 overflow-x-auto no-scrollbar mask-gradient"
                >
                    <span class="text-xs text-zinc-500 hidden sm:inline">{{
                        t('manualNodes.bulkActionsLabel')
                    }}</span>
                    <div class="flex items-center gap-3 sm:gap-2 w-full sm:w-auto">
                        <button
                            @click="handleMoveToGroup"
                            class="flex-1 sm:flex-none text-xs font-semibold px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded-md border border-zinc-100 hover:bg-white transition-colors whitespace-nowrap"
                        >
                            {{ t('manualNodes.moveToGroup') }}
                        </button>
                    </div>
                </div>

                <div
                    class="col-span-2 sm:col-span-1 flex items-center justify-center w-full sm:w-auto gap-3 sm:gap-2 shrink-0 sm:ml-1 sm:pl-2 sm:border-l border-zinc-800 pt-1 sm:pt-0 border-t sm:border-t-0"
                >
                    <button
                        @click="emit('batch-delete')"
                        class="flex-1 sm:flex-none justify-center text-xs text-red-400 hover:text-red-300 font-medium whitespace-nowrap flex items-center gap-1 px-3 py-1.5 border border-zinc-800 hover:border-red-900/60 hover:bg-red-950/40 bg-transparent rounded-md transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        {{ t('actions.delete') }}
                    </button>
                    <button
                        @click="emit('exit')"
                        class="flex-1 sm:flex-none justify-center text-xs text-zinc-400 hover:text-zinc-100 whitespace-nowrap px-3 py-1.5 border border-zinc-800 bg-transparent hover:bg-zinc-900 rounded-md transition-colors"
                    >
                        {{ t('actions.exit') }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
    .slide-fade-sm-enter-active,
    .slide-fade-sm-leave-active {
        transition: all 0.2s ease-out;
    }
    .slide-fade-sm-enter-from,
    .slide-fade-sm-leave-to {
        transform: translateY(-10px);
        opacity: 0;
    }
</style>
