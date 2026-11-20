<script setup>
import { computed, ref } from 'vue';
import { Boxes, ClipboardList, Server, Zap } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  formattedTotalRemainingTraffic: {
    type: String,
    default: '0 B',
  },
  trafficStats: {
    type: Object,
    required: true,
  },
  manualNodesCount: {
    type: Number,
    default: 0,
  },
  enabledManualNodesCount: {
    type: Number,
    default: 0,
  },
  activeSubscriptionsCount: {
    type: Number,
    default: 0,
  },
  subscriptionsCount: {
    type: Number,
    default: 0,
  },
  totalNodesCount: {
    type: Number,
    default: 0,
  },
  activeProfilesCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['navigate']);

const trafficDisplay = computed(() => {
  const parts = props.formattedTotalRemainingTraffic.split(' ');
  return {
    value: parts[0] || props.formattedTotalRemainingTraffic,
    unit: parts[1] || '',
  };
});

const trafficUsedPercentage = computed(() => Number(props.trafficStats?.percentage || 0));
const remainingTrafficPercentage = computed(() => Math.max(0, 100 - trafficUsedPercentage.value));
const hasTrafficWarning = computed(() => props.subscriptionsCount > 0 && remainingTrafficPercentage.value <= 20);
const hasSubscriptionWarning = computed(() => props.subscriptionsCount === 0 || props.activeSubscriptionsCount === 0);
const hasNodeWarning = computed(() => props.subscriptionsCount > 0 && props.totalNodesCount === 0);
const hasManualNodeWarning = computed(() => props.manualNodesCount > 0 && props.enabledManualNodesCount === 0);
const hasProfileWarning = computed(() => props.activeProfilesCount === 0);

const isVisible = ref(true);

const cardBaseClass =
  'stat-card group w-full text-left bg-surface p-4 sm:p-5 rounded-md border border-line transition-all duration-200 focus-visible:outline-hidden focus-visible:border-line-strong cursor-pointer';
const normalCardClass = 'border-line';
const warningCardClass = 'border-line';

