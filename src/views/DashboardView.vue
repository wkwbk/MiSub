<script setup>
    import { computed, ref, defineAsyncComponent, onMounted } from 'vue';
    import { FileText } from 'lucide-vue-next';
    import { useDataStore } from '../stores/useDataStore.js';
    import { useBulkImportLogic } from '../composables/useBulkImportLogic.js';
    import { storeToRefs } from 'pinia';
    import SkeletonLoader from '../components/ui/SkeletonLoader.vue';
    import RightPanel from '../components/profiles/RightPanel.vue';
    import { useSubscriptions } from '../composables/useSubscriptions.js';
    import { useRouter } from 'vue-router';
    import { useProfiles } from '../composables/useProfiles.js';
    import { useManualNodes } from '../composables/useManualNodes.js';
    import { formatBytes } from '../lib/utils.js';
    import StatCards from '../components/features/Dashboard/StatCards.vue';
    import {
        addDismissedHealthItem,
        clearLegacyDismissedHealthItemIds,
        filterDismissedHealthItems,
        isHealthItemDismissed,
        normalizeDismissedHealthItemIds,
        readLegacyDismissedHealthItemIds,
    } from '../utils/health-item-dismissal.js';
    import {
        getDashboardHealthItems,
        resolveHealthItemCopy,
        shouldShowFullGuide,
    } from '../utils/dashboard-health.js';
    import { useToastStore } from '../stores/toast.js';
    import { useI18n } from '../i18n/index.js';

    const { t } = useI18n();
    const { showToast } = useToastStore();

    const dataStore = useDataStore();
    const { settings, profiles, isLoading, lastUpdated } = storeToRefs(dataStore);
    const { activeProfiles, markDirty } = dataStore;

    const {
        totalRemainingTraffic: trafficVal,
        enabledSubscriptionsCount,
        subscriptions,
        addSubscriptionsFromBulk,
    } = useSubscriptions(markDirty);

    const { manualNodes, addNodesFromBulk } = useManualNodes(markDirty);

    const router = useRouter();

    const formattedTotalRemainingTraffic = computed(() => formatBytes(trafficVal.value));

    const totalNodesCount = computed(() => {
        return (subscriptions.value || []).reduce((acc, sub) => acc + (sub.nodeCount || 0), 0);
    });

    const subscriptionsCount = computed(() => (subscriptions.value || []).length);
    const activeProfilesCount = computed(() => (activeProfiles || []).length);

    const lastUpdatedTime = computed(() => {
        if (!lastUpdated.value) return t('dashboard.never');
        return new Date(lastUpdated.value).toLocaleString();
    });

    const trafficStats = computed(() => {
        let totalUsed = 0;
        let totalMax = 0;
        (subscriptions.value || []).forEach((sub) => {
            if (sub.excludeTraffic) return;
            if (sub.userInfo) {
                totalUsed += (sub.userInfo.upload || 0) + (sub.userInfo.download || 0);
                totalMax += sub.userInfo.total || 0;
            }
        });
        const percentage =
            totalMax > 0 ? Math.min(100, (totalUsed / totalMax) * 100).toFixed(1) : 0;
        return {
            used: formatBytes(totalUsed),
            total: formatBytes(totalMax),
            percentage,
        };
    });

    // 已忽略的待处理项，直接派生自设置（settings.dismissedHealthItems）。
    // 放在设置里而不是 localStorage，是为了跨设备同步。
    // 用 computed 而不是本地 ref 镜像：保存成功后 settings 更新，列表自动重算。
    const dismissedHealthItemIds = computed(() =>
        normalizeDismissedHealthItemIds(settings.value?.dismissedHealthItems)
    );

    const allHealthItems = computed(() =>
        getDashboardHealthItems({
            subscriptions: subscriptions.value || [],
            profiles: profiles.value || [],
            settings: settings.value || {},
            totalNodesCount: totalNodesCount.value,
        }).map((item) => resolveHealthItemCopy(item, t))
    );

    const dashboardHealthItems = computed(() =>
        filterDismissedHealthItems(allHealthItems.value, dismissedHealthItemIds.value)
    );

    const dismissedHealthItemsCount = computed(
        () => allHealthItems.value.length - dashboardHealthItems.value.length
    );

    const hasHealthItems = computed(() => dashboardHealthItems.value.length > 0);

    // How many health items to render before the "show more" toggle kicks in.
    const HEALTH_ITEMS_COLLAPSED_COUNT = 4;
    const showAllHealthItems = ref(false);
    const visibleHealthItems = computed(() =>
        showAllHealthItems.value
            ? dashboardHealthItems.value
            : dashboardHealthItems.value.slice(0, HEALTH_ITEMS_COLLAPSED_COUNT)
    );
    const hiddenHealthItemsCount = computed(() =>
        Math.max(0, dashboardHealthItems.value.length - visibleHealthItems.value.length)
    );

    const showFullGuide = computed(() =>
        shouldShowFullGuide({
            subscriptions: subscriptions.value || [],
            profiles: profiles.value || [],
        })
    );

    const readinessText = computed(() => {
        if (subscriptionsCount.value === 0) return t('dashboard.readiness.waitingForSubscriptions');
        if (activeProfilesCount.value === 0) return t('dashboard.readiness.waitingForProfiles');
        if (totalNodesCount.value === 0) return t('dashboard.readiness.needsRefresh');
        if (hasHealthItems.value) return t('dashboard.readiness.hasPendingItems');
        return t('dashboard.readiness.ready');
    });

    const readinessToneClass = computed(() => {
        return 'bg-transparent text-zinc-300 border-zinc-800';
    });

    const readinessDotClass = computed(() => {
        if (!hasHealthItems.value && totalNodesCount.value > 0) {
            return 'bg-emerald-500';
        }
        return 'bg-amber-500';
    });

    const healthToneClasses = {
        danger: 'border-zinc-800 bg-transparent text-zinc-200',
        warning: 'border-zinc-800 bg-transparent text-zinc-200',
        info: 'border-zinc-800 bg-transparent text-zinc-200',
    };

    const healthDotClasses = {
        danger: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-sky-500',
    };

    const handleStatNavigate = (path, query = {}) => {
        router.push({ path, query });
    };

    // --- Bulk Import Logic ---
    const { showModal: showBulkImportModal, handleBulkImport } = useBulkImportLogic({
        addSubscriptionsFromBulk,
        addNodesFromBulk,
    });

    const openBulkImportModal = () => {
        showBulkImportModal.value = true;
    };

    const BulkImportModal = defineAsyncComponent(
        () => import('../components/modals/BulkImportModal.vue')
    );

    // --- Profile Modal Logic ---
    const { handleAddProfile, handleSaveProfile, editingProfile, isNewProfile, showProfileModal } =
        useProfiles(markDirty);

    const ProfileModal = defineAsyncComponent(
        () => import('../components/modals/ProfileModal.vue')
    );

    // --- Log Modal Logic ---
    const showLogModal = ref(false);
    const LogModal = defineAsyncComponent(() => import('../components/modals/LogModal.vue'));

    // Kept below the `showLogModal` declaration on purpose: this handler closes
    // over it, so co-locating them keeps the dependency obvious and immune to a
    // future refactor that might call it during setup.
    //
    // Only the PRIMARY button routes here. `item.action` is the *secondary*
    // action key and must not be consulted: an item can carry both (e.g. the
    // error card links to the filtered list AND offers "打开日志"), and reading
    // `action` here used to short-circuit the primary navigation entirely.
    const handleHealthAction = (item) => {
        if (item.actionRoute) {
            router.push({ path: item.actionRoute, query: item.actionQuery || {} });
        }
    };

    // Secondary buttons dispatch the item's own action key instead of navigating.
    const handleHealthSecondaryAction = (item) => {
        if (item.action === 'openLog') {
            showLogModal.value = true;
        }
    };

    // --- Health item dismissal ---
    // 隐藏某个待处理项只是记一条偏好，底层问题不动，所以「全部恢复」能把它放回来。
    // 这份偏好现在存在设置里并同步到服务端（跨设备生效），
    // 写入失败必须明确告知用户，否则表现为「点了没反应」且没有任何提示。
    // silent=true：忽略某个待处理项不该弹「设置已更新」，失败文案也用下面更贴切的两句。
    // preferencesOnly=true：这个字段不影响节点处理，让服务端跳过清缓存与 TG 通知。
    const persistDismissedHealthItems = async (ids) => {
        try {
            await dataStore.saveSettings(
                { dismissedHealthItems: ids },
                { silent: true, preferencesOnly: true }
            );
            return true;
        } catch {
            // saveSettings 已在控制台留下原因，这里只负责给用户一句能看懂的提示
            return false;
        }
    };

    const dismissHealthItemById = async (id) => {
        const current = dismissedHealthItemIds.value;
        // 已经忽略过就不必再往返一次服务端
        if (isHealthItemDismissed(current, id)) return;
        const persisted = await persistDismissedHealthItems(addDismissedHealthItem(current, id));
        if (!persisted) {
            showToast(t('dashboard.health.dismissFailed'), 'error');
        }
    };

    const restoreDismissedHealthItems = async () => {
        if (dismissedHealthItemIds.value.length === 0) return;
        const persisted = await persistDismissedHealthItems([]);
        if (!persisted) {
            showToast(t('dashboard.health.restoreFailed'), 'error');
        }
    };

    // 一次性迁移：旧版的忽略记录只存在本机 localStorage，不并进设置的话，
    // 升级后用户之前忽略过的项会全部复活。
    // 规则：只在服务端还没有这份列表时采用本机记录（bootstrap）；
    // 服务端已有数据就以服务端为准 —— 它更新、且汇总了所有设备，
    // 否则会把用户在别的设备上「全部恢复」掉的项又塞回来。
    // 无论走哪条分支都要清掉旧键，否则每次启动都会重复迁移。
    onMounted(async () => {
        const legacy = readLegacyDismissedHealthItemIds();
        if (legacy.length === 0) return;

        if (dismissedHealthItemIds.value.length === 0) {
            const persisted = await persistDismissedHealthItems(
                normalizeDismissedHealthItemIds(legacy)
            );
            // 写不进去就先留着旧键，下次启动再试（清了就等于把用户的记录丢了）
            if (!persisted) return;
        }
        clearLegacyDismissedHealthItemIds();
    });

    // --- QRCode Modal Logic ---
    const QRCodeModal = defineAsyncComponent(() => import('../components/modals/QRCodeModal.vue'));
    const showQRCodeModal = ref(false);
    const qrCodeUrl = ref('');
    const qrCodeTitle = ref('');

    const handleQRCode = (url, title) => {
        qrCodeUrl.value = url;
        qrCodeTitle.value = title;
        showQRCodeModal.value = true;
    };
