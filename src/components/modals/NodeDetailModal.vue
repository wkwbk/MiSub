<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Check, Copy, Download, QrCode, X } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { formatNodeDetailYaml, parseNodeDetail } from '@/utils/node-detail.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { downloadDataUrlFile } from '@/utils/import-file.js';
import { renderQrCodeToCanvas, sanitizeQrFilename } from '@/utils/qrcode.js';
import type { NodeInspectInfo } from '@/composables/manual-nodes/filters.js';

interface NetworkDisplayItem {
  key: string;
  label: string;
  display: string;
  copyable: boolean;
}

const props = withDefaults(
  defineProps<{
    show?: boolean;
    node?: { url?: string; name?: string } | string | null;
    inspectInfo?: NodeInspectInfo | null;
    zIndex?: string | number;
  }>(),
  {
    show: false,
    node: null,
    inspectInfo: null,
    zIndex: 'var(--z-modal-popover)',
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();
const { showToast } = useToastStore();
const { t } = useI18n();

const activeTab = ref<'structured' | 'yaml' | 'json' | 'qrcode'>('structured');
const copiedKey = ref('');
const lazyYaml = ref('');
const qrCanvasRef = ref<HTMLCanvasElement | null>(null);
let yamlLoadSeq = 0;
let qrLoadSeq = 0;

const detail = computed(() => parseNodeDetail(props.node));
const displayedYaml = computed(() => lazyYaml.value || detail.value.formattedYaml);

watch(
  [activeTab, () => props.show, () => detail.value.proxy],
  async ([tab, visible, proxy]) => {
    const seq = ++yamlLoadSeq;
    if (!visible || !proxy) {
      lazyYaml.value = '';
      return;
    }
    if (tab !== 'yaml') return;
    const formatted = await formatNodeDetailYaml(proxy);
    if (seq === yamlLoadSeq) {
      lazyYaml.value = formatted;
    }
  },
  { immediate: true },
);

watch(
  [activeTab, () => props.show, () => detail.value.rawUrl],
  async ([tab, visible, rawUrl]) => {
    const seq = ++qrLoadSeq;
    if (!visible || tab !== 'qrcode' || !rawUrl) return;
    await nextTick();
    if (!qrCanvasRef.value || seq !== qrLoadSeq) return;
    try {
      await renderQrCodeToCanvas(qrCanvasRef.value, rawUrl);
    } catch (err) {
      if (seq !== qrLoadSeq) return;
      console.error('QR Code generation failed', err);
      showToast(t('qr.generateFailed'), 'error');
    }
  },
  { immediate: true },
);

const downloadNodeQrCode = (): void => {
  if (!qrCanvasRef.value) return;
  const filename = sanitizeQrFilename(detail.value.name || 'node-qrcode');
  downloadDataUrlFile(qrCanvasRef.value.toDataURL('image/png'), `${filename}.png`);
};

const networkItems = computed<NetworkDisplayItem[]>(() => {
  const info = props.inspectInfo;
  if (!info) return [];
  const items: NetworkDisplayItem[] = [];
  const cdnProvider = typeof info.cdnProvider === 'string' ? info.cdnProvider : '';
  const asn = typeof info.asn === 'string' ? info.asn : '';
  const org = typeof info.org === 'string' ? info.org : '';

  if (info.ip) {
    items.push({ key: 'network.ip', label: t('manualNodes.resolvedIp'), display: info.ip, copyable: true });
  }
  if (info.isRelay) {
    items.push({
      key: 'network.country',
      label: 'Region',
      display: `${t('manualNodes.badgeRelay')} (${info.country || 'CN'})`,
      copyable: false,
    });
  } else if (info.countryCode) {
    items.push({
      key: 'network.country',
      label: 'Region',
      display: `${info.flag ? `${info.flag} ` : ''}${info.country || info.countryCode} (${info.countryCode})`,
      copyable: false,
    });
  }
  if (info.networkType && info.networkType !== 'unknown') {
    const typeText =
      info.networkType === 'cdn'
        ? `${t('manualNodes.badgeCdn')}${cdnProvider && cdnProvider !== 'CDN' ? ` (${cdnProvider})` : ''}`
        : info.networkType === 'relay'
          ? t('manualNodes.badgeRelay')
          : t('manualNodes.badgeDirect');
    items.push({ key: 'network.type', label: 'Route', display: typeText, copyable: false });
  }
  if (asn) {
    items.push({ key: 'network.asn', label: 'ASN', display: asn, copyable: true });
  }
  if (org) {
    items.push({ key: 'network.org', label: 'ISP / Org', display: org, copyable: false });
  }
  return items;
});

const sectionTitleMap: Record<string, string> = {
  basic: 'nodeDetail.sectionBasic',
  network: 'nodeDetail.sectionNetwork',
  auth: 'nodeDetail.sectionAuth',
  transport: 'nodeDetail.sectionTransport',
  security: 'nodeDetail.sectionSecurity',
  extra: 'nodeDetail.sectionExtra',
};

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      activeTab.value = 'structured';
      copiedKey.value = '';
    }
  },
);

