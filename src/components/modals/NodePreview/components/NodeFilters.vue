<script setup>
    import { computed } from 'vue';
    import { useI18n } from '../../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        searchQuery: {
            type: String,
            default: '',
        },
        protocolFilter: {
            type: String,
            default: 'all',
        },
        regionFilter: {
            type: String,
            default: 'all',
        },
        viewMode: {
            type: String,
            default: 'list',
        },
        showProcessed: {
            type: Boolean,
            default: false,
        },
        availableProtocols: {
            type: Array,
            default: () => [],
        },
        availableRegions: {
            type: Array,
            default: () => [],
        },
        profileId: {
            type: String,
            default: '',
        },
        apiEndpoint: {
            type: String,
            default: '',
        },
    });

    const emit = defineEmits([
        'update:searchQuery',
        'update:protocolFilter',
        'update:regionFilter',
        'update:viewMode',
        'update:showProcessed',
    ]);

    const searchModel = computed({
        get: () => props.searchQuery,
        set: (val) => emit('update:searchQuery', val),
    });

    const protocolModel = computed({
        get: () => props.protocolFilter,
        set: (val) => emit('update:protocolFilter', val),
    });

    const regionModel = computed({
        get: () => props.regionFilter,
        set: (val) => emit('update:regionFilter', val),
    });

    const isProcessedToggleVisible = computed(() => {
        return props.profileId && props.apiEndpoint !== '/api/public/preview';
    });
</script>

<template>
    <!-- 响应式网格布局 -->
    <div
        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent p-3.5 shadow-none sm:p-4"
    >
        <div class="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:items-end sm:gap-4">
            <!-- 搜索 (移动端置顶) -->
            <div class="w-full">
                <label
                    class="block text-[10px] uppercase font-medium text-zinc-500 mb-1.5 tracking-wider"
                >
                    Node Search
                </label>
                <div class="flex gap-2">
                    <div class="relative flex-1 group">
                        <input
                            v-model="searchModel"
                            type="text"
                            placeholder="Search nodes..."
                            class="w-full rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#131515] px-3 py-2 pr-9 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-hidden transition-colors shadow-none"
                            :aria-label="t('nodePreview.searchLabel')"
                        />
                        <div
                            class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                ></path>
                            </svg>
                        </div>
                    </div>

                    <!-- 处理模式 toggler (仅移动端、订阅组且非公开页显示) -->
                    <button
                        v-if="isProcessedToggleVisible"
                        @click="emit('update:showProcessed', !showProcessed)"
                        :class="
                            showProcessed
                                ? 'bg-zinc-900 text-zinc-100 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                                : 'bg-transparent text-zinc-500 border-zinc-300 dark:border-zinc-800'
                        "
                        class="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-md border transition-colors lg:hidden"
                        :aria-label="t('nodePreview.toggleProcessed')"
                    >
                        <svg
                            v-if="!showProcessed"
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                            ></path>
                        </svg>
                        <svg
                            v-else
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                            ></path>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- 筛选器组 (移动端并排) -->
            <div class="grid grid-cols-2 gap-3 lg:contents">
                <!-- 协议筛选 -->
                <div>
                    <label
                        class="block text-[10px] uppercase font-medium text-zinc-500 mb-1.5 tracking-wider"
                    >
                        Type
                    </label>
                    <select
                        v-model="protocolModel"
                        class="w-full rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#131515] px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-hidden transition-colors shadow-none"
                    >
                        <option value="all">ALL PROTOCOLS</option>
                        <option
                            v-for="protocol in availableProtocols"
                            :key="protocol"
                            :value="protocol"
                        >
                            {{ protocol.toUpperCase() }}
                        </option>
                    </select>
                </div>

                <!-- 地区筛选 -->
                <div>
                    <label
                        class="block text-[10px] uppercase font-medium text-zinc-500 mb-1.5 tracking-wider"
                    >
                        Region
                    </label>
                    <select
                        v-model="regionModel"
                        class="w-full rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#131515] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-hidden transition-colors shadow-none"
                    >
                        <option value="all">ALL REGIONS</option>
                        <option v-for="region in availableRegions" :key="region" :value="region">
                            {{ region }}
                        </option>
                    </select>
                </div>
            </div>

            <!-- 视图切换 & 规则处理 (Desktop Combined) -->
            <div class="hidden lg:flex gap-6">
                <!-- 视图切换 -->
                <div>
                    <label
                        class="block text-[10px] uppercase font-medium text-zinc-500 mb-1.5 tracking-wider"
                    >
                        Layout
                    </label>
                    <div class="inline-flex items-center border border-zinc-300 dark:border-zinc-800 rounded-md overflow-hidden divide-x divide-zinc-300 dark:divide-zinc-800">
                        <button
                            @click="emit('update:viewMode', 'list')"
                            :class="
                                viewMode === 'list'
                                    ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                    : 'bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                            "
                            class="flex h-[36px] w-[36px] items-center justify-center text-sm font-medium transition-colors"
                            :title="t('common.listView')"
                            :aria-label="t('common.listView')"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 6h16M4 10h16M4 14h16"
                                ></path>
                            </svg>
                        </button>
                        <button
                            @click="emit('update:viewMode', 'card')"
                            :class="
                                viewMode === 'card'
                                    ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                    : 'bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                            "
                            class="flex h-[36px] w-[36px] items-center justify-center text-sm font-medium transition-colors"
                            :title="t('common.cardView')"
                            :aria-label="t('common.cardView')"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
                                ></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- 规则处理 -->
                <div v-if="isProcessedToggleVisible">
                    <label
                        class="block text-[10px] uppercase font-medium text-zinc-500 mb-1.5 tracking-wider"
                    >
                        Optimization
                    </label>
                    <div class="flex items-center gap-2">
                        <button
                            @click="emit('update:showProcessed', !showProcessed)"
                            :class="
                                showProcessed
                                    ? 'bg-zinc-900 text-zinc-100 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                                    : 'bg-transparent text-zinc-500 border-zinc-300 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                            "
                            class="flex h-[38px] w-[38px] items-center justify-center rounded-md border text-sm font-medium transition-colors"
                            :title="t('nodePreview.toggleRawName')"
                            :aria-label="t('nodePreview.toggleRawName')"
                        >
                            <!-- 魔法棒 Icon (处理后) -->
                            <svg
                                v-if="showProcessed"
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                ></path>
                            </svg>
                            <!-- 原材料 Icon (原始) -->
                            <svg
                                v-else
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                ></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