</script>

<template>
    <div class="space-y-4 bg-[#131515] text-zinc-100">
        <div v-if="isLoading" class="p-4">
            <SkeletonLoader type="dashboard" />
        </div>

        <template v-else>
            <section
                class="relative overflow-hidden bg-[#171717] border border-zinc-800 rounded-md p-4 sm:p-5 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
            >
                <div
                    class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
                >
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2.5">
                            <h1 class="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
                                {{ t('dashboard.title') }}
                            </h1>
                            <span
                                class="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium"
                                :class="readinessToneClass"
                            >
                                <span
                                    class="h-1.5 w-1.5 rounded-full shrink-0"
                                    :class="readinessDotClass"
                                ></span>
                                {{ readinessText }}
                            </span>
                        </div>
                        <p
                            class="mt-2 text-xs sm:text-sm text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1"
                        >
                            <span>{{ t('dashboard.subtitle') }}</span>
                            <span class="hidden sm:inline text-zinc-700">|</span>
                            <span class="w-full sm:w-auto text-xs sm:text-sm"
                                >{{ t('dashboard.lastUpdate') }}:
                                <span class="font-mono text-zinc-300">{{
                                    lastUpdatedTime
                                }}</span></span
                            >
                        </p>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                        <button
                            @click="showLogModal = true"
                            class="min-h-10 flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-zinc-100 rounded-md transition-colors border border-zinc-800 shadow-none"
                        >
                            <FileText class="h-4 w-4 shrink-0 text-zinc-400" stroke-width="1.5" />
                            {{ t('dashboard.actions.viewLog') }}
                        </button>
                        <button
                            @click="openBulkImportModal"
                            class="min-h-10 px-3.5 py-2 text-xs sm:text-sm font-medium bg-transparent text-zinc-200 hover:bg-zinc-900 hover:text-zinc-100 rounded-md transition-colors border border-zinc-800 shadow-none"
                        >
                            {{ t('dashboard.actions.bulkImport') }}
                        </button>
                        <button
                            @click="handleAddProfile"
                            class="min-h-10 px-3.5 py-2 text-xs sm:text-sm font-semibold text-zinc-900 bg-zinc-100 hover:bg-white rounded-md transition-colors border border-zinc-100 shadow-none"
                        >
                            {{ t('dashboard.actions.addProfile') }}
                        </button>
                    </div>
                </div>
            </section>

            <StatCards
                :formatted-total-remaining-traffic="formattedTotalRemainingTraffic"
                :traffic-stats="trafficStats"
                :active-subscriptions-count="enabledSubscriptionsCount"
                :subscriptions-count="subscriptionsCount"
                :total-nodes-count="totalNodesCount"
                :active-profiles-count="activeProfilesCount"
                @navigate="handleStatNavigate"
            />

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 space-y-4">
                    <section
                        class="bg-[#171717] p-5 rounded-md shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] border border-zinc-800"
                    >
                        <div
                            class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 mb-4 border-b border-zinc-800"
                        >
                            <div>
                                <h3
                                    class="text-base font-semibold text-zinc-100 flex items-center gap-2"
                                >
                                    <span
                                        class="h-1.5 w-1.5 rounded-full shrink-0"
                                        :class="hasHealthItems ? 'bg-amber-500' : 'bg-emerald-500'"
                                    ></span>
                                    {{ t('dashboard.health.title') }}
                                </h3>
                                <p class="mt-1 text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.health.subtitle') }}
                                </p>
                            </div>
                            <span
                                class="text-xs font-mono font-medium text-zinc-400 border border-zinc-800 rounded-md px-2 py-0.5 self-start sm:self-auto"
                                >{{
                                    t('dashboard.health.itemsCount', {
                                        count: dashboardHealthItems.length,
                                    })
                                }}</span
                            >
                        </div>

                        <div v-if="hasHealthItems" class="grid gap-3">
                            <div
                                v-for="item in visibleHealthItems"
                                :key="item.id"
                                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3.5 font-mono"
                                :class="healthToneClasses[item.tone] || healthToneClasses.info"
                            >
                                <div class="flex gap-3 min-w-0 font-sans">
                                    <span
                                        class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                                        :class="
                                            healthDotClasses[item.tone] || healthDotClasses.info
                                        "
                                    ></span>
                                    <div class="min-w-0">
                                        <p class="text-sm font-medium text-zinc-100 font-mono">
                                            {{ item.title }}
                                        </p>
                                        <p class="mt-0.5 text-xs sm:text-sm text-zinc-400">
                                            {{ item.description }}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex shrink-0 flex-col sm:flex-row gap-2 font-sans">
                                    <button
                                        v-if="item.actionLabel"
                                        type="button"
                                        class="min-h-9 rounded-md border border-zinc-100 bg-zinc-100 text-zinc-900 px-3 py-1.5 text-xs font-semibold hover:bg-white transition-colors shadow-none"
                                        @click="handleHealthAction(item)"
                                    >
                                        {{ item.actionLabel }}
                                    </button>
                                    <button
                                        v-if="item.secondaryActionLabel"
                                        type="button"
                                        class="min-h-9 rounded-md border border-zinc-800 bg-transparent text-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900 hover:text-zinc-100 transition-colors shadow-none"
                                        @click="handleHealthSecondaryAction(item)"
                                    >
                                        {{ item.secondaryActionLabel }}
                                    </button>
                                    <button
                                        type="button"
                                        class="min-h-9 rounded-md border border-zinc-800 bg-transparent text-zinc-400 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900 hover:text-zinc-200 transition-colors shadow-none"
                                        :title="t('dashboard.health.dismissItem')"
                                        :aria-label="t('dashboard.health.dismissItem')"
                                        data-testid="health-item-dismiss"
                                        @click="dismissHealthItemById(item.id)"
                                    >
                                        {{ t('dashboard.health.dismiss') }}
                                    </button>
                                </div>
                            </div>
                            <button
                                v-if="hiddenHealthItemsCount > 0 || showAllHealthItems"
                                type="button"
                                class="min-h-9 justify-self-start rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors shadow-none"
                                @click="showAllHealthItems = !showAllHealthItems"
                            >
                                {{
                                    showAllHealthItems
                                        ? t('dashboard.health.showLess')
                                        : t('dashboard.health.showMore', {
                                              count: hiddenHealthItemsCount,
                                          })
                                }}
                            </button>
                        </div>
                        <div
                            v-else
                            class="rounded-md border border-zinc-800 bg-transparent p-4 text-zinc-200 flex items-start gap-3"
                        >
                            <span
                                class="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                            ></span>
                            <div>
                                <p class="text-sm font-medium text-zinc-100">
                                    {{ t('dashboard.health.allGood') }}
                                </p>
                                <p class="mt-1 text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.health.allGoodDesc') }}
                                </p>
                            </div>
                        </div>
                        <button
                            v-if="dismissedHealthItemsCount > 0"
                            type="button"
                            class="mt-3 justify-self-start text-xs font-mono font-medium text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200 transition-colors"
                            data-testid="health-items-restore"
                            @click="restoreDismissedHealthItems"
                        >
                            {{
                                t('dashboard.health.restoreDismissed', {
                                    count: dismissedHealthItemsCount,
                                })
                            }}
                        </button>
                    </section>

                    <section
                        v-if="showFullGuide"
                        class="bg-[#171717] p-5 rounded-md shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] border border-zinc-800"
                    >
                        <h3
                            class="text-base font-semibold text-zinc-100 pb-4 mb-4 border-b border-zinc-800 flex items-center gap-2"
                        >
                            <span class="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0"></span>
                            {{ t('dashboard.guide.title') }}
                        </h3>
                        <div
                            class="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800 border border-zinc-800 rounded-md overflow-hidden md:[&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-zinc-800"
                        >
                            <div class="p-4 bg-transparent">
                                <h4 class="text-sm font-mono font-medium text-zinc-200 mb-1.5">
                                    {{ t('dashboard.guide.step1Title') }}
                                </h4>
                                <p class="text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.guide.step1Desc') }}
                                </p>
                            </div>
                            <div class="p-4 bg-transparent">
                                <h4 class="text-sm font-mono font-medium text-zinc-200 mb-1.5">
                                    {{ t('dashboard.guide.step2Title') }}
                                </h4>
                                <p class="text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.guide.step2Desc') }}
                                </p>
                            </div>
                            <div class="p-4 bg-transparent">
                                <h4 class="text-sm font-mono font-medium text-zinc-200 mb-1.5">
                                    {{ t('dashboard.guide.step3Title') }}
                                </h4>
                                <p class="text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.guide.step3Desc') }}
                                </p>
                            </div>
                            <div class="p-4 bg-transparent">
                                <h4 class="text-sm font-mono font-medium text-zinc-200 mb-1.5">
                                    {{ t('dashboard.guide.step4Title') }}
                                </h4>
                                <p class="text-xs sm:text-sm text-zinc-400">
                                    {{ t('dashboard.guide.step4Desc') }}
                                </p>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="lg:col-span-1">
                    <RightPanel :config="settings" :profiles="profiles" @qrcode="handleQRCode" />
                </div>
            </div>

            <BulkImportModal
                v-if="showBulkImportModal"
                :show="showBulkImportModal"
                @update:show="showBulkImportModal = $event"
                @import="(txt, tag) => handleBulkImport(txt, tag)"
                @files-imported="(nodes, group) => addNodesFromBulk(nodes, group)"
            />

            <ProfileModal
                v-if="showProfileModal"
                v-model:show="showProfileModal"
                :profile="editingProfile"
                :is-new="isNewProfile"
                :all-subscriptions="subscriptions"
                :all-manual-nodes="manualNodes"
                @save="handleSaveProfile"
                size="2xl"
            />

            <LogModal :show="showLogModal" @update:show="showLogModal = $event" />

            <QRCodeModal v-model:show="showQRCodeModal" :url="qrCodeUrl" :title="qrCodeTitle" />
        </template>
    </div>
</template>