const copyText = async (text: string, key: string): Promise<void> => {
  if (!text) return;
  const copied = await copyTextToClipboard(text);
  if (copied) {
    copiedKey.value = key;
    showToast(t('notices.copied'), 'success');
    setTimeout(() => {
      if (copiedKey.value === key) {
        copiedKey.value = '';
      }
    }, 1500);
  } else {
    showToast(t('notices.copyFailed'), 'error');
  }
};

const closeModal = (): void => {
  emit('update:show', false);
};
</script>

<template>
  <Modal
    :show="show"
    :show-cancel="false"
    :show-confirm="false"
    :z-index="zIndex"
    body-class="px-4 py-3.5 sm:px-6 sm:py-4"
    size="2xl"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2.5">
            <span
              class="inline-flex shrink-0 items-center rounded-sm border border-line-strong bg-active px-2 py-0.5 text-xs font-mono font-semibold uppercase tracking-wide text-fg"
            >
              {{ detail.protocol }}
            </span>
            <h3 class="truncate text-base font-semibold text-fg">
              {{ detail.name || t('nodeDetail.title') }}
            </h3>
          </div>
          <p
            v-if="detail.server"
            :title="`${detail.server}:${detail.port}`"
            class="mt-1 truncate font-mono text-xs text-fg-muted"
          >
            {{ detail.server }}<span v-if="detail.port !== ''">:</span>{{ detail.port }}
          </p>
        </div>
        <button
          :aria-label="t('nodeDetail.close')"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line hover:bg-hover hover:text-fg"
          type="button"
          @click="closeModal"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </template>

    <template #body>
      <div class="space-y-5">
        <div
          v-if="detail.parsed || detail.rawUrl"
          class="modal-inset-surface inline-flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto no-scrollbar rounded-md p-1"
          data-testid="node-detail-tabs"
          role="tablist"
        >
          <button
            :aria-selected="activeTab === 'structured'"
            :class="activeTab === 'structured' ? 'modal-tab-active text-fg' : 'text-fg-muted hover:text-fg'"
            class="shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium transition-all"
            role="tab"
            type="button"
            @click="activeTab = 'structured'"
          >
            {{ t('nodeDetail.tabStructured') }}
          </button>
          <button
            v-if="detail.parsed"
            :aria-selected="activeTab === 'yaml'"
            :class="activeTab === 'yaml' ? 'modal-tab-active text-fg' : 'text-fg-muted hover:text-fg'"
            class="shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium transition-all"
            role="tab"
            type="button"
            @click="activeTab = 'yaml'"
          >
            {{ t('nodeDetail.tabYaml') }}
          </button>
          <button
            v-if="detail.parsed"
            :aria-selected="activeTab === 'json'"
            :class="activeTab === 'json' ? 'modal-tab-active text-fg' : 'text-fg-muted hover:text-fg'"
            class="shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium transition-all"
            role="tab"
            type="button"
            @click="activeTab = 'json'"
          >
            {{ t('nodeDetail.tabJson') }}
          </button>
          <button
            v-if="detail.rawUrl"
            :aria-selected="activeTab === 'qrcode'"
            :class="activeTab === 'qrcode' ? 'modal-tab-active text-fg' : 'text-fg-muted hover:text-fg'"
            class="inline-flex shrink-0 whitespace-nowrap items-center gap-1 sm:gap-1.5 rounded-sm px-2.5 py-1.5 sm:px-3 sm:py-1 text-xs font-medium transition-all"
            data-testid="node-detail-qrcode-tab"
            role="tab"
            type="button"
            @click="activeTab = 'qrcode'"
          >
            <QrCode class="h-3.5 w-3.5 shrink-0" />
            {{ t('nodeDetail.tabQrCode') }}
          </button>
        </div>

        <div
          v-if="!detail.parsed"
          class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300"
        >
          {{ t('nodeDetail.unsupportedNotice') }}
        </div>

        <div v-if="activeTab === 'structured'" class="space-y-4">
          <section v-if="networkItems.length > 0">
            <h4 class="mb-1.5 px-1 text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t('nodeDetail.sectionNetwork') }}
            </h4>
            <div class="modal-section-card rounded-md overflow-hidden">
              <div class="modal-row-list">
                <div
                  v-for="item in networkItems"
                  :key="item.key"
                  class="modal-row-hover flex items-start justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors"
                >
                  <span class="shrink-0 font-medium leading-5 text-fg-muted min-w-[96px] sm:min-w-[140px]">
                    {{ item.label }}
                  </span>
                  <div class="flex min-w-0 flex-1 items-start justify-end gap-1.5">
                    <span class="break-all text-right font-mono leading-5 text-fg">
                      {{ item.display }}
                    </span>
                    <button
                      v-if="item.copyable"
                      :aria-label="t('actions.copy')"
                      :title="t('actions.copy')"
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
                      type="button"
                      @click="copyText(item.display, item.key)"
                    >
                      <Check v-if="copiedKey === item.key" class="h-3.5 w-3.5 text-emerald-400" />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-for="section in detail.sections" :key="section.id">
            <h4 class="mb-1.5 px-1 text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t(sectionTitleMap[section.id] || section.id) }}
            </h4>
            <div class="modal-section-card rounded-md overflow-hidden">
              <div class="modal-row-list">
                <div
                  v-for="item in section.items"
                  :key="item.key"
                  class="modal-row-hover flex items-start justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors"
                >
                  <span class="shrink-0 font-medium leading-5 text-fg-muted min-w-[96px] sm:min-w-[140px]">
                    {{ item.label }}
                  </span>
                  <div class="flex min-w-0 flex-1 items-start justify-end gap-1.5">
                    <span
                      v-if="item.kind === 'boolean'"
                      :class="
                        item.value
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-line-strong bg-active text-fg-muted'
                      "
                      class="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs"
                    >
                      {{ item.display }}
                    </span>
                    <span v-else class="break-all text-right font-mono leading-5 text-fg">
                      {{ item.display }}
                    </span>
                    <button
                      v-if="item.copyable"
                      :aria-label="t('actions.copy')"
                      :title="t('actions.copy')"
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
                      type="button"
                      @click="copyText(item.display, item.key)"
                    >
                      <Check v-if="copiedKey === item.key" class="h-3.5 w-3.5 text-emerald-400" />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section v-if="detail.rawUrl">
            <h4 class="mb-1.5 px-1 text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t('nodeDetail.rawUrl') }}
            </h4>
            <div class="modal-inset-surface rounded-md overflow-hidden">
              <pre
                class="modal-scrollbar max-h-28 overflow-auto whitespace-pre-wrap break-all px-3.5 py-2.5 font-mono text-xs leading-relaxed text-fg-muted"
                >{{ detail.rawUrl }}</pre>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'yaml'">
          <div class="mb-1.5 flex items-center justify-between px-1">
            <h4 class="text-xs font-medium uppercase tracking-wider text-fg-muted">Clash Proxy YAML</h4>
            <button
              class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              type="button"
              @click="copyText(displayedYaml, '__yaml__')"
            >
              <Check v-if="copiedKey === '__yaml__'" class="h-3 w-3 text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
              {{ t('nodeDetail.copyYaml') }}
            </button>
          </div>
          <div class="modal-inset-surface rounded-md overflow-hidden">
            <pre
              class="modal-scrollbar max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-fg"
              >{{ displayedYaml }}</pre>
          </div>
        </div>

        <div v-else-if="activeTab === 'json'">
          <div class="mb-1.5 flex items-center justify-between px-1">
            <h4 class="text-xs font-medium uppercase tracking-wider text-fg-muted">JSON</h4>
            <button
              class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              type="button"
              @click="copyText(detail.formattedJson, '__json__')"
            >
              <Check v-if="copiedKey === '__json__'" class="h-3 w-3 text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
              {{ t('nodeDetail.copyJson') }}
            </button>
          </div>
          <div class="modal-inset-surface rounded-md overflow-hidden">
            <pre
              class="modal-scrollbar max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-fg"
              >{{ detail.formattedJson }}</pre>
          </div>
        </div>

        <div v-else-if="activeTab === 'qrcode'" class="flex flex-col items-center gap-4 py-4">
          <div class="rounded-md border border-line bg-white p-3">
            <canvas ref="qrCanvasRef" class="h-64 w-64 rounded-sm"></canvas>
          </div>
          <p class="max-w-xs text-center text-xs leading-relaxed text-fg-subtle">
            {{ t('qr.nodeScanHint') }}
          </p>
          <button
            class="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
            type="button"
            @click="downloadNodeQrCode"
          >
            <Download class="h-4 w-4" />
            {{ t('qr.saveImage') }}
          </button>
        </div>
      </div>
    </template>

    <template v-if="detail.rawUrl" #footer>
      <button
        class="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 sm:w-auto"
        type="button"
        @click="copyText(detail.rawUrl, '__footer_url__')"
      >
        <Check v-if="copiedKey === '__footer_url__'" class="h-4 w-4 shrink-0 text-emerald-500" />
        <Copy v-else class="h-4 w-4 shrink-0" />
        {{ t('actions.copyLink') }}
      </button>
    </template>
  </Modal>
</template>
