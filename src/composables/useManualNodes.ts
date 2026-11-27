import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore, type MutationResult, type RecordPatchOptions } from '@/stores/useDataStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { cleanNodeUrl, extractHostAndPort, extractNodeName } from '@/lib/utils.js';
import { isUdpOnlyProtocol, pingNode, tcpingNodes, type TcpingEntry } from '@/utils/ping.js';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import {
  filterManualNodes,
  isManualNodeEntry,
  type NodeAttributeFilters,
  type NodeInspectInfo,
  type NodeInspectMap,
} from '@/composables/manual-nodes/filters.js';
import { useListPagination } from '@/composables/useListPagination.js';
import { buildDedupPlan as buildDedupPlanCore, type DedupPlan } from '@/composables/manual-nodes/dedup.js';
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

export type PingMode = 'local' | 'tcping';

export interface PingResult {
  status: 'ok' | 'timeout' | 'error' | 'unsupported' | 'loading';
  latency: number;
  mode: PingMode;
  message?: string;
}

export type TagBatchMode = 'append' | 'add' | 'replace' | 'remove' | 'clear';

export type TagBatchUpdatePayload =
  | string
  | string[]
  | {
      mode?: TagBatchMode;
      tags?: string | string[];
    };

interface InspectCacheEntry {
  data: NodeInspectInfo;
  expiresAt?: number;
}

function normalizeTcpingResult(entry: TcpingEntry | undefined): PingResult {
  if (!entry) {
    return { status: 'error', latency: -1, mode: 'tcping' };
  }
  const status: PingResult['status'] =
    entry.status === 'ok' ||
    entry.status === 'timeout' ||
    entry.status === 'error' ||
    entry.status === 'unsupported' ||
    entry.status === 'loading'
      ? entry.status
      : 'error';
  return {
    status,
    latency: typeof entry.latency === 'number' ? entry.latency : -1,
    mode: 'tcping',
    ...(typeof entry.message === 'string' ? { message: entry.message } : {}),
  };
}

