<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { Check, Copy, Download, Search, AlertTriangle } from '@lucide/vue';
import { useVirtualList } from '@/composables/useVirtualList.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import type { SubscriptionPortalPayload } from '@/utils/portal-bootstrap.js';

const props = defineProps<{
  portalData: SubscriptionPortalPayload;
}>();

const { t } = useI18n();
const activePinia = getActivePinia();
const toastStore = activePinia ? useToastStore() : null;

const searchQuery = ref('');
const copiedEndpointKey = ref('');
let rowTimer: ReturnType<typeof setTimeout> | null = null;

const multiSocks = computed(() => props.portalData.multiSocks);
const bindings = computed(() => (multiSocks.value.enabled ? multiSocks.value.bindings : []));

const filteredBindings = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return bindings.value;
  return bindings.value.filter((item) => {
    const haystack = `${item.port} ${item.listen} ${item.proxyName} ${item.region} ${item.countryCode}`.toLowerCase();
    return haystack.includes(q);
  });
});

const {
  containerRef,
  visibleItems: visibleBindings,
  topSpacerHeight,
  bottomSpacerHeight,
  handleScroll,
} = useVirtualList({
  items: filteredBindings,
  itemHeight: 44,
  overscan: 8,
  threshold: 40,
});

watch(searchQuery, () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0;
  }
  handleScroll();
});

onUnmounted(() => {
  if (rowTimer) {
    clearTimeout(rowTimer);
    rowTimer = null;
  }
});

const portRangeLabel = computed(() => {
  if (bindings.value.length === 0) return '-';
  const lastPort = bindings.value[bindings.value.length - 1]?.port ?? multiSocks.value.startPort;
  return `${multiSocks.value.startPort} - ${lastPort}`;
});

const truncatedByLimit = computed(
  () => multiSocks.value.enabled && multiSocks.value.totalRealNodes > bindings.value.length,
);

function formatRegion(region: string, countryCode: string): string {
  if (countryCode && region) return `${region} (${countryCode})`;
  return region || countryCode || t('portal.regionOther');
}

async function copyEndpoint(listen: string, port: number): Promise<void> {
  const addr = `${listen}:${port}`;
  const ok = await copyTextToClipboard(addr);
  if (!ok) {
    toastStore?.showToast(t('portal.copyFailed'), 'error');
    return;
  }
  copiedEndpointKey.value = addr;
  toastStore?.showToast(t('portal.endpointCopied', { endpoint: addr }), 'success');
  if (rowTimer) clearTimeout(rowTimer);
  rowTimer = setTimeout(() => {
    copiedEndpointKey.value = '';
    rowTimer = null;
  }, 1600);
}

