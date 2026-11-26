<script setup lang="ts">
import { computed } from 'vue';
import { Check, CornerDownRight, Info, Pencil, Trash2, Zap } from '@lucide/vue';
import { extractHostAndPort } from '@/lib/utils.js';
import { getItemTags } from '@/utils/tags.js';
import { getManualNodeProtocol, type NodeInspectInfo } from '@/composables/manual-nodes/filters.js';
import type { PingResult } from '@/composables/useManualNodes.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { useI18n } from '@/i18n/index.js';
import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';
import { useHorizontalScrollFade } from '@/composables/useHorizontalScrollFade.js';

const props = withDefaults(
  defineProps<{
    node: StoreMisubItem;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    pingResult?: PingResult;
    isPinging?: boolean;
    inspectInfo?: NodeInspectInfo | null;
  }>(),
  {
    isSelectionMode: false,
    isSelected: false,
    pingResult: undefined,
    isPinging: false,
    inspectInfo: null,
  },
);

const emit = defineEmits<{
  delete: [];
  edit: [];
  detail: [];
  'toggle-select': [];
  'filter-tag': [tag: string];
  'filter-protocol': [protocol: string];
  'filter-country': [countryCode: string];
  'filter-network': [networkType: string];
  ping: [];
}>();
const { t } = useI18n();

const nodeTags = computed(() => getItemTags(props.node));
const visibleTags = computed(() => nodeTags.value.slice(0, 2));
const overflowCount = computed(() => Math.max(0, nodeTags.value.length - 2));

const protocol = computed(() => getManualNodeProtocol(props.node.url));
const hostAndPort = computed(() => extractHostAndPort(props.node.url));

const countryBadge = computed(() => {
  const info = props.inspectInfo;
  if (!info) return null;
  const asn = typeof info.asn === 'string' ? info.asn : '';
  const org = typeof info.org === 'string' ? info.org : '';
  if (info.isRelay) {
    return {
      text: t('manualNodes.badgeRelay'),
      title: `${info.country || 'CN'} · ${asn} ${org}`.trim(),
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    };
  }
  if (info.countryCode) {
    const label = info.country && info.country !== info.countryCode ? info.country : info.countryCode;
    return {
      text: info.flag && label !== info.countryCode ? `${info.flag} ${label}` : label,
      title: `${info.country || info.countryCode}${asn ? ` · ${asn}` : ''}${org ? ` (${org})` : ''}`,
      className: 'border-line bg-transparent text-fg-muted',
    };
  }
  return null;
});

const networkBadge = computed(() => {
  const info = props.inspectInfo;
  if (!info || !info.networkType || info.networkType === 'unknown' || info.isRelay) return null;
  const cdnProvider = typeof info.cdnProvider === 'string' ? info.cdnProvider : '';
  const asn = typeof info.asn === 'string' ? info.asn : '';
  const org = typeof info.org === 'string' ? info.org : '';
  if (info.networkType === 'cdn') {
    const provider = cdnProvider && cdnProvider !== 'CDN' ? cdnProvider : '';
    return {
      text: provider === 'Cloudflare' ? 'CF CDN' : t('manualNodes.badgeCdn'),
      title: provider ? `CDN (${provider})${asn ? ` · ${asn}` : ''}` : 'CDN',
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
    };
  }
  if (info.networkType === 'direct') {
    return {
      text: t('manualNodes.badgeDirect'),
      title: `${t('manualNodes.badgeDirect')}${asn ? ` · ${asn}` : ''}${org ? ` (${org})` : ''}`,
      className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-500',
    };
  }
  return null;
});

const resolvedIpText = computed(() => {
  const info = props.inspectInfo;
  if (!info || !info.ip || !info.isDomain) return '';
  return info.ip;
});

const pingTooltip = computed(() => {
  const r = props.pingResult;
  if (!r) return '';
  if (r.message) return r.message;
  const modeLabel = r.mode === 'tcping' ? t('manualNodes.pingModeTcping') : t('manualNodes.pingModeLocal');
  if (r.status === 'ok') return `${modeLabel}: ${r.latency}ms`;
  return `${modeLabel}: ${t('manualNodes.connectivityFailed')}`;
});

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

const {
  scrollRef: badgesScrollRef,
  scrollFadeClass: badgesScrollFadeClass,
  updateScrollFade: updateBadgesScrollFade,
} = useHorizontalScrollFade({
  deps: () => [
    protocol.value,
    countryBadge.value?.text,
    networkBadge.value?.text,
    visibleTags.value.join(','),
    overflowCount.value,
    Boolean(props.pingResult),
    props.isSelectionMode,
  ],
});
</script>