const navigate = (path, query = {}) => {
  emit('navigate', path, query);
};
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
    <button
      :class="[
        cardBaseClass,
        hasTrafficWarning ? warningCardClass : normalCardClass,
        { 'stat-card-visible': isVisible },
      ]"
      data-testid="stat-card-traffic"
      style="--delay: 0ms"
      type="button"
      @click="navigate('/dashboard/groups', hasTrafficWarning ? { status: 'low-traffic' } : {})"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-medium text-fg-muted uppercase tracking-wider">
          {{ t('dashboard.remainingTraffic') }}
        </h3>
        <span class="text-fg-subtle group-hover:text-fg transition-colors">
          <Zap class="h-4 w-4" stroke-width="1.5" />
        </span>
      </div>
      <p class="text-2xl font-semibold text-fg tracking-tight leading-none font-mono">
        {{ trafficDisplay.value }}
        <span class="ml-1 text-xs font-normal text-fg-subtle font-mono">{{ trafficDisplay.unit }}</span>
      </p>
      <div class="mt-3 w-full bg-active rounded-none h-1 overflow-hidden">
        <div
          :class="hasTrafficWarning ? 'bg-amber-500' : 'bg-accent'"
          :style="{ width: isVisible ? remainingTrafficPercentage + '%' : '0%' }"
          class="h-1 transition-all duration-1000 ease-out"
        ></div>
      </div>
      <p class="text-xs mt-2 flex items-center gap-1.5 text-fg-muted font-mono">
        <span
          :class="hasTrafficWarning ? 'bg-amber-500' : 'bg-emerald-500'"
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        ></span>
        <span>
          {{
            hasTrafficWarning
              ? t('dashboard.trafficLow')
              : t('dashboard.trafficUsed', {
                  used: trafficStats.used,
                  total: trafficStats.total,
                })
          }}
        </span>
      </p>
    </button>

    <button
      :class="[
        cardBaseClass,
        hasManualNodeWarning ? warningCardClass : normalCardClass,
        { 'stat-card-visible': isVisible },
      ]"
      data-testid="stat-card-nodes"
      style="--delay: 100ms"
      type="button"
      @click="navigate('/dashboard/nodes')"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-medium text-fg-muted uppercase tracking-wider">
          {{ t('dashboard.manualNodes') }}
        </h3>
        <span class="text-fg-subtle group-hover:text-fg transition-colors">
          <Server class="h-4 w-4" stroke-width="1.5" />
        </span>
      </div>
      <p class="text-2xl font-semibold text-fg tracking-tight leading-none font-mono">
        {{ enabledManualNodesCount }}
        <span class="text-xs font-normal text-fg-subtle font-mono">/ {{ manualNodesCount }}</span>
      </p>
      <p class="text-xs mt-2 flex items-center gap-1.5 text-fg-muted font-mono">
        <span
          :class="hasManualNodeWarning ? 'bg-amber-500' : manualNodesCount === 0 ? 'bg-zinc-500' : 'bg-emerald-500'"
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        ></span>
        <span>
          {{
            hasManualNodeWarning
              ? t('dashboard.allManualNodesDisabled')
              : manualNodesCount === 0
                ? t('dashboard.noManualNodes')
                : t('dashboard.enabledManualNodes', {
                    count: enabledManualNodesCount,
                  })
          }}
        </span>
      </p>
    </button>

    <button
      :class="[
        cardBaseClass,
        hasSubscriptionWarning || hasNodeWarning ? warningCardClass : normalCardClass,
        { 'stat-card-visible': isVisible },
      ]"
      data-testid="stat-card-subscriptions"
      style="--delay: 200ms"
      type="button"
      @click="
        navigate(
          '/dashboard/groups',
          hasSubscriptionWarning
            ? { status: subscriptionsCount === 0 ? 'missing' : 'disabled' }
            : hasNodeWarning
              ? { status: 'zero-nodes' }
              : {},
        )
      "
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-medium text-fg-muted uppercase tracking-wider">
          {{ t('dashboard.activeSubscriptions') }}
        </h3>
        <span class="text-fg-subtle group-hover:text-fg transition-colors">
          <Boxes class="h-4 w-4" stroke-width="1.5" />
        </span>
      </div>
      <p class="text-2xl font-semibold text-fg tracking-tight leading-none font-mono">
        {{ activeSubscriptionsCount }}
        <span class="text-xs font-normal text-fg-subtle font-mono">/ {{ subscriptionsCount }}</span>
      </p>
      <p class="text-xs mt-2 flex items-center gap-1.5 text-fg-muted font-mono">
        <span
          :class="hasSubscriptionWarning || hasNodeWarning ? 'bg-amber-500' : 'bg-emerald-500'"
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        ></span>
        <span>{{
          hasSubscriptionWarning
            ? t('dashboard.needsEnableSubscriptions')
            : hasNodeWarning
              ? t('dashboard.needsRefreshNodes')
              : t('dashboard.normalRunningWithNodes', { count: totalNodesCount })
        }}</span>
      </p>
    </button>

    <button
      :class="[
        cardBaseClass,
        hasProfileWarning ? warningCardClass : normalCardClass,
        { 'stat-card-visible': isVisible },
      ]"
      data-testid="stat-card-profiles"
      style="--delay: 300ms"
      type="button"
      @click="navigate('/dashboard/subscriptions', hasProfileWarning ? { focus: 'profiles' } : {})"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-medium text-fg-muted uppercase tracking-wider">
          {{ t('dashboard.combinedSubscriptions') }}
        </h3>
        <span class="text-fg-subtle group-hover:text-fg transition-colors">
          <ClipboardList class="h-4 w-4" stroke-width="1.5" />
        </span>
      </div>
      <p class="text-2xl font-semibold text-fg tracking-tight leading-none font-mono">
        {{ activeProfilesCount }}
      </p>
      <p class="text-xs mt-2 flex items-center gap-1.5 text-fg-muted font-mono">
        <span
          :class="hasProfileWarning ? 'bg-amber-500' : 'bg-emerald-500'"
          class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        ></span>
        <span>
          {{
            hasProfileWarning
              ? t('dashboard.needsCreateProfile')
              : t('dashboard.publishedProfiles', { count: activeProfilesCount })
          }}
        </span>
      </p>
    </button>
  </div>
</template>

<style scoped>
.stat-card {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition:
    opacity 0.6s ease-out,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  transition-delay: 0ms;
}

.stat-card-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.stat-card-visible:hover {
  transform: translateY(-4px);
  z-index: 10;
}

.stat-card-visible:active {
  transform: translateY(0);
}

@keyframes ping-slow {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.5);
  }
  100% {
    opacity: 0;
    transform: scale(2);
  }
}

.animate-ping-slow {
  animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .stat-card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .animate-ping-slow {
    animation: none;
  }
}
</style>
