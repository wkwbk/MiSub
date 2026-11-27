<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { Check, Copy, ExternalLink, QrCode } from '@lucide/vue';
import { utf8ToBase64 } from '@misub/core/utils/base64.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { renderQrCodeToCanvas } from '@/utils/qrcode.js';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import type { SubscriptionPortalPayload } from '@/utils/portal-bootstrap.js';

const props = defineProps<{
  portalData: SubscriptionPortalPayload;
}>();

const { t } = useI18n();
const activePinia = getActivePinia();
const toastStore = activePinia ? useToastStore() : null;

const qrCanvasRef = ref<HTMLCanvasElement | null>(null);
const qrRendered = ref(false);
const urlCopied = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const safeName = computed(() => props.portalData.subName || props.portalData.title || 'MiSub');
const clashVergeUrl = computed(
  () =>
    `clash://install-config?url=${encodeURIComponent(props.portalData.subscriptionUrl)}&name=${encodeURIComponent(safeName.value)}`,
);
const mihomoUrl = computed(
  () =>
    `mihomo://install-config?url=${encodeURIComponent(props.portalData.subscriptionUrl)}&name=${encodeURIComponent(safeName.value)}`,
);
const shadowrocketUrl = computed(
  () =>
    `shadowrocket://add/sub://${utf8ToBase64(props.portalData.subscriptionUrl)}?remark=${encodeURIComponent(safeName.value)}`,
);

async function drawQrCode(): Promise<void> {
  if (!qrCanvasRef.value || !props.portalData.subscriptionUrl) {
    qrRendered.value = false;
    return;
  }
  try {
    qrRendered.value = await renderQrCodeToCanvas(qrCanvasRef.value, props.portalData.subscriptionUrl, 128);
  } catch {
    qrRendered.value = false;
  }
}

async function copySubscriptionUrl(): Promise<void> {
  const ok = await copyTextToClipboard(props.portalData.subscriptionUrl);
  if (!ok) {
    toastStore?.showToast(t('portal.copyFailed'), 'error');
    return;
  }
  urlCopied.value = true;
  toastStore?.showToast(t('portal.subUrlCopied'), 'success');
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    urlCopied.value = false;
    copyResetTimer = null;
  }, 1800);
}

onMounted(drawQrCode);
onUnmounted(() => {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }
});
watch(() => props.portalData.subscriptionUrl, drawQrCode);
</script>

<template>
  <section
    aria-labelledby="portal-quick-import-heading"
    class="rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
  >
    <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_156px] gap-4 items-stretch">
      <div class="min-w-0 flex flex-col justify-between gap-3">
        <div class="space-y-1">
          <h2 id="portal-quick-import-heading" class="text-sm font-semibold text-fg tracking-tight">
            {{ t('portal.quickImportTitle') }}
          </h2>
          <p class="text-xs text-fg-muted">
            {{ t('portal.quickImportDesc') }}
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-2">
          <input
            :aria-label="t('portal.subUrlInputAria')"
            :value="portalData.subscriptionUrl"
            class="flex-1 min-w-0 rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg outline-none focus:border-line-strong"
            data-testid="portal-sub-url-input"
            readonly
            type="text"
          />
          <button
            class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-accent-fg hover:opacity-90 transition-opacity cursor-pointer"
            data-testid="portal-copy-sub-url-btn"
            type="button"
            @click="copySubscriptionUrl"
          >
            <Check v-if="urlCopied" class="h-3.5 w-3.5" />
            <Copy v-else class="h-3.5 w-3.5" />
            <span>{{ urlCopied ? t('portal.copied') : t('portal.copyLink') }}</span>
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <a
            :href="clashVergeUrl"
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-inset/80 px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover hover:border-line-strong transition-colors"
            data-testid="portal-import-clash-verge"
          >
            <ExternalLink class="h-3.5 w-3.5 text-fg-subtle" />
            <span>{{ t('portal.importClashVerge') }}</span>
          </a>
          <a
            :href="mihomoUrl"
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-inset/80 px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover hover:border-line-strong transition-colors"
            data-testid="portal-import-mihomo"
          >
            <ExternalLink class="h-3.5 w-3.5 text-fg-subtle" />
            <span>{{ t('portal.importMihomo') }}</span>
          </a>
          <a
            :href="shadowrocketUrl"
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-inset/80 px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover hover:border-line-strong transition-colors"
            data-testid="portal-import-shadowrocket"
          >
            <ExternalLink class="h-3.5 w-3.5 text-fg-subtle" />
            <span>{{ t('portal.importShadowrocket') }}</span>
          </a>
        </div>
      </div>

      <div
        class="mx-auto md:mx-0 flex w-full max-w-[168px] md:w-[156px] flex-col items-center justify-center gap-1.5 rounded-md border border-line bg-inset/60 p-2.5"
      >
        <div class="relative flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded bg-white p-1.5">
          <canvas ref="qrCanvasRef" class="h-[108px] w-[108px] block"></canvas>
          <div v-if="!qrRendered" class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-neutral-400">
            <QrCode class="h-7 w-7" />
          </div>
        </div>
        <span class="text-[11px] font-medium text-fg-muted">{{ t('portal.scanQrCode') }}</span>
      </div>
    </div>
  </section>
</template>
