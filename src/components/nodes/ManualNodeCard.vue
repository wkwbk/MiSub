<script setup>
    import { computed } from 'vue';
    import { Check, Copy, Info, Pencil, Trash2, Zap } from '@lucide/vue';
    import { extractHostAndPort } from '@/lib/utils.js';
    import { getItemTags } from '@/utils/tags.js';
    import { useToastStore } from '@/stores/toast.js';
    import { useI18n } from '@/i18n/index.js';
    import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';

    const props = defineProps({
        node: {
            type: Object,
            required: true,
        },
        isSelectionMode: Boolean,
        isSelected: Boolean,
        pingResult: Object,
        isPinging: Boolean,
    });

    const emit = defineEmits(['delete', 'edit', 'detail', 'toggle-select', 'filter-tag', 'ping']);
    const { showToast } = useToastStore();
    const { t } = useI18n();

    const nodeTags = computed(() => getItemTags(props.node));
    const visibleTags = computed(() => nodeTags.value.slice(0, 2));
    const overflowCount = computed(() => Math.max(0, nodeTags.value.length - 2));

    const getProtocol = (url) => {
        try {
            if (!url) return 'unknown';
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.startsWith('anytls://')) return 'anytls';
            if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://'))
                return 'hysteria2';
            if (lowerUrl.startsWith('hysteria://') || lowerUrl.startsWith('hy://'))
                return 'hysteria';
            if (lowerUrl.startsWith('ssr://')) return 'ssr';
            if (lowerUrl.startsWith('tuic://')) return 'tuic';
            if (lowerUrl.startsWith('ss://')) return 'ss';
            if (lowerUrl.startsWith('vmess://')) return 'vmess';
            if (lowerUrl.startsWith('vless://')) return 'vless';
            if (lowerUrl.startsWith('trojan://')) return 'trojan';
            if (lowerUrl.startsWith('socks5://') || lowerUrl.startsWith('socks://'))
                return 'socks5';
            if (lowerUrl.startsWith('snell://')) return 'snell';
            if (
                lowerUrl.startsWith('naive+https://') ||
                lowerUrl.startsWith('naive+http://') ||
                lowerUrl.startsWith('naive+quic://')
            )
                return 'naive';
            if (lowerUrl.startsWith('http')) return 'http';
        } catch {
            return 'unknown';
        }
        return 'unknown';
    };

    const protocol = computed(() => getProtocol(props.node.url));
    const hostAndPort = computed(() => extractHostAndPort(props.node.url));

    const protocolStyle = computed(() => {
        const p = protocol.value;
        switch (p) {
            case 'anytls':
                return { text: 'AnyTLS', dot: 'bg-zinc-400' };
            case 'vless':
                return { text: 'VLESS', dot: 'bg-sky-500' };
            case 'hysteria2':
                return { text: 'HY2', dot: 'bg-purple-500' };
            case 'hysteria':
                return { text: 'Hysteria', dot: 'bg-fuchsia-500' };
            case 'tuic':
                return { text: 'TUIC', dot: 'bg-cyan-500' };
            case 'trojan':
                return { text: 'TROJAN', dot: 'bg-red-500' };
            case 'ssr':
                return { text: 'SSR', dot: 'bg-rose-500' };
            case 'ss':
                return { text: 'SS', dot: 'bg-amber-500' };
            case 'vmess':
                return { text: 'VMESS', dot: 'bg-emerald-500' };
            case 'socks5':
                return { text: 'SOCKS5', dot: 'bg-lime-500' };
            case 'http':
                return { text: 'HTTP', dot: 'bg-emerald-500' };
            case 'snell':
                return { text: 'SNELL', dot: 'bg-indigo-500' };
            case 'naive':
                return { text: 'NAIVE', dot: 'bg-pink-500' };
            default:
                return { text: 'LINK', dot: 'bg-zinc-500' };
        }
    });

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(t('notices.copied'), 'success');
        } catch {
            showToast(t('notices.copyFailed'), 'error');
        }
    };
</script>

