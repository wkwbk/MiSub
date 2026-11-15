<script setup>
    import { Check, Copy } from 'lucide-vue-next';
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

    const handleCardClick = (node) => {
        if (props.selectionMode) {
            emit('toggle-select', node.url);
        }
    };
</script>

<template>
    <div class="min-h-0 flex-1 overflow-y-auto">
        <!-- 移动端 Mini List-Card 视图 -->
        <div class="block space-y-2 lg:hidden">
            <div
                v-for="(node, index) in nodes"
                :key="`${node.url}_${index}`"
                @click="handleCardClick(node)"
                class="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131515] p-3.5 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:-translate-y-1 hover:z-10 transition-all duration-200"
                :class="{
                    'border-zinc-500 dark:border-zinc-500 bg-zinc-50 dark:bg-[#202020]':
                        selectionMode && selectedUrls.has(node.url),
                    'cursor-pointer': selectionMode,
                }"
            >
                <!-- 左侧：图标与信息 -->
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <!-- Selection Checkbox -->
                    <div v-if="selectionMode" class="flex-shrink-0">
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

                    <div class="flex flex-col min-w-0">
                        <h4
                            class="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1"
                        >
                            {{ parseNodeInfo(node).name }}
                        </h4>
                        <div class="flex items-center gap-2">
                            <span
                                class="text-[10px] font-mono px-1.5 py-0.5 rounded-sm uppercase border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                            >
                                {{ parseNodeInfo(node).protocol }}
                            </span>
                            <span class="truncate text-[11px] text-zinc-500 font-mono">
                                {{ parseNodeInfo(node).server.split('.').slice(-2).join('.') }}:{{
                                    parseNodeInfo(node).port
                                }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- 右侧：操作按钮 -->
                <button
                    v-if="!selectionMode"
                    @click.stop="emit('copy', node, node.url)"
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    :class="{
                        'text-emerald-500': copiedNodeId === node.url,
                    }"
                    :aria-label="t('actions.copyNode')"
                >
                    <Copy v-if="copiedNodeId !== node.url" class="w-3.5 h-3.5" />
                    <Check v-else class="w-3.5 h-3.5" />
                </button>
            </div>
        </div>

        <!-- 桌面端 Grid 卡片视图 -->
        <div class="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
            <div
                v-for="(node, index) in nodes"
                :key="`${node.url}_${index}`"
                @click="handleCardClick(node)"
                class="relative bg-white dark:bg-[#131515] rounded-md border border-zinc-200 dark:border-zinc-800 p-4 group transition-all duration-200 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
                :class="[
                    selectionMode ? 'cursor-pointer' : '',
                    selectionMode && selectedUrls.has(node.url)
                        ? 'border-zinc-500 dark:border-zinc-500 bg-zinc-50 dark:bg-[#202020]'
                        : '',
                ]"
            >
                <!-- Selection Badge -->
                <div v-if="selectionMode" class="absolute top-4 right-4">
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

                <div class="flex flex-col h-full">
                    <!-- 节点名称和协议标签 -->
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="min-w-0 flex-1">
                            <h4
                                class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate"
                            >
                                {{ parseNodeInfo(node).name }}
                            </h4>
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                <span
                                    class="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono font-medium uppercase border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                                >
                                    {{ parseNodeInfo(node).protocol }}
                                </span>
                                <span
                                    class="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                                >
                                    {{ parseNodeInfo(node).region || 'UNKNOWN' }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 服务器信息 -->
                    <div class="mt-auto pt-3 border-t border-zinc-200 dark:border-zinc-800">
                        <div class="flex items-center justify-between">
                            <div class="min-w-0">
                                <div
                                    class="text-[10px] text-zinc-500 mb-0.5 font-medium uppercase tracking-wider"
                                >
                                    Endpoint
                                </div>
                                <div
                                    class="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate"
                                >
                                    {{ parseNodeInfo(node).server }}:{{ parseNodeInfo(node).port }}
                                </div>
                            </div>

                            <!-- 复制按钮 -->
                            <button
                                v-if="!selectionMode"
                                @click.stop="emit('copy', node, node.url)"
                                class="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                                :class="{
                                    'text-emerald-500': copiedNodeId === node.url,
                                }"
                                :aria-label="t('actions.copyNode')"
                            >
                                <Copy v-if="copiedNodeId !== node.url" class="w-3.5 h-3.5" />
                                <Check v-else class="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .animate-scale-in {
        animation: scaleIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    @keyframes scaleIn {
        from {
            opacity: 0;
            transform: scale(0.5);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
</style>
