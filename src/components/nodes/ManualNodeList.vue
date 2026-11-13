<script setup>
    import { computed } from 'vue';
    import { Check, Zap, Copy, Pencil, Trash2 } from 'lucide-vue-next';
    import { extractHostAndPort } from '../../lib/utils.js';
    import { useToastStore } from '../../stores/toast.js';
    import { useI18n } from '@/i18n/index.js';

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

    const emit = defineEmits(['delete', 'edit', 'toggle-select', 'filter-group', 'ping']);
    const { showToast } = useToastStore();
    const { t } = useI18n();

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
        class="group flex w-full items-center gap-4 rounded-md border border-zinc-800 bg-[#171717] p-3.5 shadow-none transition-colors duration-150 hover:border-zinc-700"
        :class="{
            'opacity-50': !node.enabled && !isSelectionMode,
            'border-zinc-200 bg-zinc-900/50': isSelectionMode && isSelected,
            'cursor-pointer': isSelectionMode,
        }"
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
                                ? 'bg-zinc-100 border-zinc-100'
                                : 'border-zinc-700 bg-transparent'
                        "
                    >
                        <Check
                            v-if="isSelected"
                            class="h-3 w-3 text-zinc-900"
                            stroke-width="3"
                        />
                    </div>
                </div>

                <div
                    class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent"
                >
                    <span class="text-xs font-mono text-zinc-400">
                        {{ index }}
                    </span>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2 flex-wrap min-w-0">
                            <div
                                class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
                            >
                                <span class="h-1.5 w-1.5 rounded-full" :class="protocolStyle.dot"></span>
                                {{ protocolStyle.text }}
                            </div>
                            <div
                                v-if="node.group"
                                class="max-w-[100px] cursor-pointer truncate rounded-md border border-zinc-800 bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                                @click.stop="$emit('filter-group', node.group)"
                            >
                                {{ node.group }}
                            </div>
                        </div>

                        <!-- Header Actions for Mobile -->
                        <div v-if="!isSelectionMode" class="flex shrink-0 items-center gap-0.5">
                            <button
                                @click.stop="emit('ping')"
                                class="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                :title="t('actions.ping')"
                                :aria-label="t('actions.ping')"
                                :disabled="isPinging"
                                :class="{ 'animate-pulse text-zinc-100': isPinging }"
                            >
                                <Zap class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="copyToClipboard(node.url)"
                                class="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                :title="t('actions.copyLink')"
                                :aria-label="t('actions.copyLink')"
                            >
                                <Copy class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="emit('edit')"
                                class="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                :title="t('actions.edit')"
                                :aria-label="t('actions.edit')"
                            >
                                <Pencil class="h-4 w-4" />
                            </button>
                            <button
                                @click.stop="emit('delete')"
                                class="rounded-md p-2 text-zinc-400 transition-colors hover:bg-red-950/40 hover:text-red-400"
                                :title="t('actions.delete')"
                                :aria-label="t('actions.delete')"
                            >
                                <Trash2 class="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-row items-center gap-2 mt-1">
                        <p
                            class="flex-1 break-words text-sm font-medium leading-snug text-zinc-100"
                            :title="node.name"
                        >
                            {{ node.name || t('manualNodes.unnamed') }}
                        </p>
                        <div
                            v-if="pingResult"
                            class="flex shrink-0 flex-row items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
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
                            }}</span
                            ><span v-else-if="pingResult.status === 'ok'"
                                >{{ pingResult.latency }}ms</span
                            ><span v-else>{{ t('manualNodes.unreachable') }}</span>
                        </div>
                    </div>

                    <p class="mt-1 text-xs text-zinc-500 font-mono">
                        {{ hostAndPort.host || 'N/A' }}:{{ hostAndPort.port || 'N/A' }}
                    </p>
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
                            ? 'bg-zinc-100 border-zinc-100'
                            : 'border-zinc-700 bg-transparent'
                    "
                >
                    <Check
                        v-if="isSelected"
                        class="h-3 w-3 text-zinc-900"
                        stroke-width="3"
                    />
                </div>
            </div>

            <div
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent"
            >
                <span class="text-xs font-mono text-zinc-400">
                    {{ index }}
                </span>
            </div>

            <div
                v-if="node.group"
                class="max-w-[140px] truncate rounded-md border border-zinc-800 bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
            >
                {{ node.group }}
            </div>
            <div v-else class="text-[10px] font-mono text-zinc-500">-</div>

            <div
                class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
            >
                <span class="h-1.5 w-1.5 rounded-full" :class="protocolStyle.dot"></span>
                {{ protocolStyle.text }}
            </div>

            <div class="min-w-0 flex items-center gap-2 pr-4">
                <p
                    class="truncate text-sm font-medium text-zinc-100"
                    :title="node.name"
                >
                    {{ node.name || t('manualNodes.unnamed') }}
                </p>
                <div
                    v-if="pingResult"
                    class="flex shrink-0 flex-row items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
                >
                    <span
                        class="h-1.5 w-1.5 rounded-full shrink-0"
                        :class="{
                            'bg-emerald-500':
                                pingResult.status === 'ok' && pingResult.latency < 300,
                            'bg-amber-500':
                                pingResult.status === 'ok' && pingResult.latency >= 300,
                            'bg-red-500':
                                pingResult.status === 'error' || pingResult.status === 'timeout',
                            'bg-sky-500 animate-pulse': pingResult.status === 'loading',
                        }"
                    ></span>
                    <span v-if="pingResult.status === 'loading'">{{
                        t('manualNodes.pinging')
                    }}</span
                    ><span v-else-if="pingResult.status === 'ok'">{{ pingResult.latency }}ms</span
                    ><span v-else>{{ t('manualNodes.unreachable') }}</span>
                </div>
            </div>

            <div class="min-w-0">
                <p
                    class="font-mono text-xs text-zinc-400 truncate"
                    :title="hostAndPort.host"
                >
                    {{ hostAndPort.host || 'N/A' }}
                </p>
            </div>

            <div class="w-16 text-center">
                <p class="font-mono text-xs text-zinc-400">
                    {{ hostAndPort.port || 'N/A' }}
                </p>
            </div>

            <div
                v-if="!isSelectionMode"
                class="shrink-0 flex items-center gap-1 opacity-100 transition-opacity duration-200 group-hover:opacity-100 lg:opacity-0"
            >
                <button
                    @click.stop="emit('ping')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 lg:min-h-0 lg:min-w-0"
                    :title="t('actions.ping')"
                    :aria-label="t('actions.ping')"
                    :disabled="isPinging"
                    :class="{ 'animate-pulse text-zinc-100': isPinging }"
                >
                    <Zap class="h-4 w-4" />
                </button>
                <button
                    @click.stop="copyToClipboard(node.url)"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 lg:min-h-0 lg:min-w-0"
                    :title="t('actions.copyLink')"
                    :aria-label="t('actions.copyLink')"
                >
                    <Copy class="h-4 w-4" />
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 lg:min-h-0 lg:min-w-0"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <Pencil class="h-4 w-4" />
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent hover:border-red-900/60 p-2 text-zinc-400 transition-colors hover:bg-red-950/40 hover:text-red-400 lg:min-h-0 lg:min-w-0"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <Trash2 class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
</template>
