<script setup>
    import { computed, ref, nextTick, watch, onBeforeUnmount } from 'vue';
    import { Search, ChevronDown, X, GripVertical } from 'lucide-vue-next';
    import draggable from 'vuedraggable';
    import Card from '../ui/Card.vue';
    import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
    import SortingBanner from '@/components/shared/SortingBanner.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import Modal from '@/components/forms/Modal.vue';
    import { useUIStore } from '@/stores/ui';
    import { useI18n } from '@/i18n/index.js';
    import { hasDragOrderChanged } from '../../composables/useSortingMode.js';
    import { inferAirportRootDomain } from '../../utils/airport-domain.js';
    import { lookupDomainName } from '../../utils/domain-name-memory.js';
    import {
        getAirportIdentityKey,
        getAirportIdentityName,
        createAirportGroupId,
    } from '../../utils/airport-identity.js';

    const { layoutMode } = useUIStore();
    const { t } = useI18n();

    const props = defineProps({
        subscriptions: { type: Array, default: () => [] },
        batchSize: { type: Number, default: 12 },
        isSorting: Boolean,
        searchable: { type: Boolean, default: false },
        searchQuery: { type: String, default: '' },
        filteredCount: { type: Number, default: undefined },
        isRefreshing: { type: Boolean, default: false },
        refreshError: { type: Boolean, default: false },
        lastRefreshAt: { type: [String, Number, Date], default: null },
        statusFilter: { type: String, default: '' },
        statusFilterLabel: { type: String, default: '' },
    });

    const groupNameInput = ref('');
    const selectedSubscriptionIds = ref([]);
    const originalGroupIds = ref([]);
    const editingGroupId = ref('');
    const isCreatingNewGroup = ref(false);
    const showAirportIdentityEditor = ref(false);
    const extractHost = (url) => {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    };
    const emit = defineEmits([
        'add',
        'delete',
        'updateNodeCount',
        'edit',
        'toggleSort',
        'markDirty',
        'preview',
        'deleteAll',
        'refreshAll',
        'reorder',
        'import',
        'qrcode',
        'updateSearch',
        'applyDetectedName',
        'reset-group',
        'assign-airport-group',
        'split-airport-group',
        'clearStatusFilter',
    ]);

    const searchModel = computed({
        get: () => props.searchQuery,
        set: (value) => emit('updateSearch', value),
    });

    const matchedSubscriptions = computed(() => {
        const list = props.subscriptions || [];
        const query = String(props.searchQuery || '')
            .trim()
            .toLowerCase();
        if (!query) return list;

        return list.filter((sub) =>
            [
                sub.name,
                sub.description,
                sub.remark,
                sub.note,
                sub.website,
                sub.url,
                sub.customId,
            ].some((value) =>
                String(value || '')
                    .toLowerCase()
                    .includes(query)
            )
        );
    });

    const visibleCount = computed(() => props.filteredCount ?? matchedSubscriptions.value.length);
    const refreshTime = computed(() => {
        if (!props.lastRefreshAt) return '';
        const date = new Date(props.lastRefreshAt);
        return Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const draggableSubscriptions = computed({
        get: () => [...props.subscriptions],
        set: (val) => emit('reorder', val),
    });

    const handleDelete = (id) => emit('delete', id);
    const handleEdit = (id) => emit('edit', id);
    const handleUpdate = (id) => emit('updateNodeCount', id);
    const handlePreview = (id) => emit('preview', id);
    const handleQRCode = (id) => emit('qrcode', id);
    const handleAdd = () => emit('add');
    const handleToggleSort = () => emit('toggleSort');
    const handleSortEnd = () => emit('markDirty');
    const handleDragEnd = (evt) => {
        if (hasDragOrderChanged(evt)) {
            handleSortEnd();
        }
    };
    const handleDeleteAll = () => emit('deleteAll');
    const handleRefreshAll = () => emit('refreshAll');
    const handleImport = () => emit('import');

    const hasExplicitAirportIdentity = computed(() =>
        props.subscriptions.some((item) => item.airportIdentity?.groupId)
    );
    const handleResetGroup = (group) =>
        emit(
            'reset-group',
            group.items.map((it) => it.id)
        );
    const handleResetAllGroups = () => {
        const ids = props.subscriptions
            .filter((item) => item.airportIdentity?.groupId)
            .map((item) => item.id);
        if (ids.length > 0) emit('reset-group', ids);
    };
    const openAirportIdentityEditor = (group = null) => {
        if (group && Array.isArray(group.items)) {
            isCreatingNewGroup.value = false;
            groupNameInput.value = groupDisplayName(group);
            const ids = group.items.map((item) => item.id);
            originalGroupIds.value = [...ids];
            selectedSubscriptionIds.value = [...ids];
            editingGroupId.value =
                group.items.map((item) => item.airportIdentity?.groupId).find(Boolean) || '';
        } else {
            isCreatingNewGroup.value = true;
            groupNameInput.value = '';
            originalGroupIds.value = [];
            selectedSubscriptionIds.value = [];
            editingGroupId.value = '';
        }
        showAirportIdentityEditor.value = true;
    };
    const toggleSubscriptionSelection = (id) => {
        if (selectedSubscriptionIds.value.includes(id)) {
            selectedSubscriptionIds.value = selectedSubscriptionIds.value.filter(
                (itemId) => itemId !== id
            );
        } else {
            selectedSubscriptionIds.value = [...selectedSubscriptionIds.value, id];
        }
    };
    const saveAirportIdentity = () => {
        const name = groupNameInput.value.trim();
        const selected = [...selectedSubscriptionIds.value];
        if (!name || selected.length === 0) return;
        const groupId = editingGroupId.value || createAirportGroupId();
        emit('assign-airport-group', selected, { groupId, name });
        const removedIds = originalGroupIds.value.filter((id) => !selected.includes(id));
        if (removedIds.length > 0) {
            emit('reset-group', removedIds);
        }
        showAirportIdentityEditor.value = false;
    };
    const handleSplitAirportGroup = (group) => {
        // 禁止后续域名启发式再次合并：每个订阅获得独立身份，但保留可识别的显示名。
        group.items.forEach((item) => {
            emit('split-airport-group', [item.id], {
                groupId: createAirportGroupId(),
                name: item.airportIdentity?.name || groupDetectedName(group),
            });
        });
    };

    const handleApplyDetectedName = (subscription, name) => {
        emit('applyDetectedName', subscription?.id, name);
        // 父组件同步写入命名记忆，放到下一个 tick 刷新折叠标题
        setTimeout(refreshNameMemory, 0);
    };

    /**
     * 取该折叠组可用于重命名的名字（基础名）。
     * 优先级：
     *   1. 组内任一订阅的识别名（detectedName，来自 Profile-Title / 官网标题）
     *   2. 组域名推断出的品牌名（如 gsafevpn.com -> Gsafevpn）
     *   3. 组域名原文
     * 始终返回非空（除非组本身无 host），保证按钮可用。
     */
    const prettifyHost = (host) => {
        const raw = String(host || '').trim();
        if (!raw) return '';
        // 先去掉 sub1/api/dy11 之类的子域前缀，拿到机场主域名
        const root = inferAirportRootDomain(`https://${raw}`) || raw;
        const parts = root.split('.');
        let main = parts[0];
        // Root domain inference already excludes public-suffix labels (e.g. com.cn/co.uk).
        // 去掉带分隔符的常见拼接后缀（如 xxx-vpn），再首字母大写
        // 注意：不剥离「紧贴」的 vpn（gsafevpn 应保留为 Gsafevpn）
        const cleaned = main
            .replace(/[-_](vpn|proxy|cloud|services?|network|sub|node)$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim();
        const base = cleaned || main;
        return base.charAt(0).toUpperCase() + base.slice(1);
    };

    const resolveGroupItemHost = (group) => {
        if (group?.host && !String(group.host).startsWith('identity:')) {
            return group.host;
        }
        const firstUrl = (group?.items || []).find((item) => item?.url)?.url;
        if (!firstUrl) return '';
        try {
            return new URL(firstUrl).hostname;
        } catch {
            return '';
        }
    };

    const groupDetectedName = (group) => {
        const hit = (group?.items || []).find(
            (item) => typeof item?.detectedName === 'string' && item.detectedName.trim()
        );
        if (hit) return hit.detectedName.trim();
        const host = resolveGroupItemHost(group);
        if (host) return prettifyHost(host);
        return '';
    };

    /**
     * 折叠组的显示名（标题栏）：
     *   1. 该域名记住的机场名（用户确认过，最准）
     *   2. 组内任一订阅的识别名
     *   3. 组域名
     */
    // 命名记忆存于 localStorage（非响应式），用一个版本号触发重算，
    // 使「重命名整组 / 应用识别名」后折叠标题立即更新。
    const nameMemoryVersion = ref(0);

    const groupDisplayName = (group) => {
        // 依赖 version，改名后自动重算
        void nameMemoryVersion.value;
        const confirmed = (group?.items || []).map(getAirportIdentityName).find(Boolean);
        if (confirmed) return confirmed;
        const host = resolveGroupItemHost(group);
        if (host) {
            const rootDomain = inferAirportRootDomain(`https://${host}`) || host;
            const remembered = lookupDomainName(rootDomain);
            if (remembered) return remembered;
        }
        const detected = groupDetectedName(group);
        if (detected) return detected;
        return host || t('subscriptions.otherSources');
    };

    /** 通知命名记忆已更新，触发折叠标题重算 */
    const refreshNameMemory = () => {
        nameMemoryVersion.value += 1;
    };

    // === 按站点自动折叠 ===
    // 同一家机场常有多个订阅链接（域名相同、路径 token 不同），逐个平铺会很乱。
    // 这里按 URL 的域名自动聚合，同一站点的订阅源折叠为一组，可展开查看。
    const collapsedGroups = ref(new Set());
    const knownGroupKeys = ref(new Set());

    /**
     * 从 URL 提取稳定的分组身份。
     * 普通域名按推断出的机场根域聚合（子域、路径 token 不影响）；
     * 在公共托管平台上不能将 tenants 合并到平台根域，保留其 tenant 主机名。
     */
    const siteKeyOf = (sub) => {
        const inferredKey = getAirportIdentityKey(sub);
        return inferredKey.startsWith('identity:')
            ? inferredKey
            : inferredKey.slice('site:'.length);
    };

    /**
     * 按完整筛选结果分组后，以「顶级展示单元（分组或独立订阅）」为单位进行滚动无限加载，
     * 避免按订阅条数分页时把同一机场分组拆散或跨页重复显示。
     */
    const groupedSubscriptions = computed(() => {
        const list = matchedSubscriptions.value || [];
        const order = [];
        const map = new Map();

        list.forEach((sub) => {
            const key = siteKeyOf(sub) || '';
            if (!map.has(key)) {
                map.set(key, []);
                order.push(key);
            }
            map.get(key).push(sub);
        });

        return order.map((key) => ({
            key: key || '__other__',
            host: key,
            items: map.get(key),
        }));
    });

    const isExplicitAirportGroup = (group) =>
        (group?.items || []).some((item) =>
            Boolean(String(item?.airportIdentity?.groupId || '').trim())
        );

    /** 多条目站点，或用户显式创建的机场分组（即使只有 1 条订阅），都以分组卡片展示。 */
    const isGroupedCard = (group) => group.items.length > 1 || isExplicitAirportGroup(group);

    const collapsibleGroups = computed(() =>
        groupedSubscriptions.value.filter(isGroupedCard)
    );

    const ungroupedAllSubscriptions = computed(() =>
        groupedSubscriptions.value.filter((g) => !isGroupedCard(g)).flatMap((g) => g.items)
    );

    const topLevelUnits = computed(() => [
        ...collapsibleGroups.value.map((group) => ({ type: 'group', group })),
        ...ungroupedAllSubscriptions.value.map((subscription) => ({
            type: 'single',
            subscription,
        })),
    ]);

    const normalizedBatchSize = computed(() => Math.max(1, Number(props.batchSize) || 12));
    const visibleUnitLimit = ref(normalizedBatchSize.value);

    const visibleTopLevelUnits = computed(() =>
        topLevelUnits.value.slice(0, visibleUnitLimit.value)
    );

    const visibleCollapsibleGroups = computed(() =>
        visibleTopLevelUnits.value
            .filter((unit) => unit.type === 'group')
            .map((unit) => unit.group)
    );

    const draggableGroups = computed({
        get: () => collapsibleGroups.value,
        set: (nextGroups) => {
            emit('reorder', [
                ...nextGroups.flatMap((g) => g.items),
                ...ungroupedAllSubscriptions.value,
            ]);
        },
    });

    const draggableUngroupedSubscriptions = computed({
        get: () => ungroupedAllSubscriptions.value,
        set: (nextUngrouped) => {
            emit('reorder', [
                ...collapsibleGroups.value.flatMap((g) => g.items),
                ...nextUngrouped,
            ]);
        },
    });

    const reorderGroupItems = (groupKey, nextItems) => {
        const nextGroups = collapsibleGroups.value.map((g) =>
            g.key === groupKey ? { ...g, items: nextItems } : g
        );
        emit('reorder', [
            ...nextGroups.flatMap((g) => g.items),
            ...ungroupedAllSubscriptions.value,
        ]);
    };

    /** 当前已加载批次中的未分组单条目订阅。 */
    const ungroupedSubscriptions = computed(() =>
        visibleTopLevelUnits.value
            .filter((unit) => unit.type === 'single')
            .map((unit) => unit.subscription)
    );

    const remainingUnitCount = computed(() =>
        Math.max(0, topLevelUnits.value.length - visibleTopLevelUnits.value.length)
    );
    const hasMoreUnits = computed(() => remainingUnitCount.value > 0);

    const loadMoreUnits = () => {
        if (!hasMoreUnits.value) return;
        visibleUnitLimit.value += normalizedBatchSize.value;
    };

    watch([() => props.searchQuery, () => props.statusFilter, normalizedBatchSize], () => {
        visibleUnitLimit.value = normalizedBatchSize.value;
    });

    const loadMoreSentinelRef = ref(null);
    let loadMoreObserver = null;

    const disconnectLoadMoreObserver = () => {
        if (loadMoreObserver) {
            loadMoreObserver.disconnect();
            loadMoreObserver = null;
        }
    };

    const setupLoadMoreObserver = () => {
        disconnectLoadMoreObserver();
        if (typeof IntersectionObserver === 'undefined' || !loadMoreSentinelRef.value) return;

        loadMoreObserver = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMoreUnits();
                }
            },
            { rootMargin: '200px 0px' }
        );
        loadMoreObserver.observe(loadMoreSentinelRef.value);
    };

    watch(
        [loadMoreSentinelRef, hasMoreUnits, () => props.isSorting],
        async () => {
            await nextTick();
            if (!props.isSorting && hasMoreUnits.value && loadMoreSentinelRef.value) {
                setupLoadMoreObserver();
            } else {
                disconnectLoadMoreObserver();
            }
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        disconnectLoadMoreObserver();
    });

    const toggleGroup = (key) => {
        const next = new Set(collapsedGroups.value);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        collapsedGroups.value = next;
    };

    const isGroupCollapsed = (key) => collapsedGroups.value.has(key);

    // 仅对新出现的分组应用默认折叠；过滤/分页更新时保留用户手动展开状态。
    // 已消失分组的状态保留在本组件生命周期内，避免搜索/分页切换后忘记用户选择。
    watch(
        collapsibleGroups,
        (groups) => {
            const next = new Set(collapsedGroups.value);
            groups.forEach((group) => {
                if (!knownGroupKeys.value.has(group.key)) next.add(group.key);
            });
            groups.forEach((group) => knownGroupKeys.value.add(group.key));
            collapsedGroups.value = next;
        },
        { immediate: true }
    );

    const isGrouped = computed(() => collapsibleGroups.value.length > 0);

    const areAllGroupsCollapsed = computed(
        () =>
            collapsibleGroups.value.length > 0 &&
            collapsibleGroups.value.every((g) => collapsedGroups.value.has(g.key))
    );

    const toggleAllGroups = () => {
        if (areAllGroupsCollapsed.value) {
            collapsedGroups.value = new Set();
        } else {
            collapsedGroups.value = new Set(collapsibleGroups.value.map((g) => g.key));
        }
    };
