<script setup lang="ts">
import { computed } from 'vue';
import { Activity, BellRing, CalendarClock, Server } from '@lucide/vue';
import { formatBytes } from '@misub/core/utils/format-utils.js';
import { useI18n } from '@/i18n/index.js';
import type { SubscriptionPortalPayload } from '@/utils/portal-bootstrap.js';

const props = defineProps<{
  portalData: SubscriptionPortalPayload;
}>();

const { t } = useI18n();

const totalBytes = computed(() => Math.max(0, Number(props.portalData.traffic.total) || 0));
const usedBytes = computed(
  () => Math.max(0, Number(props.portalData.traffic.upload) || 0) + Math.max(0, Number(props.portalData.traffic.download) || 0),
);
const remainingBytes = computed(() =>
  totalBytes.value > 0 ? Math.max(0, Number(props.portalData.traffic.remaining) || 0) : 0,
);
const remainingPercent = computed(() =>
  totalBytes.value > 0 ? Math.max(0, Math.min(100, Math.round((remainingBytes.value / totalBytes.value) * 100))) : 0,
);

const trafficPrimaryText = computed(() =>
  totalBytes.value > 0
    ? `${formatBytes(remainingBytes.value)} / ${formatBytes(totalBytes.value)}`
    : t('portal.trafficUnlimited'),
);

const trafficSubText = computed(() =>
  totalBytes.value > 0
    ? t('portal.trafficUsedPercent', {
        used: formatBytes(usedBytes.value),
        percent: remainingPercent.value,
      })
    : t('portal.trafficUnlimitedHint'),
);

const statusBadgeClass = computed(() => {
  if (props.portalData.isExpired || props.portalData.expireStatus === '已到期') {
    return 'bg-status-danger-bg text-status-danger border-status-danger-border';
  }
  if (props.portalData.expireStatus === '即将到期') {
    return 'bg-status-warning-bg text-status-warning border-status-warning-border';
  }
  return 'bg-status-success-bg text-status-success border-status-success-border';
});

const statusLabel = computed(() => {
  if (props.portalData.isExpired || props.portalData.expireStatus === '已到期') {
    return t('portal.statusExpired');
  }
  if (props.portalData.expireStatus === '即将到期') {
    return t('portal.statusExpiringSoon');
  }
  return props.portalData.expireStatus || t('portal.statusNormal');
});
</script>

<template>
  <section
    aria-labelledby="portal-overview-heading"
    class="rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-card)] space-y-4"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <h2 id="portal-overview-heading" class="text-sm font-semibold text-fg tracking-tight">
          {{ t('portal.overviewTitle') }}
        </h2>
        <p class="text-xs text-fg-muted truncate">
          {{ t('portal.subNameLabel', { name: portalData.subName }) }}
        </p>
      </div>
      <span
        :class="statusBadgeClass"
        class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shrink-0"
      >
        <span
          :class="
            portalData.isExpired || portalData.expireStatus === '已到期'
              ? 'bg-red-500'
              : portalData.expireStatus === '即将到期'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
          "
          class="h-1.5 w-1.5 rounded-full"
        ></span>
        <span>{{ statusLabel }}</span>
      </span>
    </div>

    <div
      v-if="portalData.notice"
      class="flex items-start gap-2.5 rounded-md border border-line bg-inset/80 px-3.5 py-2.5 text-xs text-fg leading-relaxed whitespace-pre-line"
      data-testid="portal-notice-banner"
    >
      <BellRing class="h-4 w-4 text-primary-500 shrink-0 mt-0.5" />
      <div class="min-w-0 break-words">{{ portalData.notice }}</div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="rounded-md border border-line bg-inset/60 p-3.5 space-y-2">
        <div class="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{{ t('portal.remainingTrafficLabel') }}</span>
          <Activity class="h-3.5 w-3.5 text-fg-subtle shrink-0" />
        </div>
        <div class="text-base font-semibold font-mono text-fg truncate">
          {{ trafficPrimaryText }}
        </div>
        <div v-if="totalBytes > 0" class="h-1.5 w-full rounded-full bg-active overflow-hidden">
          <div
            :style="{ width: `${remainingPercent}%` }"
            class="h-full rounded-full bg-emerald-500 transition-all duration-300"
          ></div>
        </div>
        <div class="text-[11px] text-fg-subtle">
          {{ trafficSubText }}
        </div>
      </div>

      <div class="rounded-md border border-line bg-inset/60 p-3.5 space-y-2">
        <div class="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{{ t('portal.nearestExpireLabel') }}</span>
          <CalendarClock class="h-3.5 w-3.5 text-fg-subtle shrink-0" />
        </div>
        <div class="text-base font-semibold font-mono text-fg truncate">
          {{ portalData.expireText || t('portal.expireNotSet') }}
        </div>
        <div class="text-[11px] text-fg-subtle">
          {{ t('portal.currentStatusLabel', { status: statusLabel }) }}
        </div>
      </div>

      <div class="rounded-md border border-line bg-inset/60 p-3.5 space-y-2">
        <div class="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{{ t('portal.availableNodesLabel') }}</span>
          <Server class="h-3.5 w-3.5 text-fg-subtle shrink-0" />
        </div>
        <div class="text-base font-semibold font-mono text-fg" data-testid="portal-node-count">
          {{ portalData.nodeCount }}
        </div>
        <div class="text-[11px] text-fg-subtle">
          {{ t('portal.availableNodesHint') }}
        </div>
      </div>
    </div>
  </section>
</template>
