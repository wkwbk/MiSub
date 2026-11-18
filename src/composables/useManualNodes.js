// FILE: src/composables/useManualNodes.js
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSettingsStore } from '@/stores/settings.js';
import { useToastStore } from '@/stores/toast.js';
import { cleanNodeUrl, extractHostAndPort, extractNodeName } from '@/lib/utils.js';
import { pingNode } from '@/utils/ping.js';
import { filterManualNodes, isManualNodeEntry } from '@/composables/manual-nodes/filters.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import { buildDedupPlan as buildDedupPlanCore } from '@/composables/manual-nodes/dedup.js';
import { buildAutoSortedSubscriptions } from '@/composables/manual-nodes/sorting.js';
import {
    applyItemTags,
    collectTags,
    computeBatchUpdatedTags,
    getItemTags,
    normalizeActiveTagFilters,
    normalizeTagList,
    normalizeTagName,
    removeTagFromList,
    renameTagInList,
    toggleTagFilterValue,
} from '@/utils/tags.js';
import { t } from '@/i18n/index.js';

export function useManualNodes(markDirty) {
    const { showToast } = useToastStore();
    const dataStore = useDataStore();
    const settingsStore = useSettingsStore();
    const { subscriptions: allSubscriptions } = storeToRefs(dataStore);

    // Manual Nodes are items in subscriptions that are NOT http/https
    const manualNodes = computed(() => {
        return (allSubscriptions.value || []).filter(isManualNodeEntry);
    });

    const manualNodesCurrentPage = ref(1);
    const manualNodesPerPage = ref(parseInt(readRawPreference('manualNodesPPS'), 10) || 24);
    const searchTerm = ref('');

    watch(manualNodesPerPage, (newVal) => {
        writeRawPreference('manualNodesPPS', newVal);
        manualNodesCurrentPage.value = 1;
    });

    const activeTagFilters = ref([]);

    const filteredManualNodes = computed(() => {
        return filterManualNodes(manualNodes.value, searchTerm.value, activeTagFilters.value);
    });

    const manualNodesTotalPages = computed(() => {
        if (manualNodesPerPage.value === -1) return 1;
        return Math.ceil(filteredManualNodes.value.length / manualNodesPerPage.value);
    });

    const paginatedManualNodes = computed(() => {
        if (manualNodesPerPage.value === -1) return filteredManualNodes.value;
        const start = (manualNodesCurrentPage.value - 1) * manualNodesPerPage.value;
        const end = start + manualNodesPerPage.value;
        return filteredManualNodes.value.slice(start, end);
    });

    const enabledManualNodes = computed(() => manualNodes.value.filter((n) => n.enabled));

    function changeManualNodesPage(page) {
        let p = parseInt(page);
        if (isNaN(p)) p = 1;
        if (p < 1) p = 1;
        if (p > manualNodesTotalPages.value) p = manualNodesTotalPages.value;
        manualNodesCurrentPage.value = p;
    }

    function setTagFilters(filters) {
        activeTagFilters.value = normalizeActiveTagFilters(filters);
        manualNodesCurrentPage.value = 1;
    }

    function toggleTagFilter(tag) {
        activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
        manualNodesCurrentPage.value = 1;
    }

    function batchUpdateTags(nodeIds, payload) {
        if (!nodeIds || nodeIds.length === 0) return;

        let mode = 'replace';
        let inputTags = payload;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            mode = payload.mode || 'append';
            inputTags = payload.tags;
        }

        const idsSet = new Set(nodeIds);
        const updates = manualNodes.value
            .filter((n) => idsSet.has(n.id))
            .map((n) => {
                const { nextTags, changed } = computeBatchUpdatedTags(
                    getItemTags(n),
                    inputTags,
                    mode
                );
                if (!changed) return null;
                return { id: n.id, updates: applyItemTags(n, nextTags) };
            })
            .filter(Boolean);

        if (updates.length > 0) {
            updates.forEach(({ id, updates: nextNode }) => {
                dataStore.updateSubscription(id, nextNode);
            });
            markDirty();
            showToast(t('manualNodes.batchTagsUpdated', { count: updates.length }), 'success');
        }
    }

    function batchDeleteNodes(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) return;

        nodeIds.forEach((id) => {
            dataStore.removeSubscription(id);
        });
        dataStore.removeManualNodeFromProfiles(nodeIds);

        if (paginatedManualNodes.value.length === 0 && manualNodesCurrentPage.value > 1) {
            manualNodesCurrentPage.value--;
        }

        markDirty();
        showToast(t('manualNodes.deletedCount', { count: nodeIds.length }), 'success');
    }

    function addNode(node) {
        const cleanedUrl = cleanNodeUrl(node.url);
        const normalizedNode = applyItemTags(
            {
                ...node,
                url: cleanedUrl,
            },
            node.tags
        );
        if (!normalizedNode.name) {
            normalizedNode.name = extractNodeName(normalizedNode.url);
        }
        dataStore.addSubscription(normalizedNode);
        manualNodesCurrentPage.value = 1;
        markDirty();
    }

    function updateNode(updatedNode) {
        const normalizedNode = applyItemTags(
            {
                ...updatedNode,
                url: cleanNodeUrl(updatedNode.url),
            },
            updatedNode.tags
        );
        dataStore.updateSubscription(normalizedNode.id, normalizedNode);
        markDirty();
    }

    function deleteNode(nodeId) {
        dataStore.removeSubscription(nodeId);
        dataStore.removeManualNodeFromProfiles(nodeId);
        if (paginatedManualNodes.value.length === 0 && manualNodesCurrentPage.value > 1) {
            manualNodesCurrentPage.value--;
        }
        markDirty();
    }

    function deleteAllNodes() {
        const idsToRemove = manualNodes.value.map((n) => n.id);

        if (idsToRemove.length === 0) {
            showToast(t('manualNodes.noNodesToDelete'), 'info');
            return;
        }

        idsToRemove.forEach((id) => dataStore.removeSubscription(id));
        dataStore.removeManualNodeFromProfiles(idsToRemove);

        manualNodesCurrentPage.value = 1;
        markDirty();
        showToast(t('manualNodes.clearedCount', { count: idsToRemove.length }), 'success');
    }

    function addNodesFromBulk(nodes, tagsInput = []) {
        const extraTags = normalizeTagList(tagsInput);
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = { ...nodes[i] };
            node.url = cleanNodeUrl(node.url);
            const mergedTags =
                extraTags.length > 0
                    ? normalizeTagList([...extraTags, ...getItemTags(node)])
                    : getItemTags(node);
            dataStore.addSubscription(applyItemTags(node, mergedTags));
        }
        markDirty();
    }

    const buildDedupPlan = () => buildDedupPlanCore(manualNodes.value);

    function applyDedupPlan(plan) {
        if (!plan || !plan.removeNodes || plan.removeNodes.length === 0) {
            showToast(t('manualNodes.noDuplicates'), 'info');
            return;
        }

        plan.removeNodes.forEach((node) => dataStore.removeSubscription(node.id));
        showToast(
            t('manualNodes.removedDuplicates', { count: plan.removeNodes.length }),
            'success'
        );
        markDirty();
        manualNodesCurrentPage.value = 1;
    }

    function deduplicateNodes() {
        const plan = buildDedupPlan();
        applyDedupPlan(plan);
    }

    function autoSortNodes() {
        const mergedList = buildAutoSortedSubscriptions(
            allSubscriptions.value || [],
            manualNodes.value
        );
        dataStore.overwriteSubscriptions(mergedList);
        manualNodesCurrentPage.value = 1;
        markDirty();
    }

    function sortNodesByLatency() {
        const results = pingResults.value || {};
        const hasAnyLatency = Object.values(results).some(
            (item) => item && item.status === 'ok' && Number.isFinite(item.latency)
        );
        if (!hasAnyLatency) return false;

        const nodes = [...manualNodes.value];
        const latencyOf = (node) => {
            const r = results[node.id];
            return r && r.status === 'ok' && Number.isFinite(r.latency) ? r.latency : Infinity;
        };

        nodes.sort((a, b) => {
            const la = latencyOf(a);
            const lb = latencyOf(b);
            if (la !== lb) return la - lb;
            return (a.name || '').localeCompare(b.name || '', 'zh-CN');
        });

        const otherItems = (allSubscriptions.value || []).filter(
            (item) => !nodes.some((n) => n.id === item.id)
        );
        dataStore.overwriteSubscriptions([...nodes, ...otherItems]);

        manualNodesCurrentPage.value = 1;
        markDirty();
        return true;
    }

    watch(searchTerm, (newValue, oldValue) => {
        if (newValue !== oldValue) {
            manualNodesCurrentPage.value = 1;
        }
    });

    function reorderManualNodes(newOrder) {
        const currentManualNodes = manualNodes.value;
        const reorderedVisibleNodes = [...(newOrder || [])];
        const newOrderIds = new Set(reorderedVisibleNodes.map((node) => node.id));
        const orderedManualNodes =
            newOrderIds.size > 0 && newOrderIds.size < currentManualNodes.length
                ? currentManualNodes.map((node) => {
                      if (!newOrderIds.has(node.id)) return node;
                      return reorderedVisibleNodes.shift();
                  })
                : reorderedVisibleNodes;

        const currentSubscriptions = (allSubscriptions.value || []).filter(
            (item) => item.url && /^https?:\/\//.test(item.url)
        );

        const mergedList = [...orderedManualNodes, ...currentSubscriptions];
        dataStore.overwriteSubscriptions(mergedList);
        markDirty();
    }

    const getStoredTagOrder = () => {
        const tagOrder = settingsStore.config.manualNodeTagOrder;
        return Array.isArray(tagOrder) ? tagOrder : [];
    };

    const manualNodeTags = computed(() => {
        return collectTags(manualNodes.value, getStoredTagOrder());
    });

    function renameTag(oldName, newName) {
        const normalizedOldName = normalizeTagName(oldName);
        const normalizedNewName = normalizeTagName(newName);
        if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
            return;
        }

        let changed = false;
        manualNodes.value.forEach((node) => {
            const { nextTags, changed: itemChanged } = renameTagInList(
                getItemTags(node),
                normalizedOldName,
                normalizedNewName
            );
            if (itemChanged) {
                dataStore.updateSubscription(node.id, applyItemTags(node, nextTags));
                changed = true;
            }
        });

        const customOrder = getStoredTagOrder();
        if (customOrder.includes(normalizedOldName)) {
            const nextOrder = normalizeTagList(
                customOrder.map((tag) => (tag === normalizedOldName ? normalizedNewName : tag))
            );
            settingsStore.updateConfig({
                manualNodeTagOrder: nextOrder,
            });
        }

        if (activeTagFilters.value.includes(normalizedOldName)) {
            activeTagFilters.value = normalizeTagList(
                activeTagFilters.value.map((tag) =>
                    tag === normalizedOldName ? normalizedNewName : tag
                )
            );
        }

        if (changed) markDirty();
    }

    function deleteTag(tagName) {
        const normalizedTagName = normalizeTagName(tagName);
        if (!normalizedTagName) return;

        let changed = false;
        manualNodes.value.forEach((node) => {
            const { nextTags, changed: itemChanged } = removeTagFromList(
                getItemTags(node),
                normalizedTagName
            );
            if (itemChanged) {
                dataStore.updateSubscription(node.id, applyItemTags(node, nextTags));
                changed = true;
            }
        });

        const customOrder = getStoredTagOrder();
        const nextOrder = customOrder.filter((tag) => tag !== normalizedTagName);
        if (nextOrder.length !== customOrder.length) {
            settingsStore.updateConfig({
                manualNodeTagOrder: nextOrder,
            });
        }

        if (activeTagFilters.value.includes(normalizedTagName)) {
            activeTagFilters.value = activeTagFilters.value.filter(
                (tag) => tag !== normalizedTagName
            );
        }

        if (changed) markDirty();
    }

    function reorderTags(newOrder) {
        const normalizedOrder = normalizeTagList(newOrder);
        settingsStore.updateConfig({
            manualNodeTagOrder: normalizedOrder,
        });
        markDirty();
    }

    // --- 连通性测试 (Ping) ---
    const pingResults = ref({});
    const pingingNodes = ref(new Set());

    async function pingNodeId(nodeId) {
        if (pingingNodes.value.has(nodeId)) return;
        const node = manualNodes.value.find((n) => n.id === nodeId);
        if (!node) return;

        const { host, port } = extractHostAndPort(node.url);
        if (!host || !port) {
            pingResults.value[nodeId] = {
                status: 'error',
                latency: -1,
                message: t('manualNodes.parseAddressFailed'),
            };
            return;
        }

        pingingNodes.value.add(nodeId);
        pingResults.value = { ...pingResults.value, [nodeId]: { status: 'loading', latency: 0 } };

        try {
            const result = await pingNode(host, port, 3000);
            pingResults.value = { ...pingResults.value, [nodeId]: result };
        } catch {
            pingResults.value = {
                ...pingResults.value,
                [nodeId]: { status: 'error', latency: -1 },
            };
        } finally {
            pingingNodes.value.delete(nodeId);
        }
    }

    async function pingAllNodes() {
        const nodesToTest = enabledManualNodes.value.map((n) => n.id);
        if (nodesToTest.length === 0) return;

        showToast(t('manualNodes.pingStarted', { count: nodesToTest.length }), 'info');

        const CONCURRENCY = 10;
        let currentIndex = 0;

        const workers = Array(Math.min(CONCURRENCY, nodesToTest.length))
            .fill(null)
            .map(async () => {
                while (currentIndex < nodesToTest.length) {
                    const idx = currentIndex++;
                    const nodeId = nodesToTest[idx];
                    await pingNodeId(nodeId);
                }
            });

        await Promise.allSettled(workers);
        showToast(t('manualNodes.pingCompleted', { count: nodesToTest.length }), 'success');
    }

    return {
        manualNodes,
        manualNodeTags,
        manualNodesCurrentPage,
        manualNodesTotalPages,
        paginatedManualNodes,
        enabledManualNodesCount: computed(() => enabledManualNodes.value.length),
        searchTerm,
        activeTagFilters,
        changeManualNodesPage,
        addNode,
        updateNode,
        deleteNode,
        deleteAllNodes,
        addNodesFromBulk,
        autoSortNodes,
        sortNodesByLatency,
        deduplicateNodes,
        buildDedupPlan,
        applyDedupPlan,
        reorderManualNodes,
        renameTag,
        deleteTag,
        reorderTags,
        setTagFilters,
        toggleTagFilter,
        batchUpdateTags,
        batchDeleteNodes,
        manualNodesPerPage,
        pingResults,
        pingingNodes,
        pingNodeId,
        pingAllNodes,
    };
}
