<script setup>
    defineProps({
        type: {
            type: String,
            default: 'card', // card, list, dashboard
            validator: (value) => ['card', 'list', 'dashboard'].includes(value),
        },
        count: {
            type: Number,
            default: 1,
        },
    });
</script>

<template>
    <div>
        <!-- 卡片骨架屏 -->
        <template v-if="type === 'card'">
            <div
                v-for="i in count"
                :key="i"
                class="bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-md p-5 shadow-none animate-pulse"
                :style="{ '--delay-index': i - 1 }"
            >
                <div class="flex items-start justify-between mb-4">
                    <div class="flex-1">
                        <div
                            class="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-sm w-3/4 mb-2"
                        ></div>
                        <div
                            class="h-3 bg-zinc-100 dark:bg-zinc-900 rounded-sm w-1/2"
                        ></div>
                    </div>
                    <div
                        class="w-10 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-sm"
                    ></div>
                </div>
                <div class="space-y-2.5">
                    <div
                        class="h-3 bg-zinc-100 dark:bg-zinc-900 rounded-sm w-full"
                    ></div>
                    <div
                        class="h-3 bg-zinc-100 dark:bg-zinc-900 rounded-sm w-2/3"
                    ></div>
                </div>
            </div>
        </template>

        <!-- 列表骨架屏 -->
        <template v-if="type === 'list'">
            <div
                v-for="i in count"
                :key="i"
                class="flex items-center p-4 bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-none animate-pulse mb-2"
                :style="{ '--delay-index': i - 1 }"
            >
                <div
                    class="w-2 h-2 bg-zinc-300 dark:bg-zinc-700 rounded-full mr-3"
                ></div>
                <div class="flex-1">
                    <div
                        class="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-sm w-1/3 mb-2"
                    ></div>
                    <div
                        class="h-3 bg-zinc-100 dark:bg-zinc-900 rounded-sm w-1/2"
                    ></div>
                </div>
                <div
                    class="w-16 h-7 bg-zinc-200 dark:bg-zinc-800 rounded-sm"
                ></div>
            </div>
        </template>

        <!-- 仪表盘骨架屏 -->
        <template v-if="type === 'dashboard'">
            <div class="space-y-6">
                <!-- 标题区域 -->
                <div class="flex justify-between items-center">
                    <div
                        class="h-7 bg-zinc-200 dark:bg-zinc-800 rounded-sm w-48"
                    ></div>
                    <div class="flex gap-2">
                        <div
                            class="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md"
                        ></div>
                        <div
                            class="h-8 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-md"
                        ></div>
                    </div>
                </div>

                <!-- 统计卡片 (Exposed Hairline Grid) -->
                <div class="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
                    <div
                        v-for="i in 4"
                        :key="i"
                        class="bg-transparent p-5 animate-pulse"
                    >
                        <div
                            class="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-sm w-1/2 mb-3"
                        ></div>
                        <div
                            class="h-7 bg-zinc-200 dark:bg-zinc-800 rounded-sm w-3/4"
                        ></div>
                    </div>
                </div>

                <!-- 内容区域 -->
                <div class="space-y-3">
                    <div
                        v-for="i in 4"
                        :key="i"
                        class="h-16 bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-none animate-pulse"
                    ></div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
    /* 骨架屏动画 */
    .skeleton-shimmer {
        position: relative;
        overflow: hidden;
    }

    .skeleton-shimmer::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
        animation: shimmer 2s infinite;
    }

    .dark .skeleton-shimmer::after {
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    }

    @keyframes shimmer {
        0% {
            left: -100%;
        }
        100% {
            left: 100%;
        }
    }

    /* 交错动画 */
    .animate-pulse {
        animation-delay: calc(var(--delay-index) * 100ms);
    }
</style>