<template>
  <div
    :class="[
      isSelectionMode && isSelected ? 'border-line-strong bg-active' : 'border-line bg-surface',
      {
        'opacity-50': !node.enabled && !isSelectionMode,
        'cursor-pointer': isSelectionMode,
      },
    ]"
    class="group relative flex h-full flex-col justify-between rounded-md border p-3 hover:-translate-y-0.5 hover:z-10 transition-all duration-200 min-h-[96px]"
    @click="isSelectionMode ? emit('toggle-select') : null"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
          <div
            :class="isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong bg-transparent'"
            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
          >
            <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
          </div>
        </div>

        <div
          ref="badgesScrollRef"
          :class="badgesScrollFadeClass"
          class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar"
          @scroll.passive="updateBadgesScrollFade"
        >
          <button
            class="inline-flex h-5 items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 text-xs font-mono leading-none text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="manual-node-protocol-badge"
            type="button"
            @click.stop="emit('filter-protocol', protocol)"
          >
            <span :class="protocolStyle.dot" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
            {{ protocolStyle.text }}
          </button>

          <button
            v-if="countryBadge"
            :class="countryBadge.className"
            :title="countryBadge.title"
            class="inline-flex h-5 shrink-0 items-center rounded-md border px-2 text-xs font-medium leading-none transition-colors hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="manual-node-country-badge"
            type="button"
            @click.stop="
              inspectInfo?.isRelay
                ? emit('filter-network', 'relay')
                : emit('filter-country', inspectInfo?.countryCode || '')
            "
          >
            {{ countryBadge.text }}
          </button>

          <button
            v-if="networkBadge"
            :class="networkBadge.className"
            :title="networkBadge.title"
            class="inline-flex h-5 shrink-0 items-center rounded-md border px-2 text-xs font-medium leading-none transition-colors hover:opacity-85 cursor-pointer"
            data-testid="manual-node-network-badge"
            type="button"
            @click.stop="emit('filter-network', inspectInfo?.networkType || '')"
          >
            {{ networkBadge.text }}
          </button>

          <div
            v-for="tag in visibleTags"
            :key="tag"
            :title="tag"
            class="inline-flex h-5 max-w-[96px] sm:max-w-[110px] shrink-0 items-center truncate rounded-md border border-line bg-transparent px-2 text-xs font-medium leading-none text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="manual-node-tag-badge"
            @click.stop="emit('filter-tag', tag)"
          >
            <span class="truncate">{{ tag }}</span>
          </div>
          <span
            v-if="overflowCount > 0"
            :title="nodeTags.join(', ')"
            class="inline-flex h-5 shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-xs font-mono leading-none text-fg-subtle"
          >
            +{{ overflowCount }}
          </span>
        </div>
      </div>

      <div
        v-if="pingResult"
        :title="pingTooltip"
        class="flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-line bg-transparent px-2 text-xs font-mono leading-none text-fg-muted"
      >
        <span
          :class="{
            'bg-emerald-500': pingResult.status === 'ok' && pingResult.latency < 300,
            'bg-amber-500': pingResult.status === 'ok' && pingResult.latency >= 300,
            'bg-red-500': pingResult.status === 'error' || pingResult.status === 'timeout',
            'bg-zinc-400': pingResult.status === 'unsupported',
            'bg-sky-500 animate-pulse': pingResult.status === 'loading',
          }"
          class="h-1.5 w-1.5 rounded-full shrink-0"
        ></span>
        <span v-if="pingResult.status === 'loading'">{{ t('manualNodes.pinging') }}</span>
        <span v-else-if="pingResult.status === 'ok'">{{ pingResult.latency }}ms</span>
        <span v-else-if="pingResult.status === 'unsupported'">UDP</span>
        <span v-else>{{ t('manualNodes.unreachable') }}</span>
      </div>
    </div>

    <div class="my-1.5 min-w-0">
      <h4 :title="node.name || t('manualNodes.unnamed')" class="truncate text-sm font-medium text-fg transition-colors">
        {{ node.name || t('manualNodes.unnamed') }}
      </h4>
    </div>

    <NodeClientBadges :url="node.url" class="mb-2" compact />

    <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
      <div class="flex min-h-[2.25rem] min-w-0 flex-1 flex-col justify-center">
        <span
          v-if="hostAndPort.host"
          :title="
            resolvedIpText
              ? `${hostAndPort.host}:${hostAndPort.port || ''} (${t('manualNodes.resolvedIp')}: ${resolvedIpText})`
              : `${hostAndPort.host}:${hostAndPort.port || ''}`
          "
          class="block truncate font-mono text-xs text-fg-subtle"
        >
          {{ hostAndPort.host }}:{{ hostAndPort.port || 'N/A' }}
        </span>
        <span v-else class="text-xs font-mono text-fg-subtle">-</span>
        <span
          v-if="resolvedIpText"
          :title="`${t('manualNodes.resolvedIp')}: ${resolvedIpText}`"
          class="mt-0.5 flex items-center gap-1 font-mono text-xs text-fg-subtle/80"
          data-testid="manual-node-resolved-ip"
        >
          <CornerDownRight aria-hidden="true" class="h-3 w-3 shrink-0 text-fg-subtle/60" />
          <span class="truncate">{{ resolvedIpText }}</span>
        </span>
      </div>

      <div
        v-if="!isSelectionMode"
        class="flex shrink-0 items-center gap-0.5 transition-opacity duration-150 md:opacity-55 md:group-hover:opacity-100 md:focus-within:opacity-100"
      >
        <button
          :aria-label="t('actions.ping')"
          :class="{ 'animate-pulse text-fg': isPinging }"
          :disabled="isPinging"
          :title="t('actions.ping')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('ping')"
        >
          <Zap class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.viewDetail')"
          :title="t('actions.viewDetail')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('detail')"
        >
          <Info class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.edit')"
          :title="t('actions.edit')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('edit')"
        >
          <Pencil class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.delete')"
          :title="t('actions.delete')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-400"
          @click.stop="emit('delete')"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