</script>

<template>
    <div>
        <div
            class="mb-4 rounded-md border border-zinc-800 bg-[#171717] p-4 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
            :class="{ 'flex flex-col justify-between md:min-h-[132px]': searchable }"
        >
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                    <div class="flex items-center gap-3 shrink-0">
                        <h2 class="text-lg font-semibold text-zinc-100">
                            {{ t('subscriptions.title') }}
                        </h2>
                        <span
                            class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-zinc-300"
                            >{{ visibleCount }}/{{ subscriptions.length }}</span
                        >
                    </div>
                    <p class="mt-1 text-xs text-zinc-400">
                        {{ t('subscriptions.subtitle') }}
                    </p>
                    <p
                        v-if="isRefreshing || refreshError || refreshTime"
                        data-testid="subscriptions-refresh-status"
                        aria-live="polite"
                        class="mt-1 text-xs font-mono text-zinc-500"
                    >
                        <span v-if="isRefreshing">{{ t('subscriptions.refreshing') }}</span>
                        <span v-else-if="refreshError">{{
                            t('subscriptions.refreshFailedShort')
                        }}</span>
                        <span v-else-if="refreshTime">{{
                            t('subscriptions.lastRefreshed', { time: refreshTime })
                        }}</span>
                    </p>
                </div>
                <div
                    class="flex flex-wrap items-center gap-2 sm:w-auto justify-end sm:justify-start"
                >
                    <button
                        @click="handleImport"
                        class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('actions.bulkImport') }}
                    </button>
                    <button
                        v-if="isGrouped && !isSorting"
                        type="button"
                        data-testid="toggle-all-groups"
                        @click="toggleAllGroups"
                        class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{
                            areAllGroupsCollapsed
                                ? t('subscriptions.expandAll')
                                : t('subscriptions.collapseAll')
                        }}
                    </button>
                    <button
                        @click="handleAdd"
                        class="shrink-0 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
                    >
                        {{ t('actions.add') }}
                    </button>
                    <MoreActionsMenu menu-width-class="w-36">
                        <template #menu="{ close }">
                            <button
                                @click="
                                    handleRefreshAll();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ t('actions.refreshAll') }}
                            </button>
                            <button
                                @click="
                                    handleToggleSort();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                            </button>
                            <button
                                v-if="subscriptions.length > 1"
                                type="button"
                                data-testid="create-airport-group"
                                @click="
                                    openAirportIdentityEditor();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ t('subscriptions.createAirportGroup') }}
                            </button>
                            <button
                                v-if="hasExplicitAirportIdentity"
                                data-testid="reset-all-airport-groups"
                                @click="
                                    handleResetAllGroups();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ t('subscriptions.automaticAirportIdentity') }}
                            </button>
                            <div class="my-1 border-t border-zinc-200 dark:border-white/10"></div>
                            <button
                                @click="
                                    handleDeleteAll();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                            >
                                {{ t('actions.clearAll') }}
                            </button>
                        </template>
                    </MoreActionsMenu>
                </div>
            </div>
            <div v-if="searchable" class="relative mt-4">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden="true"
                />
                <input
                    v-model="searchModel"
                    data-testid="subscription-search"
                    type="text"
                    :placeholder="t('subscriptions.listSearchPlaceholder')"
                    :aria-label="t('subscriptions.searchPlaceholder')"
                    :disabled="isSorting"
                    class="w-full rounded-md border border-zinc-800 bg-transparent py-2 pl-9 pr-24 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-zinc-500"
                />
                <div
                    v-if="searchQuery"
                    class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5"
                >
                    <span class="pointer-events-none text-xs font-mono text-zinc-400">
                        {{ visibleCount }}/{{ subscriptions.length }}
                    </span>
                    <button
                        type="button"
                        class="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                        :aria-label="t('actions.clearSearch')"
                        @click="searchModel = ''"
                    >
                        <X class="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div
                v-if="statusFilter"
                data-testid="subscription-status-filter"
                class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-xs text-zinc-200"
            >
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>{{ statusFilterLabel }}</span>
                <span class="font-mono text-zinc-400">{{ visibleCount }}/{{ subscriptions.length }}</span>
                <button
                    type="button"
                    data-testid="subscription-status-filter-clear"
                    class="ml-auto font-semibold text-zinc-200 hover:text-white underline underline-offset-2"
                    @click="emit('clearStatusFilter')"
                >
                    {{ t('subscriptions.clearStatusFilter') }}
                </button>
            </div>
        </div>
        <div v-if="subscriptions.length > 0 && isSorting">
            <SortingBanner
                :hint="t('subscriptions.sortingHint')"
                banner-test-id="subscription-sorting-banner"
                button-test-id="subscription-finish-sort"
                @finish="handleToggleSort"
            />
            <div v-if="isGrouped" class="space-y-4">
                <draggable
                    tag="div"
                    class="space-y-4"
                    v-model="draggableGroups"
                    item-key="key"
                    handle=".group-drag-handle"
                    animation="300"
                    ghost-class="opacity-50"
                    @end="handleDragEnd"
                >
                    <template #item="{ element: group }">
                        <div
                            data-testid="sortable-subscription-group"
                            class="rounded-md border border-dashed border-sky-500/40 bg-[#171717]"
                        >
                            <div class="flex w-full items-center justify-between gap-3 px-4 py-3">
                                <div class="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                        class="group-drag-handle cursor-move rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                    >
                                        <GripVertical class="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <button
                                        type="button"
                                        :aria-expanded="String(!isGroupCollapsed(group.key))"
                                        class="flex min-w-0 flex-1 items-center gap-2 text-left"
                                        @click="toggleGroup(group.key)"
                                    >
                                        <ChevronDown
                                            class="h-4 w-4 shrink-0 text-zinc-400 transition-transform"
                                            :class="isGroupCollapsed(group.key) ? '-rotate-90' : ''"
                                            aria-hidden="true"
                                        />
                                        <span
                                            class="truncate text-sm font-semibold text-zinc-100"
                                            >{{ groupDisplayName(group) }}</span
                                        >
                                        <span
                                            class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono text-zinc-300"
                                            >{{ group.items.length }}</span
                                        >
                                    </button>
                                </div>
                            </div>
                            <div
                                v-show="!isGroupCollapsed(group.key)"
                                class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-800 p-4"
                            >
                                <draggable
                                    tag="div"
                                    class="contents"
                                    :model-value="group.items"
                                    @update:model-value="
                                        (items) => reorderGroupItems(group.key, items)
                                    "
                                    item-key="id"
                                    animation="300"
                                    ghost-class="opacity-50"
                                    @end="handleDragEnd"
                                >
                                    <template #item="{ element: subscription }">
                                        <div
                                            class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5"
                                        >
                                            <Card
                                                class="pointer-events-none select-none"
                                                :misub="subscription"
                                                @delete="handleDelete(subscription.id)"
                                                @change="handleSortEnd"
                                                @update="handleUpdate(subscription.id)"
                                                @edit="handleEdit(subscription.id)"
                                                @preview="handlePreview(subscription.id)"
                                                @qrcode="handleQRCode(subscription.id)"
                                                @applyDetectedName="
                                                    (name) =>
                                                        handleApplyDetectedName(subscription, name)
                                                "
                                            />
                                        </div>
                                    </template>
                                </draggable>
                            </div>
                        </div>
                    </template>
                </draggable>
                <div
                    v-if="draggableUngroupedSubscriptions.length > 0"
                    class="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    <draggable
                        tag="div"
                        class="contents"
                        v-model="draggableUngroupedSubscriptions"
                        item-key="id"
                        animation="300"
                        ghost-class="opacity-50"
                        @end="handleDragEnd"
                    >
                        <template #item="{ element: subscription }">
                            <div
                                class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5"
                            >
                                <Card
                                    class="pointer-events-none select-none"
                                    :misub="subscription"
                                    @delete="handleDelete(subscription.id)"
                                    @change="handleSortEnd"
                                    @update="handleUpdate(subscription.id)"
                                    @edit="handleEdit(subscription.id)"
                                    @preview="handlePreview(subscription.id)"
                                    @qrcode="handleQRCode(subscription.id)"
                                    @applyDetectedName="
                                        (name) => handleApplyDetectedName(subscription, name)
                                    "
                                />
                            </div>
                        </template>
                    </draggable>
                </div>
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <draggable
                    tag="div"
                    class="contents"
                    v-model="draggableSubscriptions"
                    item-key="id"
                    animation="300"
                    ghost-class="opacity-50"
                    @end="handleDragEnd"
                >
                    <template #item="{ element: subscription }">
                        <div
                            class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5"
                        >
                            <Card
                                class="pointer-events-none select-none"
                                :misub="subscription"
                                @delete="handleDelete(subscription.id)"
                                @change="handleSortEnd"
                                @update="handleUpdate(subscription.id)"
                                @edit="handleEdit(subscription.id)"
                                @preview="handlePreview(subscription.id)"
                                @qrcode="handleQRCode(subscription.id)"
                                @applyDetectedName="
                                    (name) => handleApplyDetectedName(subscription, name)
                                "
                            />
                        </div>
                    </template>
                </draggable>
            </div>
        </div>
        <div v-else-if="matchedSubscriptions.length > 0" class="space-y-4">
            <!-- 按站点分组：同站点的多个订阅源折叠为一组 -->
            <template v-if="isGrouped">
                <template v-for="group in visibleCollapsibleGroups" :key="group.key">
                    <div
                        class="rounded-md border border-zinc-800 bg-[#171717] shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
                    >
                        <div class="flex w-full items-center justify-between gap-3 px-4 py-3">
                            <button
                                type="button"
                                :aria-expanded="String(!isGroupCollapsed(group.key))"
                                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                                @click="toggleGroup(group.key)"
                            >
                                <ChevronDown
                                    class="h-4 w-4 shrink-0 text-zinc-400 transition-transform"
                                    :class="isGroupCollapsed(group.key) ? '-rotate-90' : ''"
                                    aria-hidden="true"
                                />
                                <span
                                    class="truncate text-sm font-semibold text-zinc-100"
                                    >{{ groupDisplayName(group) }}</span
                                >
                                <span
                                    class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono text-zinc-300"
                                    >{{ group.items.length }}</span
                                >
                            </button>
                            <div class="flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    data-testid="edit-airport-group"
                                    class="rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                    @click.stop="openAirportIdentityEditor(group)"
                                >
                                    {{ t('subscriptions.editAirportGroup') }}
                                </button>
                                <button
                                    v-if="group.items.some((item) => item.airportIdentity?.groupId)"
                                    type="button"
                                    class="rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                    @click.stop="handleResetGroup(group)"
                                >
                                    {{ t('subscriptions.automaticAirportIdentity') }}
                                </button>
                                <button
                                    v-else-if="group.items.length > 1"
                                    type="button"
                                    class="rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                                    @click.stop="handleSplitAirportGroup(group)"
                                >
                                    {{ t('subscriptions.splitAirportGroup') }}
                                </button>
                            </div>
                        </div>
                        <div
                            v-show="!isGroupCollapsed(group.key)"
                            class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-800 p-4"
                        >
                            <div
                                v-for="(subscription, index) in group.items"
                                :key="subscription.id"
                                class="list-item-animation"
                                :style="{ '--delay-index': index }"
                            >
                                <Card
                                    :misub="subscription"
                                    @delete="handleDelete(subscription.id)"
                                    @change="handleSortEnd"
                                    @update="handleUpdate(subscription.id)"
                                    @edit="handleEdit(subscription.id)"
                                    @preview="handlePreview(subscription.id)"
                                    @qrcode="handleQRCode(subscription.id)"
                                    @applyDetectedName="
                                        (name) => handleApplyDetectedName(subscription, name)
                                    "
                                />
                            </div>
                        </div>
                    </div>
                </template>
                <div
                    v-if="ungroupedSubscriptions.length > 0"
                    class="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    <div
                        v-for="(subscription, index) in ungroupedSubscriptions"
                        :key="subscription.id"
                        class="list-item-animation"
                        :style="{ '--delay-index': index }"
                    >
                        <Card
                            :misub="subscription"
                            @delete="handleDelete(subscription.id)"
                            @change="handleSortEnd"
                            @update="handleUpdate(subscription.id)"
                            @edit="handleEdit(subscription.id)"
                            @preview="handlePreview(subscription.id)"
                            @qrcode="handleQRCode(subscription.id)"
                            @applyDetectedName="
                                (name) => handleApplyDetectedName(subscription, name)
                            "
                        />
                    </div>
                </div>
            </template>
            <div
                v-else
                class="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
                <div
                    v-for="(subscription, index) in ungroupedSubscriptions"
                    :key="subscription.id"
                    class="list-item-animation"
                    :style="{ '--delay-index': index }"
                >
                    <Card
                        :misub="subscription"
                        @delete="handleDelete(subscription.id)"
                        @change="handleSortEnd"
                        @update="handleUpdate(subscription.id)"
                        @edit="handleEdit(subscription.id)"
                        @preview="handlePreview(subscription.id)"
                        @qrcode="handleQRCode(subscription.id)"
                        @applyDetectedName="(name) => handleApplyDetectedName(subscription, name)"
                    />
                </div>
            </div>
        </div>
        <div
            v-else-if="searchable && searchQuery && visibleCount === 0"
            data-testid="subscription-no-search-results"
            class="rounded-md border border-zinc-800 bg-[#171717] px-6 py-12 text-center"
        >
            <p class="text-sm font-medium text-zinc-200">
                {{ t('subscriptions.noSearchResults') }}
            </p>
            <button
                data-testid="clear-subscription-search"
                type="button"
                class="mt-3 inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer"
                @click="searchModel = ''"
            >
                {{ t('actions.clearSearch') }}
            </button>
        </div>
        <div
            v-else-if="subscriptions.length === 0"
            class="rounded-md border border-zinc-800 bg-[#171717] py-2"
        >
            <EmptyState
                :title="t('subscriptions.empty')"
                :description="t('subscriptions.emptyDesc')"
                icon="folder"
                :total-count="0"
            />
        </div>
        <div
            v-if="!isSorting && hasMoreUnits"
            ref="loadMoreSentinelRef"
            data-testid="subscription-load-more-sentinel"
            class="mt-4 flex justify-center"
        >
            <button
                type="button"
                data-testid="subscription-load-more-btn"
                class="rounded-md border border-zinc-800 bg-[#171717] px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer"
                @click="loadMoreUnits"
            >
                {{ t('subscriptions.loadMoreRemaining', { count: remainingUnitCount }) }}
            </button>
        </div>
        <Modal
            :show="showAirportIdentityEditor"
            size="md"
            :confirm-text="t('subscriptions.saveGroup')"
            :confirm-disabled="!groupNameInput.trim() || selectedSubscriptionIds.length === 0"
            @update:show="showAirportIdentityEditor = $event"
            @confirm="saveAirportIdentity"
        >
            <template #title>
                <h3 class="text-base font-semibold text-zinc-100">
                    {{
                        isCreatingNewGroup
                            ? t('subscriptions.createAirportGroup')
                            : t('subscriptions.editAirportGroup')
                    }}
                </h3>
            </template>
            <template #body>
                <div class="space-y-4">
                    <div>
                        <label class="mb-1.5 block text-xs font-medium text-zinc-300">
                            {{ t('subscriptions.airportGroupName') }}
                        </label>
                        <input
                            v-model="groupNameInput"
                            data-testid="airport-group-name-input"
                            class="w-full rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-500"
                            :placeholder="t('subscriptions.newAirportGroupName')"
                        />
                    </div>
                    <div>
                        <label class="mb-1.5 block text-xs font-medium text-zinc-300">
                            {{ t('subscriptions.airportGroupMembers') }}
                        </label>
                        <div
                            class="max-h-60 space-y-1.5 overflow-y-auto rounded-md border border-zinc-800 p-2"
                        >
                            <label
                                v-for="sub in subscriptions"
                                :key="sub.id"
                                class="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-xs transition-colors hover:bg-zinc-900"
                            >
                                <span class="flex min-w-0 items-center gap-2">
                                    <input
                                        type="checkbox"
                                        :checked="selectedSubscriptionIds.includes(sub.id)"
                                        class="h-3.5 w-3.5 rounded border-zinc-700 bg-transparent text-zinc-100"
                                        @change="toggleSubscriptionSelection(sub.id)"
                                    />
                                    <span class="truncate font-medium text-zinc-200">{{
                                        sub.name || t('subscriptions.unnamed')
                                    }}</span>
                                </span>
                                <span class="shrink-0 truncate max-w-[160px] text-[11px] text-zinc-500">
                                    {{ extractHost(sub.url) }}
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            </template>
        </Modal>
    </div>
</template>

<style scoped>
    .cursor-move {
        cursor: move;
    }
</style>