async function copyAllEndpoints(): Promise<void> {
  const source = filteredBindings.value;
  if (source.length === 0) return;
  const text = source.map((item) => `${item.listen}:${item.port}`).join('\n');
  const ok = await copyTextToClipboard(text);
  if (!ok) {
    toastStore?.showToast(t('portal.copyFailed'), 'error');
    return;
  }
  toastStore?.showToast(t('portal.allEndpointsCopied', { count: source.length }), 'success');
}

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvContent(): string {
  const header = '类型,代理主机,代理端口,代理账号,代理密码,备注';
  const rows = filteredBindings.value.map((item) =>
    ['socks5', item.listen, item.port, item.username || '', item.password || '', item.proxyName || '']
      .map(csvEscape)
      .join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

function exportCsv(): void {
  if (filteredBindings.value.length === 0 || typeof document === 'undefined') return;
  const csvContent = buildCsvContent();
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dlUrl;
  a.download = 'misub-socks5-ports.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dlUrl);
  toastStore?.showToast(t('portal.csvExported'), 'success');
}

defineExpose({
  buildCsvContent,
});
</script>

<template>
  <section
    v-if="multiSocks.enabled"
    aria-labelledby="portal-multi-socks-heading"
    class="rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-card)] space-y-4"
    data-testid="portal-multi-socks-section"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h2 id="portal-multi-socks-heading" class="text-sm font-semibold text-fg tracking-tight">
          {{ t('portal.multiSocksTitle') }}
        </h2>
        <p class="text-xs text-fg-muted">
          {{ t('portal.multiSocksDesc') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          :disabled="filteredBindings.length === 0"
          class="inline-flex items-center gap-1.5 rounded-md border border-line bg-inset px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover hover:border-line-strong disabled:opacity-50 transition-colors cursor-pointer"
          data-testid="portal-copy-all-btn"
          type="button"
          @click="copyAllEndpoints"
        >
          <Copy class="h-3.5 w-3.5" />
          <span>{{ t('portal.copyAllEndpoints') }}</span>
        </button>
        <button
          :disabled="filteredBindings.length === 0"
          class="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          data-testid="portal-export-csv-btn"
          type="button"
          @click="exportCsv"
        >
          <Download class="h-3.5 w-3.5" />
          <span>{{ t('portal.exportCsv') }}</span>
        </button>
      </div>
    </div>

    <div
      class="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line rounded-md border border-line bg-inset/60"
    >
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <span class="text-[11px] text-fg-muted">{{ t('portal.mappedPortsCount') }}</span>
        <span class="font-mono text-xs font-semibold text-fg">
          {{ bindings.length }}<span v-if="truncatedByLimit" class="text-fg-muted font-normal"> / {{ multiSocks.totalRealNodes }}</span>
        </span>
      </div>
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <span class="text-[11px] text-fg-muted">{{ t('portal.portRangeLabel') }}</span>
        <span class="font-mono text-xs font-semibold text-fg">{{ portRangeLabel }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <span class="text-[11px] text-fg-muted">{{ t('portal.listenAddressLabel') }}</span>
        <span class="font-mono text-xs font-semibold text-fg">{{ multiSocks.listen }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <span class="text-[11px] text-fg-muted">{{ t('portal.authStatusLabel') }}</span>
        <span class="text-xs font-semibold text-fg">{{ multiSocks.hasAuth ? t('portal.authConfigured') : t('portal.authNone') }}</span>
      </div>
    </div>

    <div
      v-if="truncatedByLimit"
      class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300"
    >
      <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        {{
          t('portal.truncatedNotice', {
            total: multiSocks.totalRealNodes,
            maxPorts: multiSocks.maxPorts,
            mapped: bindings.length,
          })
        }}
      </span>
    </div>

    <div class="flex items-center gap-3">
      <div class="relative flex-1 min-w-0">
        <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" />
        <input
          v-model="searchQuery"
          :aria-label="t('portal.searchAria')"
          :placeholder="t('portal.searchPlaceholder')"
          class="w-full rounded-md border border-line bg-inset pl-8 pr-3 py-2 text-xs text-fg placeholder:text-fg-subtle outline-none focus:border-line-strong"
          data-testid="portal-socks-search-input"
          type="search"
        />
      </div>
      <span class="shrink-0 font-mono text-xs text-fg-muted" data-testid="portal-socks-filter-count">
        {{ filteredBindings.length }} / {{ bindings.length }}
      </span>
    </div>

    <div
      v-if="filteredBindings.length > 0"
      ref="containerRef"
      class="max-h-[480px] overflow-auto rounded-md border border-line [contain:layout_paint]"
      data-testid="portal-socks-scroll-container"
      @scroll="handleScroll"
    >
      <table class="w-full border-collapse text-left text-xs">
        <thead class="sticky top-0 z-10 bg-inset shadow-[inset_0_-1px_0_var(--line)]">
          <tr class="text-[11px] font-semibold text-fg-muted">
            <th class="px-3 py-2.5 whitespace-nowrap">{{ t('portal.colPort') }}</th>
            <th class="px-3 py-2.5 whitespace-nowrap">{{ t('portal.colListen') }}</th>
            <th class="px-3 py-2.5 whitespace-nowrap">{{ t('portal.colProtocol') }}</th>
            <th class="px-3 py-2.5">{{ t('portal.colProxyName') }}</th>
            <th class="px-3 py-2.5 whitespace-nowrap">{{ t('portal.colRegion') }}</th>
            <th class="px-3 py-2.5 whitespace-nowrap text-right">{{ t('portal.colAction') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="topSpacerHeight > 0" aria-hidden="true" class="border-0">
            <td :style="{ height: `${topSpacerHeight}px` }" class="p-0 border-0" colspan="6"></td>
          </tr>
          <tr
            v-for="item in visibleBindings"
            :key="item.port"
            class="h-[44px] border-b border-line hover:bg-hover/60"
            data-testid="portal-socks-row"
          >
            <td class="px-3 py-2 font-mono font-semibold text-fg whitespace-nowrap">{{ item.port }}</td>
            <td class="px-3 py-2 font-mono text-fg-muted whitespace-nowrap">{{ item.listen }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="inline-block rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                SOCKS5
              </span>
            </td>
            <td :title="item.proxyName" class="px-3 py-2 text-fg max-w-[260px] sm:max-w-[360px] truncate">
              {{ item.proxyName }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="inline-block rounded border border-line bg-inset px-2 py-0.5 text-[11px] text-fg-muted">
                {{ formatRegion(item.region, item.countryCode) }}
              </span>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-right">
              <button
                class="inline-flex items-center gap-1 rounded border border-line bg-inset px-2 py-1 font-mono text-[11px] text-fg hover:bg-hover hover:border-line-strong cursor-pointer"
                data-testid="portal-copy-row-btn"
                type="button"
                @click="copyEndpoint(item.listen, item.port)"
              >
                <Check v-if="copiedEndpointKey === `${item.listen}:${item.port}`" class="h-3 w-3 text-emerald-500" />
                <Copy v-else class="h-3 w-3 text-fg-subtle" />
                <span>{{ item.listen }}:{{ item.port }}</span>
              </button>
            </td>
          </tr>
          <tr v-if="bottomSpacerHeight > 0" aria-hidden="true" class="border-0">
            <td :style="{ height: `${bottomSpacerHeight}px` }" class="p-0 border-0" colspan="6"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else
      class="rounded-md border border-dashed border-line py-8 px-4 text-center text-xs text-fg-muted"
      data-testid="portal-socks-empty"
    >
      {{ bindings.length === 0 ? t('portal.noMappedNodes') : t('portal.noMatchingNodes') }}
    </div>
  </section>
</template>