<template>
    <div
        class="group relative flex flex-col justify-between rounded-md border p-3.5 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:-translate-y-1 hover:z-10 transition-all duration-200 min-h-[110px]"
        :class="[
            isSelectionMode && isSelected
                ? 'border-line-strong bg-active'
                : 'border-line bg-surface',
            {
                'opacity-50': !node.enabled && !isSelectionMode,
                'cursor-pointer': isSelectionMode,
            },
        ]"
        @click="isSelectionMode ? emit('toggle-select') : null"
    >
        <!-- Top Row: Badges (Protocol & Tags) + Ping Result Badge -->
        <div class="flex items-center justify-between gap-2">
            <!-- Left Badges -->
            <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
                <!-- Selection Checkbox -->
                <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
                    <div
                        class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                        :class="
                            isSelected
                                ? 'bg-accent border-accent text-accent-fg'
                                : 'border-line-strong bg-transparent'
                        "
                    >
                        <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
                    </div>
                </div>

                <!-- Protocol Badge -->
                <div
                    class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                >
                    <span
                        class="h-1.5 w-1.5 rounded-full shrink-0"
                        :class="protocolStyle.dot"
                    ></span>
                    {{ protocolStyle.text }}
                </div>

                <!-- Tag Badges -->
                <div
                    v-for="tag in visibleTags"
                    :key="tag"
                    data-testid="manual-node-tag-badge"
                    class="max-w-[96px] sm:max-w-[110px] shrink-0 truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
                    :title="tag"
                    @click.stop="emit('filter-tag', tag)"
                >
                    {{ tag }}
                </div>
                <span
                    v-if="overflowCount > 0"
                    class="shrink-0 rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle"
                    :title="nodeTags.join(', ')"
                >
                    +{{ overflowCount }}
                </span>
            </div>

            <!-- Right: Ping Result Badge -->
            <div
                v-if="pingResult"
                class="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                :title="
                    pingResult.message ||
                    (pingResult.status === 'ok'
                        ? t('manualNodes.connectivityOk')
                        : t('manualNodes.connectivityFailed'))
                "
            >
                <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="{
                        'bg-emerald-500': pingResult.status === 'ok' && pingResult.latency < 300,
                        'bg-amber-500': pingResult.status === 'ok' && pingResult.latency >= 300,
                        'bg-red-500':
                            pingResult.status === 'error' || pingResult.status === 'timeout',
                        'bg-sky-500 animate-pulse': pingResult.status === 'loading',
                    }"
                ></span>
                <span v-if="pingResult.status === 'loading'">{{ t('manualNodes.pinging') }}</span>
                <span v-else-if="pingResult.status === 'ok'">{{ pingResult.latency }}ms</span>
                <span v-else>{{ t('manualNodes.unreachable') }}</span>
            </div>
        </div>

        <!-- Middle Row: Node Name -->
        <div class="my-2 min-w-0">
            <h4
                class="truncate text-sm font-medium text-fg transition-colors group-hover:text-white"
                :title="node.name || t('manualNodes.unnamed')"
            >
                {{ node.name || t('manualNodes.unnamed') }}
            </h4>
        </div>

        <!-- Client Compatibility Row -->
        <NodeClientBadges :url="node.url" class="mb-2.5" />

        <!-- Bottom Row: Endpoint (Host:Port) + Quick Actions -->
        <div
            class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5"
        >
            <div class="min-w-0 flex-1">
                <span
                    v-if="hostAndPort.host"
                    class="block truncate font-mono text-xs text-fg-subtle"
                    :title="`${hostAndPort.host}:${hostAndPort.port || ''}`"
                >
                    {{ hostAndPort.host }}:{{ hostAndPort.port || 'N/A' }}
                </span>
                <span v-else class="text-xs font-mono text-fg-subtle">-</span>
            </div>

            <div
                v-if="!isSelectionMode"
                class="flex shrink-0 items-center gap-0.5 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100"
            >
                <button
                    @click.stop="emit('ping')"
                    class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-zinc-800 hover:bg-hover hover:text-fg"
                    :title="t('actions.ping')"
                    :aria-label="t('actions.ping')"
                    :disabled="isPinging"
                    :class="{ 'animate-pulse text-fg': isPinging }"
                >
                    <Zap class="h-3.5 w-3.5" />
                </button>
                <button
                    @click.stop="emit('detail')"
                    class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
                    :title="t('actions.viewDetail')"
                    :aria-label="t('actions.viewDetail')"
                >
                    <Info class="h-3.5 w-3.5" />
                </button>
                <button
                    @click.stop="copyToClipboard(node.url)"
                    class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
                    :title="t('actions.copyLink')"
                    :aria-label="t('actions.copyLink')"
                >
                    <Copy class="h-3.5 w-3.5" />
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <Pencil class="h-3.5 w-3.5" />
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-400"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <Trash2 class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    </div>
</template>
