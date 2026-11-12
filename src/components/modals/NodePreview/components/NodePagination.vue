<script setup>
    import { useI18n } from '../../../../i18n/index.js';

    const { t } = useI18n();
    import { computed } from 'vue';

    const props = defineProps({
        currentPage: {
            type: Number,
            default: 1,
        },
        totalPages: {
            type: Number,
            default: 1,
        },
        pageSize: {
            type: Number,
            default: 24,
        },
        totalItems: {
            type: Number,
            default: 0,
        },
    });

    const emit = defineEmits(['go-to-page']);

    const pageNumbers = computed(() => {
        const pages = [];
        const current = props.currentPage;
        const total = props.totalPages;

        if (total <= 7) {
            for (let i = 1; i <= total; i++) {
                pages.push(i);
            }
        } else {
            if (current <= 3) {
                for (let i = 1; i <= 5; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(total);
            } else if (current >= total - 2) {
                pages.push(1);
                pages.push('...');
                for (let i = total - 4; i <= total; i++) {
                    pages.push(i);
                }
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = current - 1; i <= current + 1; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(total);
            }
        }

        return pages;
    });

    const goToPage = (page) => {
        if (page < 1 || page > props.totalPages) return;
        emit('go-to-page', page);
    };
</script>

<template>
    <div
        v-if="totalPages > 1"
        class="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-transparent pt-4 mt-4"
    >
        <!-- 桌面端完整分页 -->
        <div v-if="currentPage > 0" class="hidden sm:flex items-center justify-between">
            <div class="text-xs font-mono text-zinc-500">
                {{
                    t('pagination.showingRange', {
                        from: (currentPage - 1) * pageSize + 1,
                        to: Math.min(currentPage * pageSize, totalItems),
                        total: totalItems,
                    })
                }}
            </div>
            <div class="flex items-center space-x-1.5">
                <!-- 上一页 -->
                <button
                    @click="goToPage(currentPage - 1)"
                    :disabled="currentPage <= 1"
                    class="rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {{ t('common.prevPage') }}
                </button>

                <!-- 页码 -->
                <div class="flex space-x-1">
                    <button
                        v-for="page in pageNumbers"
                        :key="page"
                        @click="page !== '...' && goToPage(page)"
                        :class="{
                            'rounded-md border px-2.5 py-1.5 text-xs font-mono font-medium transition-colors': true,
                            'bg-zinc-900 border-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900': page === currentPage,
                            'border-zinc-300 dark:border-zinc-800 bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900':
                                page !== currentPage && page !== '...',
                            'opacity-50 cursor-not-allowed border-transparent': page === '...',
                        }"
                        :disabled="page === '...'"
                    >
                        {{ page }}
                    </button>
                </div>

                <!-- 下一页 -->
                <button
                    @click="goToPage(currentPage + 1)"
                    :disabled="currentPage >= totalPages"
                    class="rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {{ t('common.nextPage') }}
                </button>
            </div>
        </div>

        <!-- 移动端简化分页 -->
        <div class="sm:hidden">
            <div class="mb-3 flex items-center justify-between">
                <div class="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                    {{ t('pagination.pageOfShort', { current: currentPage, total: totalPages }) }}
                </div>
                <div class="text-xs font-mono text-zinc-500">
                    {{ t('pagination.totalItems', { total: totalItems }) }}
                </div>
            </div>
            <div class="flex items-center justify-center space-x-3">
                <button
                    @click="goToPage(currentPage - 1)"
                    :disabled="currentPage <= 1"
                    class="max-w-[100px] flex-1 rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {{ t('common.prevPage') }}
                </button>
                <span class="px-3 py-1 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">
                    {{ currentPage }}
                </span>
                <button
                    @click="goToPage(currentPage + 1)"
                    :disabled="currentPage >= totalPages"
                    class="max-w-[100px] flex-1 rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {{ t('common.nextPage') }}
                </button>
            </div>
        </div>
    </div>
</template>
