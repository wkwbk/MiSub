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
        index: {
            type: Number,
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
        const styles = {
            anytls: { text: 'AnyTLS', dot: 'bg-zinc-400' },
            vless: { text: 'VLESS', dot: 'bg-sky-500' },
            hysteria2: { text: 'HY2', dot: 'bg-purple-500' },
            hysteria: { text: 'Hysteria', dot: 'bg-fuchsia-500' },
            tuic: { text: 'TUIC', dot: 'bg-cyan-500' },
            trojan: { text: 'TROJAN', dot: 'bg-red-500' },
            ssr: { text: 'SSR', dot: 'bg-rose-500' },
            ss: { text: 'SS', dot: 'bg-amber-500' },
            vmess: { text: 'VMESS', dot: 'bg-emerald-500' },
            socks5: { text: 'SOCKS5', dot: 'bg-lime-500' },
            http: { text: 'HTTP', dot: 'bg-emerald-500' },
            snell: { text: 'SNELL', dot: 'bg-indigo-500' },
            naive: { text: 'NAIVE', dot: 'bg-pink-500' },
            unknown: { text: 'LINK', dot: 'bg-zinc-500' },
        };
        return styles[p] || styles['unknown'];
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
        class="group flex w-full items-center gap-4 rounded-md border p-3.5 shadow-none transition-colors duration-200"
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
        <!-- Mobile Layout -->
        <div class="w-full sm:hidden">
            <div class="flex items-start gap-3">
                <div v-if="isSelectionMode" class="shrink-0 mt-0.5">
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

                <div
                    class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-transparent"
                >
                    <span class="text-xs font-mono text-fg-muted">
                        {{ index }}
                    </span>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                            <div
                                class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                            >
                                <span
                                    class="h-1.5 w-1.5 rounded-full"
                                    :class="protocolStyle.dot"
                                ></span>
                                {{ protocolStyle.text }}
                            </div>
                            <div
                                v-for="tag in visibleTags"
                                :key="tag"
                                class="max-w-[100px] cursor-pointer truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                                @click.stop="emit('filter-tag', tag)"
                            >
                                {{ tag }}
                            </div>
                            <span
                                v-if="overflowCount > 0"
                                class="rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle"
                                :title="nodeTags.join(', ')"
                            >
                                +{{ overflowCount }}
                            </span>
                        </div>

                        <!-- Header Actions for Mobile -->
                        <div v-if="!isSelectionMode" class="flex shrink-0 items-center gap-0.5">
                            <button
                                @click.stop="emit('ping')"
                                class="rounded-md p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                                :title="t('actions.ping')"
                                :aria-label="t('actions.ping')"
                                :disabled="isPinging"
                                :class="{ 'animate-pulse text-fg': isPinging }"
                            >
                                <Zap class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="emit('detail')"
                                class="rounded-md p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                                :title="t('actions.viewDetail')"
                                :aria-label="t('actions.viewDetail')"
                            >
                                <Info class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="copyToClipboard(node.url)"
                                class="rounded-md p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                                :title="t('actions.copyLink')"
                                :aria-label="t('actions.copyLink')"
                            >
                                <Copy class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="emit('edit')"
                                class="rounded-md p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                                :title="t('actions.edit')"
                                :aria-label="t('actions.edit')"
                            >
                                <Pencil class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="emit('delete')"
                                class="rounded-md p-2 text-fg-muted transition-colors hover:bg-red-950/40 hover:text-red-400"
                                :title="t('actions.delete')"
                                :aria-label="t('actions.delete')"
                            >
                                <Trash2 class="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-row items-center gap-2 mt-1">
                        <p
                            class="flex-1 break-words text-sm font-medium leading-snug text-fg"
                            :title="node.name"
                        >
                            {{ node.name || t('manualNodes.unnamed') }}
                        </p>
                        <div
                            v-if="pingResult"
                            class="flex shrink-0 flex-row items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                        >
                            <span
                                class="h-1.5 w-1.5 rounded-full shrink-0"
                                :class="{
                                    'bg-emerald-500':
                                        pingResult.status === 'ok' && pingResult.latency < 300,
                                    'bg-amber-500':
                                        pingResult.status === 'ok' && pingResult.latency >= 300,
                                    'bg-red-500':
                                        pingResult.status === 'error' ||
                                        pingResult.status === 'timeout',
                                    'bg-sky-500 animate-pulse': pingResult.status === 'loading',
                                }"
                            ></span>
                            <span v-if="pingResult.status === 'loading'">{{
                                t('manualNodes.pinging')
                            }}</span><span v-else-if="pingResult.status === 'ok'"
                                >{{ pingResult.latency }}ms</span
                            ><span v-else>{{ t('manualNodes.unreachable') }}</span>
                        </div>
                    </div>

                    <p class="mt-1 text-xs text-fg-subtle font-mono">
                        {{ hostAndPort.host || 'N/A' }}:{{ hostAndPort.port || 'N/A' }}
                    </p>
                    <NodeClientBadges :url="node.url" compact class="mt-1.5" />
                </div>
            </div>
        </div>

        <!-- Desktop Layout -->
        <div
            class="hidden w-full items-center gap-4 sm:grid"
            :class="[
                isSelectionMode
                    ? 'grid-cols-[auto_auto_auto_auto_1fr_1fr_auto_auto]'
                    : 'grid-cols-[auto_auto_auto_1fr_1fr_auto_auto]',
            ]"
        >
            <div v-if="isSelectionMode" class="shrink-0">
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

            <div
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-transparent"
            >
                <span class="text-xs font-mono text-fg-muted">
                    {{ index }}
                </span>
            </div>

            <div v-if="visibleTags.length > 0" class="flex items-center gap-1 max-w-[180px]">
                <div
                    v-for="tag in visibleTags"
                    :key="tag"
                    class="max-w-[90px] truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted cursor-pointer hover:bg-hover hover:text-fg transition-colors"
                    :title="tag"
                    @click.stop="emit('filter-tag', tag)"
                >
                    {{ tag }}
                </div>
                <span
                    v-if="overflowCount > 0"
                    class="rounded-md border border-line bg-transparent px-1 py-0.5 text-[10px] font-mono text-fg-subtle"
                    :title="nodeTags.join(', ')"
                >
                    +{{ overflowCount }}
                </span>
            </div>
            <div v-else class="text-[10px] font-mono text-fg-subtle">-</div>

            <div
                class="inline-flex items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
            >
                <span class="h-1.5 w-1.5 rounded-full" :class="protocolStyle.dot"></span>
                {{ protocolStyle.text }}
            </div>

            <div class="min-w-0 pr-4">
                <div class="flex items-center gap-2">
                    <p class="truncate text-sm font-medium text-fg" :title="node.name">
                        {{ node.name || t('manualNodes.unnamed') }}
                    </p>
                    <div
                        v-if="pingResult"
                        class="flex shrink-0 flex-row items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                    >
                        <span
                            class="h-1.5 w-1.5 rounded-full shrink-0"
                            :class="{
                                'bg-emerald-500':
                                    pingResult.status === 'ok' && pingResult.latency < 300,
                                'bg-amber-500':
                                    pingResult.status === 'ok' && pingResult.latency >= 300,
                                'bg-red-500':
                                    pingResult.status === 'error' ||
                                    pingResult.status === 'timeout',
                                'bg-sky-500 animate-pulse': pingResult.status === 'loading',
                            }"
                        ></span>
                        <span v-if="pingResult.status === 'loading'">{{
                            t('manualNodes.pinging')
                        }}</span><span v-else-if="pingResult.status === 'ok'"
                            >{{ pingResult.latency }}ms</span
                        ><span v-else>{{ t('manualNodes.unreachable') }}</span>
                    </div>
                </div>
                <NodeClientBadges :url="node.url" compact class="mt-1" />
            </div>

            <div class="min-w-0">
                <p class="font-mono text-xs text-fg-muted truncate" :title="hostAndPort.host">
                    {{ hostAndPort.host || 'N/A' }}
                </p>
            </div>

            <div class="w-16 text-center">
                <p class="font-mono text-xs text-fg-muted">
                    {{ hostAndPort.port || 'N/A' }}
                </p>
            </div>

            <div
                v-if="!isSelectionMode"
                class="shrink-0 flex items-center gap-1 opacity-100 transition-opacity duration-200 group-hover:opacity-100 lg:opacity-0"
            >
                <button
                    @click.stop="emit('ping')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:min-h-0 lg:min-w-0"
                    :title="t('actions.ping')"
                    :aria-label="t('actions.ping')"
                    :disabled="isPinging"
                    :class="{ 'animate-pulse text-fg': isPinging }"
                >
                    <Zap class="h-4 w-4" />
                </button>
                <button
                    @click.stop="emit('detail')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:min-h-0 lg:min-w-0"
                    :title="t('actions.viewDetail')"
                    :aria-label="t('actions.viewDetail')"
                >
                    <Info class="h-4 w-4" />
                </button>
                <button
                    @click.stop="copyToClipboard(node.url)"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:min-h-0 lg:min-w-0"
                    :title="t('actions.copyLink')"
                    :aria-label="t('actions.copyLink')"
                >
                    <Copy class="h-4 w-4" />
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:min-h-0 lg:min-w-0"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <Pencil class="h-4 w-4" />
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-red-900/60 p-2 text-fg-muted transition-colors hover:bg-red-950/40 hover:text-red-400 lg:min-h-0 lg:min-w-0"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <Trash2 class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
</template>