export function useManualNodes() {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const settingsStore = useSettingsStore();
  const { subscriptions: allSubscriptions } = storeToRefs(dataStore);

  const manualNodes = computed<StoreMisubItem[]>(() => {
    return (allSubscriptions.value || []).filter(isManualNodeEntry);
  });

  const searchTerm = ref('');
  const activeTagFilters = ref<string[]>([]);
  const attrFilters = ref<Required<NodeAttributeFilters>>({ protocol: '', country: '', network: '' });

  // --- 节点网络信息探测（IP解析 / 国家标签 / CDN与直连识别，本机 localStorage 24h 缓存） ---
  const INSPECT_CACHE_KEY = 'misub_node_inspect_cache_v1';
  const INSPECT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const PING_MODE_PREF_KEY = 'misub_manual_nodes_ping_mode';

  const nodeInspectMap = ref<NodeInspectMap>({});
  const isInspectingNodes = ref(false);
  const pingMode = ref<PingMode>(readRawPreference(PING_MODE_PREF_KEY) === 'tcping' ? 'tcping' : 'local');

  function toggleProtocolFilter(protocol: string): void {
    const normalized = String(protocol || '')
      .trim()
      .toLowerCase();
    attrFilters.value = {
      ...attrFilters.value,
      protocol: attrFilters.value.protocol === normalized ? '' : normalized,
    };
  }

  function toggleCountryFilter(countryCode: string): void {
    const normalized = String(countryCode || '')
      .trim()
      .toUpperCase();
    attrFilters.value = {
      ...attrFilters.value,
      country: attrFilters.value.country === normalized ? '' : normalized,
    };
  }

  function toggleNetworkFilter(networkType: string): void {
    const normalized = String(networkType || '')
      .trim()
      .toLowerCase();
    attrFilters.value = {
      ...attrFilters.value,
      network: attrFilters.value.network === normalized ? '' : normalized,
    };
  }

  function clearAttrFilters(): void {
    attrFilters.value = { protocol: '', country: '', network: '' };
  }

  const filteredManualNodes = computed<StoreMisubItem[]>(() => {
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

  function setTagFilters(filters: unknown): void {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  function toggleTagFilter(tag: string | null | undefined): void {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
  }

  async function batchUpdateTags(
    nodeIds: string[],
    payload: TagBatchUpdatePayload,
  ): Promise<MutationResult<StoreMisubItem[]>> {
    if (!nodeIds || nodeIds.length === 0) {
      return { ok: true, data: [] };
    }

    let mode: TagBatchMode = 'replace';
    let inputTags: unknown = payload;
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
        return { id: n.id, tags: nextTags };
      })
      .filter((item): item is { id: string; tags: string[] } => item !== null);

    if (updates.length === 0) {
      return { ok: true, data: [] };
    }

    const res = await dataStore.batchUpdateNodeTagsRecord(updates);
    if (res.ok) {
      showToast(t('manualNodes.batchTagsUpdated', { count: updates.length }), 'success');
    }
    return res;
  }

  async function batchDeleteNodes(nodeIds: string[]) {
    if (!nodeIds || nodeIds.length === 0) {
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const res = await dataStore.batchDeleteNodesRecord({ ids: nodeIds });
    if (res.ok) {
      showToast(t('manualNodes.deletedCount', { count: nodeIds.length }), 'success');
    }
    return res;
  }

  async function addNode(node: StoreMisubItem): Promise<MutationResult<StoreMisubItem>> {
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
    const res = await dataStore.createNode(normalizedNode);
    if (res.ok) {
      manualNodesCurrentPage.value = 1;
    }
    return res;
  }

  async function updateNode(
    updatedNode: StoreMisubItem,
    options: RecordPatchOptions = {},
  ): Promise<MutationResult<StoreMisubItem>> {
    const normalizedNode = applyItemTags(
      {
        ...updatedNode,
        url: cleanNodeUrl(updatedNode.url),
      },
      updatedNode.tags,
    );
    const {
      id: _id,
      sortIndex: _sortIndex,
      configVersion: _configVersion,
      version: _version,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      latency: _latency,
      latencyMode: _latencyMode,
      lastTestedAt: _lastTestedAt,
      status: _status,
      ...patchFields
    } = normalizedNode as StoreMisubItem;
    return await dataStore.updateNodeRecord(normalizedNode.id, patchFields, options);
  }

  async function deleteNode(nodeId: string) {
    return await dataStore.deleteNodeRecord(nodeId);
  }

  async function deleteAllNodes() {
    const idsToRemove = manualNodes.value.map((n) => n.id);

    if (idsToRemove.length === 0) {
      showToast(t('manualNodes.noNodesToDelete'), 'info');
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const res = await dataStore.batchDeleteNodesRecord({ all: true });
    if (res.ok) {
      manualNodesCurrentPage.value = 1;
      showToast(t('manualNodes.clearedCount', { count: idsToRemove.length }), 'success');
    }
    return res;
  }

  async function addNodesFromBulk(
    nodes: Array<
      | StoreMisubItem
      | { id?: string; name: string; url: string; enabled: boolean; tags?: string[]; [key: string]: unknown }
    >,
    tagsInput: string | string[] = [],
  ): Promise<MutationResult<StoreMisubItem[]>> {
    const extraTags = normalizeTagList(tagsInput);
    const prepared = nodes.map((raw) => {
      const node = { ...raw };
      node.url = cleanNodeUrl(node.url);
      const mergedTags =
        extraTags.length > 0 ? normalizeTagList([...extraTags, ...getItemTags(node)]) : getItemTags(node);
      return applyItemTags(node, mergedTags) as StoreMisubItem;
    });
    return await dataStore.createNodesBatch(prepared);
  }

  const buildDedupPlan = (): DedupPlan => buildDedupPlanCore(manualNodes.value);

  async function applyDedupPlan(plan: DedupPlan | null | undefined) {
    if (!plan || !plan.removeNodes || plan.removeNodes.length === 0) {
      showToast(t('manualNodes.noDuplicates'), 'info');
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const idsToRemove = plan.removeNodes.map((node) => node.id);
    const res = await dataStore.batchDeleteNodesRecord({ ids: idsToRemove });
    if (res.ok) {
      showToast(t('manualNodes.removedDuplicates', { count: idsToRemove.length }), 'success');
      manualNodesCurrentPage.value = 1;
    }
    return res;
  }

  async function autoSortNodes(): Promise<MutationResult<StoreMisubItem[]>> {
    const mergedList = buildAutoSortedSubscriptions(allSubscriptions.value || [], manualNodes.value);
    const orderedIds = mergedList
      .filter((item) => item.url && !/^https?:\/\//i.test(item.url))
      .map((item) => item.id);
    const res = await dataStore.reorderNodesRecord(orderedIds, mergedList);
    if (res.ok) {
      manualNodesCurrentPage.value = 1;
    }
    return res;
  }

  async function sortNodesByLatency(): Promise<boolean> {
    const results = pingResults.value || {};
    const hasAnyLatency = Object.values(results).some(
      (item) => item && item.status === 'ok' && Number.isFinite(item.latency),
    );
    if (!hasAnyLatency) return false;

    const nodes = [...manualNodes.value];
    const latencyOf = (node: StoreMisubItem): number => {
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
    const res = await dataStore.reorderNodesRecord(
      nodes.map((n) => n.id),
      [...nodes, ...otherItems],
    );

    if (res.ok) {
      manualNodesCurrentPage.value = 1;
    }
    return res.ok;
  }

  async function reorderManualNodes(newOrder: StoreMisubItem[]): Promise<MutationResult<StoreMisubItem[]>> {
    const currentManualNodes = manualNodes.value;
    const reorderedVisibleNodes = [...(newOrder || [])];
    const newOrderIds = new Set(reorderedVisibleNodes.map((node) => node.id));
    const orderedManualNodes =
      newOrderIds.size > 0 && newOrderIds.size < currentManualNodes.length
        ? currentManualNodes.map((node) => {
            if (!newOrderIds.has(node.id)) return node;
            return reorderedVisibleNodes.shift() ?? node;
          })
        : reorderedVisibleNodes;

    const currentSubscriptions = (allSubscriptions.value || []).filter(
      (item) => item.url && /^https?:\/\//.test(item.url),
    );

    const mergedList = [...orderedManualNodes, ...currentSubscriptions];
    return await dataStore.reorderNodesRecord(
      orderedManualNodes.map((n) => n.id),
      mergedList,
    );
  }

  const getStoredTagOrder = (): string[] => {
    const tagOrder = settingsStore.config.manualNodeTagOrder;
    return Array.isArray(tagOrder) ? tagOrder : [];
  };

  const manualNodeTags = computed<string[]>(() => {
    return collectTags(manualNodes.value, getStoredTagOrder());
  });

  async function renameTag(oldName: string, newName: string): Promise<void> {
    const normalizedOldName = normalizeTagName(oldName);
    const normalizedNewName = normalizeTagName(newName);
    if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
      return;
    }

    const updates: Array<{ id: string; tags: string[] }> = [];
    manualNodes.value.forEach((node) => {
      const { nextTags, changed: itemChanged } = renameTagInList(
        getItemTags(node),
        normalizedOldName,
        normalizedNewName,
      );
      if (itemChanged) {
        updates.push({ id: node.id, tags: nextTags });
      }
    });

    if (updates.length > 0) {
      await dataStore.batchUpdateNodeTagsRecord(updates);
    }

    const customOrder = getStoredTagOrder();
    if (customOrder.includes(normalizedOldName)) {
      const nextOrder = normalizeTagList(
        customOrder.map((tag) => (tag === normalizedOldName ? normalizedNewName : tag)),
      );
      settingsStore.updateConfig({
        manualNodeTagOrder: nextOrder,
      });
      if (typeof dataStore.saveSettings === 'function') {
        dataStore
          .saveSettings({ manualNodeTagOrder: nextOrder }, { silent: true, preferencesOnly: true })
          .catch(() => {});
      }
    }

    if (activeTagFilters.value.includes(normalizedOldName)) {
      activeTagFilters.value = normalizeTagList(
        activeTagFilters.value.map((tag) => (tag === normalizedOldName ? normalizedNewName : tag)),
      );
    }
  }

  async function deleteTag(tagName: string): Promise<void> {
    const normalizedTagName = normalizeTagName(tagName);
    if (!normalizedTagName) return;

    const updates: Array<{ id: string; tags: string[] }> = [];
    manualNodes.value.forEach((node) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(node), normalizedTagName);
      if (itemChanged) {
        updates.push({ id: node.id, tags: nextTags });
      }
    });

    if (updates.length > 0) {
      await dataStore.batchUpdateNodeTagsRecord(updates);
    }

    const customOrder = getStoredTagOrder();
    const nextOrder = customOrder.filter((tag) => tag !== normalizedTagName);
    if (nextOrder.length !== customOrder.length) {
      settingsStore.updateConfig({
        manualNodeTagOrder: nextOrder,
      });
      if (typeof dataStore.saveSettings === 'function') {
        dataStore
          .saveSettings({ manualNodeTagOrder: nextOrder }, { silent: true, preferencesOnly: true })
          .catch(() => {});
      }
    }

    if (activeTagFilters.value.includes(normalizedTagName)) {
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalizedTagName);
    }
  }

  function reorderTags(newOrder: string[]): void {
    const normalizedOrder = normalizeTagList(newOrder);
    settingsStore.updateConfig({
      manualNodeTagOrder: normalizedOrder,
    });
    if (typeof dataStore.saveSettings === 'function') {
      dataStore
        .saveSettings({ manualNodeTagOrder: normalizedOrder }, { silent: true, preferencesOnly: true })
        .catch(() => {});
    }
  }

  function setPingMode(mode: string): void {
    const next: PingMode = mode === 'tcping' ? 'tcping' : 'local';
    pingMode.value = next;
    writeRawPreference(PING_MODE_PREF_KEY, next);
  }

  function readInspectLocalCache(): Record<string, InspectCacheEntry> {
    try {
      const raw = readRawPreference(INSPECT_CACHE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const now = Date.now();
      const valid: Record<string, InspectCacheEntry> = {};
      for (const [url, entry] of Object.entries(parsed as Record<string, unknown>)) {
        if (!entry || typeof entry !== 'object') continue;
        const candidate = entry as { data?: unknown; expiresAt?: unknown };
        if (
          candidate.data &&
          typeof candidate.data === 'object' &&
          (!candidate.expiresAt || (typeof candidate.expiresAt === 'number' && candidate.expiresAt > now))
        ) {
          valid[url] = {
            data: candidate.data as NodeInspectInfo,
            ...(typeof candidate.expiresAt === 'number' ? { expiresAt: candidate.expiresAt } : {}),
          };
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  function writeInspectLocalCache(cacheObj: Record<string, InspectCacheEntry>): void {
    try {
      writeRawPreference(INSPECT_CACHE_KEY, JSON.stringify(cacheObj));
    } catch {}
  }

  function hydrateInspectCache(targetNodes: StoreMisubItem[] = manualNodes.value): void {
    const list = (Array.isArray(targetNodes) ? targetNodes : []).filter((n) => n && n.id && n.url);
    if (list.length === 0) return;
    const localCache = readInspectLocalCache();
    let changed = false;
    const nextMap: NodeInspectMap = { ...nodeInspectMap.value };
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

  async function inspectNodes(
    targetNodes: StoreMisubItem[] = manualNodes.value,
    { force = false, silent = false }: { force?: boolean; silent?: boolean } = {},
  ): Promise<void> {
    const list = (Array.isArray(targetNodes) ? targetNodes : []).filter((n) => n && n.id && n.url);
    if (list.length === 0) return;

    const localCache = force ? {} : readInspectLocalCache();
    const nextMap: NodeInspectMap = { ...nodeInspectMap.value };
    const toQuery: Array<{ id: string; url: string }> = [];

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
      const updatedMap: NodeInspectMap = { ...nodeInspectMap.value };
      const cacheToSave = readInspectLocalCache();
      const expiresAt = Date.now() + INSPECT_CACHE_TTL_MS;

      for (let i = 0; i < toQuery.length; i += CHUNK_SIZE) {
        const chunk = toQuery.slice(i, i + CHUNK_SIZE);
        const resp = (await api.post(API_ENDPOINTS.NODES_INSPECT, {
          nodes: chunk,
          forceRefresh: force,
        })) as { results?: Record<string, NodeInspectInfo> } | null;
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
    } catch (error: unknown) {
      if (!silent) {
        showToast(extractErrorMessage(error, t('manualNodes.inspectFailed')), 'error');
      }
    } finally {
      isInspectingNodes.value = false;
    }
  }

  // --- 连通性测试 (Ping / TCPing) ---
  const pingResults = ref<Record<string, PingResult>>({});
  const pingingNodes = ref<Set<string>>(new Set());
  const isPingingAll = ref(false);

  async function pingNodeId(nodeId: string): Promise<void> {
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
          // 服务端不支持 TCPing 时自动切换并回退到本地 Ping，避免重复 501
          setPingMode('local');
          const fallback = await pingNode(host, port, 3000, { url: node.url });
          pingResults.value = { ...pingResults.value, [nodeId]: fallback };
        } else {
          pingResults.value = {
            ...pingResults.value,
            [nodeId]: normalizeTcpingResult(results[nodeId]),
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

  async function pingAllNodes(targetIds: string[] | null = null): Promise<void> {
    if (isPingingAll.value) return;
    const nodesToTest = Array.isArray(targetIds)
      ? targetIds.filter((id) => manualNodes.value.some((n) => n.id === id))
      : enabledManualNodes.value.map((n) => n.id);
    if (nodesToTest.length === 0) return;

    isPingingAll.value = true;
    showToast(t('manualNodes.pingStarted', { count: nodesToTest.length }), 'info');

    try {
      if (pingMode.value === 'tcping') {
        const batchTargets: Array<{ id: string; host: string; port: string | number }> = [];
        const loadingUpdates: Record<string, PingResult> = {};
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
              nextResults[item.id] = normalizeTcpingResult(results[item.id]);
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
