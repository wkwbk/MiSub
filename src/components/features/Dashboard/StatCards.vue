<script setup>
    import { computed, ref } from 'vue';
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
    const remainingTrafficPercentage = computed(() =>
        Math.max(0, 100 - trafficUsedPercentage.value)
    );
    const hasTrafficWarning = computed(
        () => props.subscriptionsCount > 0 && remainingTrafficPercentage.value <= 20
    );
    const hasSubscriptionWarning = computed(
        () => props.subscriptionsCount === 0 || props.activeSubscriptionsCount === 0
    );
    const hasNodeWarning = computed(
        () => props.subscriptionsCount > 0 && props.totalNodesCount === 0
    );
    const hasProfileWarning = computed(() => props.activeProfilesCount === 0);

    const isVisible = ref(true);

    const cardBaseClass =
        'stat-card group w-full text-left bg-[#171717] p-4 sm:p-5 rounded-md shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_8px_26px_rgba(0,0,0,0.7)] border border-zinc-800 hover:border-zinc-500 transition-all duration-200 focus-visible:outline-hidden focus-visible:border-zinc-400 cursor-pointer';
    const normalCardClass = 'border-zinc-800';
    const warningCardClass = 'border-zinc-800';

    const navigate = (path, query = {}) => {
        emit('navigate', path, query);
    };
</script>

<template>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <button
            type="button"
            data-testid="stat-card-traffic"
            :class="[
                cardBaseClass,
                hasTrafficWarning ? warningCardClass : normalCardClass,
                { 'stat-card-visible': isVisible },
            ]"
            style="--delay: 0ms"
            @click="
                navigate(
                    '/dashboard/subscriptions',
                    hasTrafficWarning ? { status: 'low-traffic' } : {}
                )
            "
        >
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {{ t('dashboard.remainingTraffic') }}
                </h3>
                <span class="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                </span>
            </div>
            <p class="text-2xl font-semibold text-zinc-100 tracking-tight leading-none font-mono">
                {{ trafficDisplay.value }}
                <span class="ml-1 text-xs font-normal text-zinc-500 font-mono">{{
                    trafficDisplay.unit
                }}</span>
            </p>
            <div class="mt-3 w-full bg-zinc-800 rounded-none h-1 overflow-hidden">
                <div
                    class="h-1 transition-all duration-1000 ease-out"
                    :class="hasTrafficWarning ? 'bg-amber-500' : 'bg-zinc-100'"
                    :style="{ width: isVisible ? remainingTrafficPercentage + '%' : '0%' }"
                ></div>
            </div>
            <p class="text-xs mt-2 flex items-center gap-1.5 text-zinc-400 font-mono">
                <span
                    class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    :class="hasTrafficWarning ? 'bg-amber-500' : 'bg-emerald-500'"
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
            type="button"
            data-testid="stat-card-subscriptions"
            :class="[
                cardBaseClass,
                hasSubscriptionWarning ? warningCardClass : normalCardClass,
                { 'stat-card-visible': isVisible },
            ]"
            style="--delay: 100ms"
            @click="
                navigate(
                    '/dashboard/subscriptions',
                    hasSubscriptionWarning
                        ? { status: subscriptionsCount === 0 ? 'missing' : 'disabled' }
                        : {}
                )
            "
        >
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {{ t('dashboard.activeSubscriptions') }}
                </h3>
                <span class="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                    </svg>
                </span>
            </div>
            <p class="text-2xl font-semibold text-zinc-100 tracking-tight leading-none font-mono">
                {{ activeSubscriptionsCount }}
                <span class="text-xs font-normal text-zinc-500 font-mono"
                    >/ {{ subscriptionsCount }}</span
                >
            </p>
            <p class="text-xs mt-2 flex items-center gap-1.5 text-zinc-400">
                <span
                    class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    :class="hasSubscriptionWarning ? 'bg-amber-500' : 'bg-emerald-500'"
                ></span>
                <span>{{
                    hasSubscriptionWarning
                        ? t('dashboard.needsEnableSubscriptions')
                        : t('dashboard.normalRunning')
                }}</span>
            </p>
        </button>

        <button
            type="button"
            data-testid="stat-card-nodes"
            :class="[
                cardBaseClass,
                hasNodeWarning ? warningCardClass : normalCardClass,
                { 'stat-card-visible': isVisible },
            ]"
            style="--delay: 200ms"
            @click="
                navigate('/dashboard/subscriptions', hasNodeWarning ? { status: 'zero-nodes' } : {})
            "
        >
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {{ t('dashboard.totalNodes') }}
                </h3>
                <span class="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </span>
            </div>
            <p class="text-2xl font-semibold text-zinc-100 tracking-tight leading-none font-mono">
                {{ totalNodesCount }}
            </p>
            <p class="text-xs mt-2 flex items-center gap-1.5 text-zinc-400 font-mono">
                <span
                    class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    :class="hasNodeWarning ? 'bg-amber-500' : 'bg-emerald-500'"
                ></span>
                <span>
                    {{
                        hasNodeWarning
                            ? t('dashboard.needsRefreshNodes')
                            : t('dashboard.fromSources', { count: subscriptionsCount })
                    }}
                </span>
            </p>
        </button>

        <button
            type="button"
            data-testid="stat-card-profiles"
            :class="[
                cardBaseClass,
                hasProfileWarning ? warningCardClass : normalCardClass,
                { 'stat-card-visible': isVisible },
            ]"
            style="--delay: 300ms"
            @click="
                navigate('/dashboard/subscriptions', hasProfileWarning ? { focus: 'profiles' } : {})
            "
        >
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {{ t('dashboard.combinedSubscriptions') }}
                </h3>
                <span class="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                    </svg>
                </span>
            </div>
            <p class="text-2xl font-semibold text-zinc-100 tracking-tight leading-none font-mono">
                {{ activeProfilesCount }}
            </p>
            <p class="text-xs mt-2 flex items-center gap-1.5 text-zinc-400 font-mono">
                <span
                    class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    :class="hasProfileWarning ? 'bg-amber-500' : 'bg-emerald-500'"
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
            border-color 0.2s ease;
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
