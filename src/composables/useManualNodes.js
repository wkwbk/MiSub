import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSettingsStore } from '@/stores/settings.js';
import { useToastStore } from '@/stores/toast.js';
import { cleanNodeUrl, extractHostAndPort, extractNodeName } from '@/lib/utils.js';
import { pingNode } from '@/utils/ping.js';
import { isUdpOnlyProtocol, tcpingNodes } from '@/utils/tcping.js';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import { filterManualNodes, isManualNodeEntry } from '@/composables/manual-nodes/filters.js';
import { useListPagination } from '@/composables/useListPagination.js';
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

  const manualNodes = computed(() => {
    return (allSubscriptions.value || []).filter(isManualNodeEntry);
  });

  const searchTerm = ref('');
  const activeTagFilters = ref([]);
  const attrFilters = ref({ protocol: '', country: '', network: '' });

  // --- 节点网络信息探测（IP解析 / 国家标签 / CDN与直连识别，本机 localStorage 24h 缓存） ---
  const INSPECT_CACHE_KEY = 'misub_node_inspect_cache_v1';
  const INSPECT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const PING_MODE_PREF_KEY = 'misub_manual_nodes_ping_mode';

  const nodeInspectMap = ref({});
  const isInspectingNodes = ref(false);
  const pingMode = ref(readRawPreference(PING_MODE_PREF_KEY) === 'tcping' ? 'tcping' : 'local');

  function toggleProtocolFilter(protocol) {
    const normalized = String(protocol || '')
      .trim()
      .toLowerCase();
    attrFilters.value = {
      ...attrFilters.value,
      protocol: attrFilters.value.protocol === normalized ? '' : normalized,
    };
  }

  function toggleCountryFilter(countryCode) {
    const normalized = String(countryCode || '')
      .trim()
      .toUpperCase();
    attrFilters.value = {
      ...attrFilters.value,
      country: attrFilters.value.country === normalized ? '' : normalized,
    };
  }

  function toggleNetworkFilter(networkType) {
    const normalized = String(networkType || '')
      .trim()
      .toLowerCase();
    attrFilters.value = {
      ...attrFilters.value,
      network: attrFilters.value.network === normalized ? '' : normalized,
    };
  }

  function clearAttrFilters() {
    attrFilters.value = { protocol: '', country: '', network: '' };
  }

  const filteredManualNodes = computed(() => {
    return filterManualNodes(
      manualNodes.value,
      searchTerm.value,
      activeTagFilters.value,
      attrFilters.value,
      nodeInspectMap.value,
    );
  });

  const {
    currentPage: manualNodesCurrentPage,
    itemsPerPage: manualNodesPerPage,
    totalPages: manualNodesTotalPages,
    paginatedItems: paginatedManualNodes,
    changePage: changeManualNodesPage,
  } = useListPagination(filteredManualNodes, {
    storageKey: 'manualNodesPPS',
    resetDeps: [searchTerm, activeTagFilters, attrFilters],
  });

  const enabledManualNodes = computed(() => manualNodes.value.filter((n) => n.enabled));

  function setTagFilters(filters) {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  function toggleTagFilter(tag) {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
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
        const { nextTags, changed } = computeBatchUpdatedTags(getItemTags(n), inputTags, mode);
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
      node.tags,
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
      updatedNode.tags,
    );
    dataStore.updateSubscription(normalizedNode.id, normalizedNode);
    markDirty();
  }

  function deleteNode(nodeId) {
    dataStore.removeSubscription(nodeId);
    dataStore.removeManualNodeFromProfiles(nodeId);
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
        extraTags.length > 0 ? normalizeTagList([...extraTags, ...getItemTags(node)]) : getItemTags(node);
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
    showToast(t('manualNodes.removedDuplicates', { count: plan.removeNodes.length }), 'success');
    markDirty();
    manualNodesCurrentPage.value = 1;
  }

  function autoSortNodes() {
    const mergedList = buildAutoSortedSubscriptions(allSubscriptions.value || [], manualNodes.value);
    dataStore.overwriteSubscriptions(mergedList);
    manualNodesCurrentPage.value = 1;
    markDirty();
  }

  function sortNodesByLatency() {
    const results = pingResults.value || {};
    const hasAnyLatency = Object.values(results).some(
      (item) => item && item.status === 'ok' && Number.isFinite(item.latency),
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

    const otherItems = (allSubscriptions.value || []).filter((item) => !nodes.some((n) => n.id === item.id));
    dataStore.overwriteSubscriptions([...nodes, ...otherItems]);

    manualNodesCurrentPage.value = 1;
    markDirty();
    return true;
  }

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
      (item) => item.url && /^https?:\/\//.test(item.url),
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
        normalizedNewName,
      );
      if (itemChanged) {
        dataStore.updateSubscription(node.id, applyItemTags(node, nextTags));
        changed = true;
      }
    });

    const customOrder = getStoredTagOrder();
    if (customOrder.includes(normalizedOldName)) {
      const nextOrder = normalizeTagList(
        customOrder.map((tag) => (tag === normalizedOldName ? normalizedNewName : tag)),
      );
      settingsStore.updateConfig({
        manualNodeTagOrder: nextOrder,
      });
    }

    if (activeTagFilters.value.includes(normalizedOldName)) {
      activeTagFilters.value = normalizeTagList(
        activeTagFilters.value.map((tag) => (tag === normalizedOldName ? normalizedNewName : tag)),
      );
    }

    if (changed) markDirty();
  }

  function deleteTag(tagName) {
    const normalizedTagName = normalizeTagName(tagName);
    if (!normalizedTagName) return;

    let changed = false;
    manualNodes.value.forEach((node) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(node), normalizedTagName);
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
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalizedTagName);
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

  function setPingMode(mode) {
    const next = mode === 'tcping' ? 'tcping' : 'local';
    pingMode.value = next;
    writeRawPreference(PING_MODE_PREF_KEY, next);
  }

  function readInspectLocalCache() {
    try {
      const raw = readRawPreference(INSPECT_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const now = Date.now();
      const valid = {};
      for (const [url, entry] of Object.entries(parsed)) {
        if (entry && entry.data && (!entry.expiresAt || entry.expiresAt > now)) {
          valid[url] = entry;
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  function writeInspectLocalCache(cacheObj) {
    try {
      writeRawPreference(INSPECT_CACHE_KEY, JSON.stringify(cacheObj));
    } catch {
    }
  }

  function hydrateInspectCache(targetNodes = manualNodes.value) {
    const list = (Array.isArray(targetNodes) ? targetNodes : []).filter((n) => n && n.id && n.url);
    if (list.length === 0) return;
    const localCache = readInspectLocalCache();
    let changed = false;
    const nextMap = { ...nodeInspectMap.value };
    for (const node of list) {
      if (nextMap[node.id]?.__url === node.url) continue;
      const cached = localCache[node.url];
      if (cached?.data) {
        nextMap[node.id] = { ...cached.data, id: node.id, __url: node.url };
        changed = true;
      }
    }
    if (changed) {
      nodeInspectMap.value = nextMap;
    }
  }

  // 初始化时立即从本机 localStorage 缓存恢复，首屏 0ms 可直接展示与筛选
  hydrateInspectCache(manualNodes.value);

  async function inspectNodes(targetNodes = manualNodes.value, { force = false, silent = false } = {}) {
    const list = (Array.isArray(targetNodes) ? targetNodes : []).filter((n) => n && n.id && n.url);
    if (list.length === 0) return;

    const localCache = force ? {} : readInspectLocalCache();
    const nextMap = { ...nodeInspectMap.value };
    const toQuery = [];

    for (const node of list) {
      if (!force && nextMap[node.id] && nextMap[node.id].__url === node.url) {
        continue;
      }
      const cached = !force ? localCache[node.url] : null;
      if (cached?.data) {
        nextMap[node.id] = { ...cached.data, id: node.id, __url: node.url };
      } else {
        toQuery.push({ id: node.id, url: node.url });
      }
    }

    nodeInspectMap.value = nextMap;

    if (toQuery.length === 0) {
      if (!silent) {
        showToast(t('manualNodes.inspectCompleted', { count: list.length }), 'success');
      }
      return;
    }

    if (isInspectingNodes.value) return;
    isInspectingNodes.value = true;

    try {
      const CHUNK_SIZE = 100;
      const updatedMap = { ...nodeInspectMap.value };
      const cacheToSave = readInspectLocalCache();
      const expiresAt = Date.now() + INSPECT_CACHE_TTL_MS;

      for (let i = 0; i < toQuery.length; i += CHUNK_SIZE) {
        const chunk = toQuery.slice(i, i + CHUNK_SIZE);
        const resp = await api.post(API_ENDPOINTS.NODES_INSPECT, {
          nodes: chunk,
          forceRefresh: force,
        });
        const chunkResults = resp?.results || {};
        for (const item of chunk) {
          const info = chunkResults[item.id];
          if (info) {
            updatedMap[item.id] = { ...info, __url: item.url };
            cacheToSave[item.url] = { data: info, expiresAt };
          }
        }
      }

      nodeInspectMap.value = updatedMap;
      writeInspectLocalCache(cacheToSave);

      if (!silent) {
        showToast(t('manualNodes.inspectCompleted', { count: toQuery.length }), 'success');
      }
    } catch (error) {
      if (!silent) {
        showToast(error?.message || t('manualNodes.inspectFailed'), 'error');
      }
    } finally {
      isInspectingNodes.value = false;
    }
  }

  // --- 连通性测试 (Ping / TCPing) ---
  const pingResults = ref({});
  const pingingNodes = ref(new Set());
  const isPingingAll = ref(false);

  async function pingNodeId(nodeId) {
    if (pingingNodes.value.has(nodeId)) return;
    const node = manualNodes.value.find((n) => n.id === nodeId);
    if (!node) return;

    const { host, port } = extractHostAndPort(node.url);
    if (!host || !port) {
      pingResults.value = {
        ...pingResults.value,
        [nodeId]: {
          status: 'error',
          latency: -1,
          mode: pingMode.value,
          message: t('manualNodes.parseAddressFailed'),
        },
      };
      return;
    }

    if (typeof isUdpOnlyProtocol === 'function' && isUdpOnlyProtocol(node.url)) {
      pingResults.value = {
        ...pingResults.value,
        [nodeId]: {
          status: 'unsupported',
          latency: -1,
          mode: pingMode.value,
          message: t('manualNodes.udpPingUnsupported'),
        },
      };
      return;
    }

    pingingNodes.value.add(nodeId);
    pingResults.value = { ...pingResults.value, [nodeId]: { status: 'loading', latency: 0, mode: pingMode.value } };

    try {
      if (pingMode.value === 'tcping') {
        const inspectHost = nodeInspectMap.value[nodeId]?.ip || host;
        const { results, unsupported } = await tcpingNodes([{ id: nodeId, host: inspectHost, port }], 3000);
        if (unsupported) {
          // 自动回退到本地 Ping
          const fallback = await pingNode(host, port, 3000, { url: node.url });
          pingResults.value = { ...pingResults.value, [nodeId]: fallback };
        } else {
          pingResults.value = {
            ...pingResults.value,
            [nodeId]: results[nodeId] || { status: 'error', latency: -1, mode: 'tcping' },
          };
        }
      } else {
        const result = await pingNode(host, port, 3000, { url: node.url });
        pingResults.value = { ...pingResults.value, [nodeId]: result };
      }
    } catch {
      pingResults.value = {
        ...pingResults.value,
        [nodeId]: { status: 'error', latency: -1, mode: pingMode.value },
      };
    } finally {
      pingingNodes.value.delete(nodeId);
    }
  }

  async function pingAllNodes(targetIds = null) {
    if (isPingingAll.value) return;
    const nodesToTest = Array.isArray(targetIds)
      ? targetIds.filter((id) => manualNodes.value.some((n) => n.id === id))
      : enabledManualNodes.value.map((n) => n.id);
    if (nodesToTest.length === 0) return;

    isPingingAll.value = true;
    showToast(t('manualNodes.pingStarted', { count: nodesToTest.length }), 'info');

    try {
      if (pingMode.value === 'tcping') {
        const batchTargets = [];
        const loadingUpdates = {};
        for (const nodeId of nodesToTest) {
          const node = manualNodes.value.find((n) => n.id === nodeId);
          if (!node) continue;
          const { host, port } = extractHostAndPort(node.url);
          if (!host || !port) {
            loadingUpdates[nodeId] = {
              status: 'error',
              latency: -1,
              mode: 'tcping',
              message: t('manualNodes.parseAddressFailed'),
            };
          } else if (typeof isUdpOnlyProtocol === 'function' && isUdpOnlyProtocol(node.url)) {
            loadingUpdates[nodeId] = {
              status: 'unsupported',
              latency: -1,
              mode: 'tcping',
              message: t('manualNodes.udpPingUnsupported'),
            };
          } else {
            pingingNodes.value.add(nodeId);
            loadingUpdates[nodeId] = { status: 'loading', latency: 0, mode: 'tcping' };
            batchTargets.push({ id: nodeId, host: nodeInspectMap.value[nodeId]?.ip || host, port });
          }
        }
        pingResults.value = { ...pingResults.value, ...loadingUpdates };

        let fallbackToLocal = false;
        const CHUNK_SIZE = 20;
        for (let i = 0; i < batchTargets.length; i += CHUNK_SIZE) {
          const chunk = batchTargets.slice(i, i + CHUNK_SIZE);
          try {
            const { results, unsupported } = await tcpingNodes(chunk, 3000);
            if (unsupported) {
              fallbackToLocal = true;
              chunk.forEach((item) => pingingNodes.value.delete(item.id));
              break;
            }
            const nextResults = { ...pingResults.value };
            for (const item of chunk) {
              nextResults[item.id] = results[item.id] || { status: 'error', latency: -1, mode: 'tcping' };
              pingingNodes.value.delete(item.id);
            }
            pingResults.value = nextResults;
          } catch {
            const nextResults = { ...pingResults.value };
            for (const item of chunk) {
              nextResults[item.id] = { status: 'error', latency: -1, mode: 'tcping' };
              pingingNodes.value.delete(item.id);
            }
            pingResults.value = nextResults;
          }
        }

        if (fallbackToLocal) {
          batchTargets.forEach((item) => pingingNodes.value.delete(item.id));
          setPingMode('local');
          showToast(t('manualNodes.tcpingUnsupportedFallback'), 'warning');
          const CONCURRENCY = 10;
          let currentIndex = 0;
          const workers = Array(Math.min(CONCURRENCY, nodesToTest.length))
            .fill(null)
            .map(async () => {
              while (currentIndex < nodesToTest.length) {
                const idx = currentIndex++;
                await pingNodeId(nodesToTest[idx]);
              }
            });
          await Promise.allSettled(workers);
        }
      } else {
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
      }
      showToast(t('manualNodes.pingCompleted', { count: nodesToTest.length }), 'success');
    } finally {
      nodesToTest.forEach((id) => pingingNodes.value.delete(id));
      isPingingAll.value = false;
    }
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
    attrFilters,
    toggleProtocolFilter,
    toggleCountryFilter,
    toggleNetworkFilter,
    clearAttrFilters,
    changeManualNodesPage,
    addNode,
    updateNode,
    deleteNode,
    deleteAllNodes,
    addNodesFromBulk,
    autoSortNodes,
    sortNodesByLatency,
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
    nodeInspectMap,
    isInspectingNodes,
    pingMode,
    setPingMode,
    inspectNodes,
    pingResults,
    pingingNodes,
    isPingingAll,
    pingNodeId,
    pingAllNodes,
  };
}
