<script setup>
    import { computed } from 'vue';
    import { useI18n } from '@/i18n/index.js';

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

    const emit = defineEmits(['delete', 'edit', 'toggle-select', 'filter-group', 'ping']);
    const { t } = useI18n();

    const getProtocol = (url) => {
        // ... (protocol logic unchanged)
        try {
            if (!url) return 'unknown';
            const lowerUrl = url.toLowerCase();
            // [更新] 新增 anytls 支援
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
</script>

<template>
    <div
        class="group relative flex min-h-[84px] items-center justify-between gap-3 rounded-md border border-zinc-800 bg-[#0c0c0e] p-4 shadow-none transition-colors duration-150 hover:border-zinc-700"
        :class="{
            'opacity-50': !node.enabled && !isSelectionMode,
            'border-zinc-200 bg-zinc-900/50':
                isSelectionMode && isSelected,
            'cursor-pointer': isSelectionMode,
        }"
        @click="isSelectionMode ? emit('toggle-select') : null"
    >
        <!-- Selection Checkbox -->
        <div v-if="isSelectionMode" class="shrink-0 mr-1">
            <div
                class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                :class="
                    isSelected
                        ? 'bg-zinc-100 border-zinc-100'
                        : 'border-zinc-700 bg-transparent'
                "
            >
                <svg
                    v-if="isSelected"
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 text-zinc-900"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                    />
                </svg>
            </div>
        </div>

        <div class="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
            <!-- Group Badge -->
            <div
                v-if="node.group"
                class="max-w-[90px] shrink-0 truncate rounded-md border border-zinc-800 bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                :title="node.group"
                @click.stop="$emit('filter-group', node.group)"
            >
                {{ node.group }}
            </div>

            <div
                class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
            >
                <span class="h-1.5 w-1.5 rounded-full" :class="protocolStyle.dot"></span>
                {{ protocolStyle.text }}
            </div>
            <p
                class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100"
                :title="node.name"
            >
                {{ node.name || t('manualNodes.unnamed') }}
            </p>

            <!-- Ping Result Badge -->
            <div
                v-if="pingResult"
                class="flex shrink-0 flex-row items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
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
                        'bg-red-500': pingResult.status === 'error' || pingResult.status === 'timeout',
                        'bg-sky-500 animate-pulse': pingResult.status === 'loading',
                    }"
                ></span>
                <span v-if="pingResult.status === 'loading'">{{ t('manualNodes.pinging') }}</span>
                <span v-else-if="pingResult.status === 'ok'">{{ pingResult.latency }}ms</span>
                <span v-else>{{ t('manualNodes.unreachable') }}</span>
            </div>
        </div>

        <div
            v-if="!isSelectionMode"
            class="shrink-0 flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
        >
            <button
                @click.stop="emit('ping')"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent hover:border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                :title="t('actions.ping')"
                :aria-label="t('actions.ping')"
                :disabled="isPinging"
                :class="{ 'animate-pulse text-zinc-100': isPinging }"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                </svg>
            </button>
            <button
                @click.stop="emit('edit')"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent hover:border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                :title="t('actions.edit')"
                :aria-label="t('actions.edit')"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"
                    />
                </svg>
            </button>
            <button
                @click.stop="emit('delete')"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-transparent hover:border-red-900/60 text-zinc-400 transition-colors hover:bg-red-950/40 hover:text-red-400"
                :title="t('actions.delete')"
                :aria-label="t('actions.delete')"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                </svg>
            </button>
        </div>
    </div>
</template>
