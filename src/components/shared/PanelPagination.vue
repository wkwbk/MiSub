<script setup>
    import { computed, ref, watch } from 'vue';
    import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        variant: {
            type: String,
            default: 'simple',
        },
        currentPage: {
            type: Number,
            default: 1,
        },
        totalPages: {
            type: Number,
            default: 1,
        },
        totalItems: {
            type: Number,
            default: 0,
        },
        itemsPerPage: {
            type: Number,
            default: 24,
        },
        itemsPerPageOptions: {
            type: Array,
            default: () => [24, 48, 96, -1],
        },
        showItemsPerPage: {
            type: Boolean,
            default: false,
        },
        showTotalItems: {
            type: Boolean,
            default: false,
        },
        hideWhenSinglePage: {
            type: Boolean,
            default: true,
        },
    });

    const emit = defineEmits(['change-page', 'update:itemsPerPage']);

    const { t } = useI18n();

    const isPanelVariant = computed(() => props.variant === 'panel');

    const shouldShow = computed(() => {
        if (!props.hideWhenSinglePage) return true;

        if (isPanelVariant.value) {
            return props.totalPages > 1 || (props.showItemsPerPage && props.itemsPerPage !== 24);
        }

        return props.totalPages > 1;
    });

    const pageInput = ref('');

    watch(
        () => props.currentPage,
        (newValue) => {
            pageInput.value = newValue;
        },
        { immediate: true }
    );

    function emitPageChange(page) {
        const parsed = parseInt(page, 10);
        if (Number.isNaN(parsed)) return;

        const clamped = Math.min(Math.max(parsed, 1), Math.max(props.totalPages, 1));
        pageInput.value = clamped;
        emit('change-page', clamped);
    }

    function jumpToPage() {
        emitPageChange(pageInput.value);
    }

    function handleItemsPerPageChange(event) {
        emit('update:itemsPerPage', parseInt(event.target.value, 10));
    }
</script>

<template>
    <div
        v-if="shouldShow && isPanelVariant"
        class="panel-pagination-shell mt-4 px-4 py-3 bg-[#171717] rounded-md shadow-none border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors"
    >
        <div class="flex items-center space-x-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
            <span v-if="showTotalItems">{{
                t('common.totalProfiles', { count: totalItems })
            }}</span>
            <div v-if="showItemsPerPage" class="flex items-center space-x-2">
                <span>{{ t('common.perPage') }}</span>
                <select
                    :value="itemsPerPage"
                    @change="handleItemsPerPageChange"
                    class="form-select rounded-md text-xs font-mono py-1 pl-2 pr-6 border border-zinc-800 bg-transparent text-zinc-200 focus:border-zinc-500 focus-visible:outline-none"
                >
                    <option v-for="option in itemsPerPageOptions" :key="option" :value="option">
                        {{ option === -1 ? t('common.all') : option }}
                    </option>
                </select>
            </div>
            <slot name="panel-left" />
        </div>

        <div v-if="totalPages > 1" class="flex items-center space-x-2">
            <button
                @click="emitPageChange(1)"
                :disabled="currentPage === 1"
                class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-400 hover:text-zinc-100 border border-zinc-800 touch-target"
                :title="t('common.firstPage')"
                :aria-label="t('common.firstPage')"
            >
                <ChevronsLeft class="w-4 h-4" />
            </button>
            <button
                @click="emitPageChange(currentPage - 1)"
                :disabled="currentPage === 1"
                class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-400 hover:text-zinc-100 border border-zinc-800 touch-target"
                :title="t('common.prevPage')"
                :aria-label="t('common.prevPage')"
            >
                <ChevronLeft class="w-4 h-4" />
            </button>

            <div class="flex items-center space-x-1 font-mono">
                <input
                    type="number"
                    v-model="pageInput"
                    @keydown.enter="jumpToPage"
                    @blur="jumpToPage"
                    class="w-14 text-center text-xs font-mono py-1 border border-zinc-800 rounded-md bg-transparent text-zinc-200 focus:border-zinc-500 focus-visible:outline-none appearance-none remove-arrow touch-target"
                    :aria-label="t('common.pageNumber')"
                />
                <span class="text-xs text-zinc-500">/ {{ totalPages }}</span>
            </div>

            <button
                @click="emitPageChange(currentPage + 1)"
                :disabled="currentPage === totalPages"
                class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-400 hover:text-zinc-100 border border-zinc-800 touch-target"
                :title="t('common.nextPage')"
                :aria-label="t('common.nextPage')"
            >
                <ChevronRight class="w-4 h-4" />
            </button>
            <button
                @click="emitPageChange(totalPages)"
                :disabled="currentPage === totalPages"
                class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-400 hover:text-zinc-100 border border-zinc-800 touch-target"
                :title="t('common.lastPage')"
                :aria-label="t('common.lastPage')"
            >
                <ChevronsRight class="w-4 h-4" />
            </button>
        </div>
        <div v-else class="w-[100px]"></div>
    </div>

    <div
        v-else-if="shouldShow"
        class="flex flex-wrap justify-center items-center gap-3 mt-6 text-xs font-mono"
    >
        <button
            @click="emitPageChange(currentPage - 1)"
            :disabled="currentPage === 1"
            class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-zinc-300 border border-zinc-800 hover:bg-zinc-900 touch-target"
        >
            &laquo; {{ t('common.prevPage') }}
        </button>
        <span
            class="text-zinc-400 bg-transparent border border-zinc-800 px-3 py-1 rounded-md"
            >{{ t('common.pageOf', { current: currentPage, total: totalPages }) }}</span
        >
        <button
            @click="emitPageChange(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-zinc-300 border border-zinc-800 hover:bg-zinc-900 touch-target"
        >
            {{ t('common.nextPage') }} &raquo;
        </button>
    </div>
</template>

<style scoped>
    .remove-arrow::-webkit-inner-spin-button,
    .remove-arrow::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    .remove-arrow {
        -moz-appearance: textfield;
        appearance: textfield;
    }
</style>
