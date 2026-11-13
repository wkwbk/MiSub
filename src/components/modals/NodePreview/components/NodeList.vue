<script setup>
    import { computed } from 'vue';
    import { Check, Copy } from 'lucide-vue-next';
    import { useVirtualScroll } from '@/composables/useVirtualScroll.js';
    import { useI18n } from '../../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        nodes: {
            type: Array,
            default: () => [],
        },
        copiedNodeId: {
            type: String,
            default: '',
        },
        parseNodeInfo: {
            type: Function,
            required: true,
        },
        getProtocolStyle: {
            type: Function,
            required: true,
        },
        // [New] Selection Mode Props
        selectionMode: {
            type: Boolean,
            default: false,
        },
        selectedUrls: {
            type: Set,
            default: () => new Set(),
        },
    });

    const emit = defineEmits(['copy', 'toggle-select']);

    const nodesRef = computed(() => props.nodes);
    const containerHeight = 500;
    const itemHeight = 52;

    const { containerRef, visibleItems, totalHeight, offsetY } = useVirtualScroll({
        items: nodesRef,
        itemHeight,
        containerHeight,
        overscan: 10,
    });

    const handleRowClick = (node) => {
        if (props.selectionMode) {
            emit('toggle-select', node.url);
        }
    };
</script>

<template>
    <div
        class="hidden lg:flex flex-1 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131515] shadow-none"
    >
        <div ref="containerRef" class="h-full overflow-y-auto w-full">
            <div class="w-full">
                <div class="w-full overflow-hidden">
                    <!-- 表头 -->
                    <div
                        class="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#171717]"
                    >
                        <div
                            class="grid min-h-[2.75rem] grid-cols-12 gap-2 px-4 py-2 items-center text-[11px] font-medium text-zinc-500 uppercase tracking-wider"
                        >
                            <div
                                v-if="selectionMode"
                                class="col-span-1 flex justify-center text-zinc-500"
                            >
                                Pick
                            </div>
                            <div :class="selectionMode ? 'col-span-3' : 'col-span-4'">
                                Node Name
                            </div>
                            <div class="col-span-3 hidden sm:block">Server Address</div>
                            <div class="col-span-2 hidden md:block text-center">Port</div>
                            <div class="col-span-1 hidden sm:block text-center">Type</div>
                            <div class="col-span-1 hidden sm:block text-center">Region</div>
                            <div class="col-span-1 text-center">Action</div>
                        </div>
                    </div>

                    <!-- 数据行 - 虚拟滚动 -->
                    <div
                        class="bg-white dark:bg-[#131515]"
                        :style="{ height: totalHeight + 'px', position: 'relative' }"
                    >
                        <div :style="{ transform: `translateY(${offsetY}px)` }">
                            <div
                                v-for="node in visibleItems.items"
                                :key="`${node.url}_${node._virtualIndex}`"
                                @click="handleRowClick(node)"
                                class="group border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                                :class="{
                                    'bg-zinc-100/70 dark:bg-zinc-900':
                                        selectionMode && selectedUrls.has(node.url),
                                    'cursor-pointer': selectionMode,
                                }"
                            >
                                <div
                                    class="grid min-h-[3.25rem] grid-cols-12 gap-2 px-4 py-2.5 items-center"
                                >
                                    <!-- Checkbox (Selection Mode Only) -->
                                    <div
                                        v-if="selectionMode"
                                        class="col-span-1 flex justify-center"
                                    >
                                        <div
                                            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                                            :class="
                                                selectedUrls.has(node.url)
                                                    ? 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100 text-zinc-100 dark:text-zinc-900'
                                                    : 'border-zinc-300 dark:border-zinc-700'
                                            "
                                        >
                                            <Check
                                                v-if="selectedUrls.has(node.url)"
                                                class="w-3 h-3"
                                                :stroke-width="2.5"
                                            />
                                        </div>
                                    </div>

                                    <!-- 节点名称 -->
                                    <div :class="selectionMode ? 'col-span-3' : 'col-span-4'">
                                        <span
                                            class="text-xs font-medium text-zinc-900 dark:text-zinc-100 block overflow-hidden"
                                            :title="parseNodeInfo(node).name"
                                            style="text-overflow: ellipsis; white-space: nowrap"
                                        >
                                            {{ parseNodeInfo(node).name }}
                                        </span>
                                    </div>

                                    <!-- 服务器 (桌面端) -->
                                    <div class="col-span-3 hidden sm:block">
                                        <span
                                            class="text-xs text-zinc-500 font-mono block overflow-hidden"
                                            :title="parseNodeInfo(node).server"
                                            style="text-overflow: ellipsis; white-space: nowrap"
                                        >
                                            {{ parseNodeInfo(node).server }}
                                        </span>
                                    </div>

                                    <!-- 端口 (桌面端) -->
                                    <div class="col-span-2 hidden md:block text-center">
                                        <span
                                            class="text-xs text-zinc-500 font-mono block"
                                            style="min-width: 50px"
                                        >
                                            {{ parseNodeInfo(node).port }}
                                        </span>
                                    </div>

                                    <!-- 类型 (桌面端) -->
                                    <div class="col-span-1 hidden sm:block flex justify-center">
                                        <span
                                            class="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-[10px] font-mono font-medium uppercase border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                                            style="min-width: 60px"
                                        >
                                            {{ parseNodeInfo(node).protocol }}
                                        </span>
                                    </div>

                                    <!-- 地区 (桌面端) -->
                                    <div class="col-span-1 hidden sm:block flex justify-center">
                                        <span
                                            class="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-[10px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                                            style="min-width: 60px"
                                        >
                                            {{ parseNodeInfo(node).region }}
                                        </span>
                                    </div>

                                    <!-- 操作 (所有设备) -->
                                    <div class="col-span-1 flex justify-center">
                                        <button
                                            v-if="!selectionMode"
                                            @click.stop="emit('copy', node, node.url)"
                                            class="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors touch-target"
                                            :class="{
                                                'text-emerald-500': copiedNodeId === node.url,
                                            }"
                                            :aria-label="t('actions.copyNode')"
                                        >
                                            <Copy
                                                v-if="copiedNodeId !== node.url"
                                                class="w-3.5 h-3.5"
                                            />
                                            <Check v-else class="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 空状态 -->
                    <div v-if="nodes.length === 0" class="py-12 text-center text-xs text-zinc-500">
                        {{ t('nodePreview.noNodes') }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
