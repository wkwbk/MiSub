<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Gauge, Loader2, X } from '@lucide/vue';
import { api, APIError } from '@/lib/http.js';
import { useToastStore } from '@/stores/toast.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useI18n } from '@/i18n/index.js';
import { isNetworkErrorMessage } from '@/utils/network-error.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { isUdpOnlyProtocol, pingNode, tcpingNodes } from '@/utils/ping.js';
import { getDisabledNodeSet, normalizeDisabledNodes } from '@shared/disabled-nodes.js';
import Modal from '@/components/ui/Modal.vue';
import Switch from '@/components/ui/Switch.vue';
import NodeFilters from '@/components/modals/NodePreview/components/NodeFilters.vue';
import NodeList from '@/components/modals/NodePreview/components/NodeList.vue';
import NodeCard from '@/components/modals/NodePreview/components/NodeCard.vue';
import NodePagination from '@/components/modals/NodePreview/components/NodePagination.vue';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';

const isDev = import.meta.env.DEV;
const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  // 订阅信息
  subscriptionId: String,
  subscriptionName: String,
  subscriptionUrl: String,
  profileId: String,
  profileName: String,
  apiEndpoint: {
    type: String,
    default: '/api/subscription_nodes',
  },
});

const emit = defineEmits(['update:show']);
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);

const handleResize = () => {
  viewportWidth.value = window.innerWidth;
};

// 响应式数据
const loading = ref(false);
const error = ref('');
const allNodes = ref([]); // 存储所有节点
const currentPage = ref(1);
const pageSize = ref(24);
const viewMode = ref('list'); // 'list' 或 'card'
const showProcessed = ref(true); // 是否显示处理后的节点名称（默认显示处理后结果）

// 响应式视图模式 - 移动端强制卡片视图
const effectiveViewMode = computed(() => {
  const isSmallScreen = viewportWidth.value < 1024;
  if (isSmallScreen) {
    return 'card'; // 移动端和中小屏强制使用卡片视图
  }
  return viewMode.value;
});

// 筛选条件
const protocolFilter = ref('all');
const regionFilter = ref('all');
const searchQuery = ref('');

// 统计信息
const protocolStats = ref({});
const regionStats = ref({});
const availableProtocols = ref([]);
const availableRegions = ref([]);

// 复制状态
const copiedNodeId = ref('');

// 节点详情弹窗状态
const detailNode = ref(null);
const showDetailModal = ref(false);
const openNodeDetail = (node) => {
  detailNode.value = node;
  showDetailModal.value = true;
};

const pickingMode = ref(false);
const selectedUrls = ref(new Set());

const toggleNodeSelection = (url) => {
  if (selectedUrls.value.has(url)) {
    selectedUrls.value.delete(url);
  } else {
    selectedUrls.value.add(url);
  }
};

const selectAll = () => {
  filteredNodes.value.forEach((node) => selectedUrls.value.add(node.url));
};

const clearSelection = () => {
  selectedUrls.value.clear();
};

const { showToast } = useToastStore();
const dataStore = useDataStore();
const { addNodesFromBulk } = useManualNodes(dataStore.markDirty);

// 单订阅节点开关 & 延迟测速状态
const isPublicPreview = computed(() => props.apiEndpoint === '/api/public/preview');
const canManageSubscriptionNodes = computed(
  () => Boolean(props.subscriptionId) && !props.profileId && !isPublicPreview.value,
);
const allowPing = computed(() => !isPublicPreview.value);
const nodeEnabledMap = ref({});
const nodePingMap = ref({});
const pingMode = ref('tcping');
const isTestingLatency = ref(false);
const autoDisableFailed = ref(false);
let saveDisabledTimer = null;
let hasPendingDisabledSave = false;

const currentSubscriptionRecord = computed(() => {
  if (!props.subscriptionId) return null;
  return (dataStore.subscriptions || []).find((s) => s?.id === props.subscriptionId) || null;
});

const disabledCount = computed(
  () => allNodes.value.filter((node) => (nodeEnabledMap.value[node.url] ?? node.enabled !== false) === false).length,
);

const enabledCount = computed(() => Math.max(0, allNodes.value.length - disabledCount.value));

const failedFilteredUrls = computed(() =>
  filteredNodes.value
    .filter((node) => {
      if (isUdpOnlyProtocol(node.url)) return false;
      const ping = nodePingMap.value[node.url];
      return ping && (ping.status === 'timeout' || ping.status === 'error');
    })
    .map((node) => node.url),
);

const flushDisabledNodesSave = async () => {
  if (saveDisabledTimer) {
    clearTimeout(saveDisabledTimer);
    saveDisabledTimer = null;
  }
  if (!hasPendingDisabledSave) return;
  hasPendingDisabledSave = false;
  await dataStore.saveData?.().catch((err) => {
    console.warn('[NodePreview] Failed to save disabledNodes:', err);
  });
};

const syncDisabledNodesToStore = (immediate = false) => {
  const targetSub = currentSubscriptionRecord.value;
  if (!targetSub) return;

  const knownNodeUrls = new Set(allNodes.value.map((n) => String(n?.url || '').trim()).filter(Boolean));
  const preservedExternal = normalizeDisabledNodes(targetSub.disabledNodes).filter((u) => !knownNodeUrls.has(u));
  const nextLocalDisabled = allNodes.value
    .filter((n) => (nodeEnabledMap.value[n.url] ?? n.enabled !== false) === false)
    .map((n) => String(n.url || '').trim())
    .filter(Boolean);
  const nextDisabledNodes = Array.from(new Set([...preservedExternal, ...nextLocalDisabled]));

  dataStore.updateSubscription(targetSub.id, {
    ...targetSub,
    disabledNodes: nextDisabledNodes,
  });
  dataStore.markDirty();
  hasPendingDisabledSave = true;

  if (saveDisabledTimer) {
    clearTimeout(saveDisabledTimer);
    saveDisabledTimer = null;
  }
  if (immediate) {
    void flushDisabledNodesSave();
  } else {
    saveDisabledTimer = setTimeout(() => {
      void flushDisabledNodesSave();
    }, 600);
  }
};

const handleToggleNodeEnabled = (node, enabled) => {
  if (!canManageSubscriptionNodes.value || !node?.url) return;
  nodeEnabledMap.value = {
    ...nodeEnabledMap.value,
    [node.url]: Boolean(enabled),
  };
  syncDisabledNodesToStore(false);
};

const setBatchNodesEnabled = (urls, enabled) => {
  if (!canManageSubscriptionNodes.value || !Array.isArray(urls) || urls.length === 0) return;
  const nextMap = { ...nodeEnabledMap.value };
  let changed = false;
  for (const url of urls) {
    if (!url) continue;
    if ((nextMap[url] ?? true) !== Boolean(enabled)) {
      nextMap[url] = Boolean(enabled);
      changed = true;
    }
  }
  if (!changed) return;
  nodeEnabledMap.value = nextMap;
  syncDisabledNodesToStore(false);
};

const disableFailedNodes = () => {
  const targets = failedFilteredUrls.value;
  if (targets.length === 0) return;
  setBatchNodesEnabled(targets, false);
  showToast(t('nodePreview.disabledFailedCount', { count: targets.length }), 'info');
};

const enableAllNodes = () => {
  const targets = allNodes.value.map((n) => n.url).filter(Boolean);
  if (targets.length === 0) return;
  setBatchNodesEnabled(targets, true);
  showToast(t('nodePreview.enabledAllNodes'), 'success');
};

const testSingleNode = async (node) => {
  if (!node?.url || !allowPing.value) return;
  if (isUdpOnlyProtocol(node.url)) {
    nodePingMap.value = {
      ...nodePingMap.value,
      [node.url]: { status: 'unsupported', latency: -1, mode: pingMode.value },
    };
    return;
  }
  const info = parseNodeInfo(node);
  const host = String(info.server || '').trim();
  const port = Number(info.port) || 0;
  if (!host || !port) {
    nodePingMap.value = {
      ...nodePingMap.value,
      [node.url]: { status: 'error', latency: -1, mode: pingMode.value },
    };
    return;
  }

  nodePingMap.value = {
    ...nodePingMap.value,
    [node.url]: { status: 'loading', latency: 0, mode: pingMode.value },
  };

  let result;
  if (pingMode.value === 'tcping') {
    try {
      const { results, unsupported } = await tcpingNodes([{ id: node.url, host, port }], 3000);
      if (unsupported) {
        pingMode.value = 'local';
        showToast(t('manualNodes.tcpingUnsupportedFallback'), 'warning');
        result = await pingNode(host, port, 3000, { url: node.url });
      } else {
        result = results[node.url] || { status: 'error', latency: -1, mode: 'tcping' };
      }
    } catch {
      result = { status: 'error', latency: -1, mode: 'tcping' };
    }
  } else {
    result = await pingNode(host, port, 3000, { url: node.url });
  }

  nodePingMap.value = {
    ...nodePingMap.value,
    [node.url]: result,
  };

  if (
    autoDisableFailed.value &&
    canManageSubscriptionNodes.value &&
    !isUdpOnlyProtocol(node.url) &&
    (result.status === 'timeout' || result.status === 'error')
  ) {
    setBatchNodesEnabled([node.url], false);
  }
};

const testFilteredNodes = async () => {
  if (isTestingLatency.value || !allowPing.value || filteredNodes.value.length === 0) return;
  isTestingLatency.value = true;

  try {
    const candidates = [...filteredNodes.value];
    const udpNodes = [];
    const testable = [];

    for (const node of candidates) {
      if (isUdpOnlyProtocol(node.url)) {
        udpNodes.push(node);
      } else {
        const info = parseNodeInfo(node);
        const host = String(info.server || '').trim();
        const port = Number(info.port) || 0;
        if (host && port) {
          testable.push({ node, host, port });
        } else {
          nodePingMap.value = {
            ...nodePingMap.value,
            [node.url]: { status: 'error', latency: -1, mode: pingMode.value },
          };
        }
      }
    }

    if (udpNodes.length > 0) {
      const udpUpdates = {};
      udpNodes.forEach((n) => {
        udpUpdates[n.url] = { status: 'unsupported', latency: -1, mode: pingMode.value };
      });
      nodePingMap.value = { ...nodePingMap.value, ...udpUpdates };
    }

    if (testable.length > 0) {
      const loadingUpdates = {};
      testable.forEach(({ node }) => {
        loadingUpdates[node.url] = { status: 'loading', latency: 0, mode: pingMode.value };
      });
      nodePingMap.value = { ...nodePingMap.value, ...loadingUpdates };

      if (pingMode.value === 'tcping') {
        const CHUNK_SIZE = 15;
        let fallbackToLocal = false;
        for (let i = 0; i < testable.length; i += CHUNK_SIZE) {
          const chunk = testable.slice(i, i + CHUNK_SIZE);
          try {
            const { results, unsupported } = await tcpingNodes(
              chunk.map((item) => ({ id: item.node.url, host: item.host, port: item.port })),
              3000,
            );
            if (unsupported) {
              fallbackToLocal = true;
              pingMode.value = 'local';
              showToast(t('manualNodes.tcpingUnsupportedFallback'), 'warning');
              break;
            }
            const nextResults = {};
            chunk.forEach(({ node }) => {
              nextResults[node.url] = results[node.url] || { status: 'error', latency: -1, mode: 'tcping' };
            });
            nodePingMap.value = { ...nodePingMap.value, ...nextResults };
          } catch {
            const nextResults = {};
            chunk.forEach(({ node }) => {
              nextResults[node.url] = { status: 'error', latency: -1, mode: 'tcping' };
            });
            nodePingMap.value = { ...nodePingMap.value, ...nextResults };
          }
        }
        if (fallbackToLocal) {
          const CONCURRENCY = 6;
          for (let i = 0; i < testable.length; i += CONCURRENCY) {
            const chunk = testable.slice(i, i + CONCURRENCY);
            await Promise.all(
              chunk.map(async ({ node, host, port }) => {
                const res = await pingNode(host, port, 3000, { url: node.url });
                nodePingMap.value = { ...nodePingMap.value, [node.url]: res };
              }),
            );
          }
        }
      } else {
        const CONCURRENCY = 6;
        for (let i = 0; i < testable.length; i += CONCURRENCY) {
          const chunk = testable.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async ({ node, host, port }) => {
              const res = await pingNode(host, port, 3000, { url: node.url });
              nodePingMap.value = { ...nodePingMap.value, [node.url]: res };
            }),
          );
        }
      }
    }

    if (autoDisableFailed.value && canManageSubscriptionNodes.value) {
      const toDisable = testable
        .filter(({ node }) => {
          const ping = nodePingMap.value[node.url];
          return ping && (ping.status === 'timeout' || ping.status === 'error');
        })
        .map(({ node }) => node.url);
      if (toDisable.length > 0) {
        setBatchNodesEnabled(toDisable, false);
        showToast(t('nodePreview.autoDisabledFailedCount', { count: toDisable.length }), 'info');
      }
    }
  } finally {
    isTestingLatency.value = false;
  }
};

const handleSaveSelection = async () => {
  if (selectedUrls.value.size === 0) {
    showToast(t('nodePreview.selectAtLeastOne'), 'warning');
    return;
  }

  try {
    const urls = Array.from(selectedUrls.value);

    const nodeByUrl = new Map(allNodes.value.map((n) => [n.url, n]));
    const nodesToAdd = urls.map((url) => {
      const originalNode = nodeByUrl.get(url);
      return {
        name: (originalNode?.name || 'Pick').split('#')[0].trim(),
        url: url,
        enabled: true,
      };
    });

    addNodesFromBulk(nodesToAdd);

    showToast(t('nodePreview.extractedToManual', { count: urls.length }), 'success');

    pickingMode.value = false;
    selectedUrls.value.clear();
  } catch (err) {
    showToast(t('nodePreview.saveSelectionFailed', { message: err.message }), 'error');
  }
};

// 计算属性
const title = computed(() => {
  if (props.profileName) {
    return props.profileName;
  }
  return props.subscriptionName || t('nodePreview.unknownSubscription');
});

const subtitle = computed(() => {
  return props.profileId ? t('nodePreview.profileSubtitle') : t('nodePreview.subscriptionSubtitle');
});

// 过滤后的节点
const filteredNodes = computed(() => {
  let result = allNodes.value;

  // 协议过滤
  if (protocolFilter.value && protocolFilter.value !== 'all') {
    result = result.filter((node) => node.protocol === protocolFilter.value);
  }

  // 地区过滤
  if (regionFilter.value && regionFilter.value !== 'all') {
    result = result.filter((node) => node.region === regionFilter.value);
  }

  // 搜索过滤
  if (searchQuery.value && searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    result = result.filter(
      (node) =>
        node.name.toLowerCase().includes(query) ||
        node.protocol.toLowerCase().includes(query) ||
        node.region.toLowerCase().includes(query),
    );
  }

  return result;
});

// 当前页显示的节点
const paginatedNodes = computed(() => {
  const result = filteredNodes.value;
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  return result.slice(startIndex, endIndex);
});

// 分页信息
const totalPages = computed(() => {
  return Math.ceil(filteredNodes.value.length / pageSize.value);
});

// 总节点数（过滤后）
const filteredTotalCount = computed(() => {
  return filteredNodes.value.length;
});

const resetState = () => {
  currentPage.value = 1;
  protocolFilter.value = 'all';
  regionFilter.value = 'all';
  searchQuery.value = '';
  showProcessed.value = true;
  error.value = '';
  allNodes.value = [];
  protocolStats.value = {};
  regionStats.value = {};
  availableProtocols.value = [];
  availableRegions.value = [];
  copiedNodeId.value = '';
  pickingMode.value = false;
  selectedUrls.value.clear();
  nodeEnabledMap.value = {};
  nodePingMap.value = {};
  isTestingLatency.value = false;
};

const closeModal = () => {
  void flushDisabledNodesSave();
  emit('update:show', false);
};

// 监听弹窗显示状态
watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      loadNodes();
    } else {
      void flushDisabledNodesSave();
      showDetailModal.value = false;
      detailNode.value = null;
      resetState();
    }
  },
);

onMounted(() => {
  window.addEventListener('resize', handleResize);
  if (props.show) {
    loadNodes();
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  void flushDisabledNodesSave();
});

// 监听筛选条件变化，重置页码
watch([protocolFilter, regionFilter, searchQuery], () => {
  currentPage.value = 1;
});

// 监听 showProcessed 变化，重新加载节点
watch(showProcessed, () => {
  loadNodes();
});

// 加载节点数据
const loadNodes = async () => {
  if (!props.show) return;

  loading.value = true;
  error.value = '';

  try {
    const requestData = {
      userAgent: 'v2rayN/7.23',
    };

    if (props.profileId) {
      requestData.profileId = props.profileId;
      // 仅在订阅组模式下传递 applyTransform 参数
      requestData.applyTransform = showProcessed.value;
    } else if (props.subscriptionId) {
      requestData.subscriptionId = props.subscriptionId;
    } else if (props.subscriptionUrl) {
      requestData.url = props.subscriptionUrl;
    } else {
      throw new Error(t('nodePreview.missingParams'));
    }

    if (isDev) {
      console.debug('[Preview] Sending request to:', props.apiEndpoint, requestData);
    }

    const data = await api.post(props.apiEndpoint, requestData);
    if (isDev) {
      console.debug('[Preview] Data received:', data);
    }

    if (!data.success) {
      throw new Error(data.error || t('nodePreview.fetchFailed'));
    }

    allNodes.value = data.nodes || [];
    const disabledSet = getDisabledNodeSet(currentSubscriptionRecord.value);
    const nextEnabledMap = {};
    allNodes.value.forEach((node) => {
      if (!node?.url) return;
      nextEnabledMap[node.url] = node.enabled !== false && !disabledSet.has(String(node.url).trim());
    });
    nodeEnabledMap.value = nextEnabledMap;
    nodePingMap.value = {};
    protocolStats.value = data.stats?.protocols || {};
    regionStats.value = data.stats?.regions || {};

    // 更新可用筛选选项
    // 协议类型按常见程度排序
    const protocolOrder = ['vmess', 'vless', 'trojan', 'ss', 'ssr', 'hysteria2', 'tuic', 'socks5', 'anytls', 'unknown'];
    availableProtocols.value = Object.keys(protocolStats.value).sort((a, b) => {
      const aIndex = protocolOrder.indexOf(a.toLowerCase());
      const bIndex = protocolOrder.indexOf(b.toLowerCase());
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // 地区按常见地区优先排序
    const regionOrder = [
      '香港',
      '台湾',
      '新加坡',
      '日本',
      '美国',
      '韩国',
      '英国',
      '德国',
      '法国',
      '加拿大',
      '澳大利亚',
      '其他',
    ];
    availableRegions.value = Object.keys(regionStats.value).sort((a, b) => {
      const aIndex = regionOrder.indexOf(a);
      const bIndex = regionOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // 重置页码
    currentPage.value = 1;
  } catch (err) {
    // 提供更友好的错误信息（文案与 useNodePreview.js 保持同一套 key）
    if (err instanceof APIError && err.status === 401) {
      try {
        await api.get('/api/data');
        error.value = t('nodePreview.authAbnormal');
      } catch (testErr) {
        error.value = t('nodePreview.authFailed');
      }
    } else if (isNetworkErrorMessage(err?.message)) {
      error.value = t('nodePreview.networkFailed');
    } else {
      error.value = err.message || t('nodePreview.loadFailed');
    }

    allNodes.value = [];
  } finally {
    loading.value = false;
  }
};

// 复制节点链接
const copyNodeUrl = async (node, nodeId) => {
  const copied = await copyTextToClipboard(node.url);
  if (copied) {
    copiedNodeId.value = nodeId;
    setTimeout(() => {
      copiedNodeId.value = '';
    }, 2000);
  }
};

// 获取协议类型的显示样式
const getProtocolStyle = () => {
  return 'bg-transparent text-fg-muted border border-line font-mono';
};

// 解析节点信息
const parseNodeInfo = (node) => {
  const result = {
    name: node.name,
    server: node.server || '',
    port: node.port || '',
    protocol: node.protocol,
    region: node.region,
  };

  // 如果后端已经返回了服务器和端口，直接使用，不再前端解析
  if (result.server && result.port) {
    return result;
  }

  try {
    const url = new URL(node.url);
    result.server = url.hostname || '';
    result.port = url.port || '';

    // 对于vmess协议，需要特殊处理
    if (node.protocol === 'vmess') {
      try {
        const base64Part = node.url.substring('vmess://'.length);
        const binaryString = atob(base64Part);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const jsonString = new TextDecoder('utf-8').decode(bytes);
        const nodeConfig = JSON.parse(jsonString);
        result.server = nodeConfig.add || result.server;
        result.port = nodeConfig.port || result.port;
      } catch (e) {
        if (isDev) {
          console.debug('[Preview] VMess parse failed, using URL fallback:', e);
        }
      }
    }
  } catch (e) {
    if (isDev) {
      console.debug('[Preview] URL parse failed, falling back to regex:', e);
    }
    const match = node.url.match(/@([^:/]+):(\d+)/);
    if (match) {
      result.server = match[1];
      result.port = match[2];
    }
  }

  return result;
};

const nodeListStartRef = ref(null);
const nodeListScrollRef = ref(null);

// 分页控件
const goToPage = (page) => {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
    currentPage.value = page;
    nextTick(() => {
      if (nodeListScrollRef.value && nodeListScrollRef.value.scrollTop > 0) {
        scrollToPaginationStart(nodeListScrollRef.value);
      }
      scrollToPaginationStart(nodeListStartRef.value);
    });
  }
};
</script>

<template>
  <Modal :show="show" size="6xl" @update:show="(value) => !value && !showDetailModal && closeModal()">
    <template #title>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <h3 class="truncate text-base font-semibold text-fg sm:text-lg tracking-tight">
              {{ title }}
            </h3>
          </div>
          <p class="text-xs text-fg-subtle pl-3.5">
            {{ subtitle }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="profileId && apiEndpoint !== '/api/public/preview'"
            :class="
              pickingMode
                ? 'bg-active text-fg border-line-strong'
                : 'bg-transparent border-line text-fg-muted hover:bg-hover'
            "
            class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shadow-none whitespace-nowrap"
            @click="pickingMode = !pickingMode"
          >
            {{ pickingMode ? t('nodePreview.exitPicking') : t('nodePreview.pickNodes') }}
          </button>
          <button
            :aria-label="t('common.close')"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-inset text-fg-subtle hover:text-fg hover:bg-hover hover:border-line-strong transition-colors"
            @click="closeModal"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </template>

    <template #body>
      <!-- 统计信息 (Exposed Hairline Grid Style) -->
      <div
        v-if="!loading && !error && Object.keys(protocolStats).length > 0"
        class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-md overflow-hidden mb-4"
      >
        <div class="bg-inset px-3.5 py-3 sm:p-4">
          <div class="text-xs font-medium text-fg-subtle uppercase tracking-wider">
            {{ t('nodePreview.nodesTotal') }}
          </div>
          <div class="mt-1 text-xl font-semibold font-mono text-fg">
            {{ allNodes.length }}
          </div>
        </div>
        <div class="bg-inset px-3.5 py-3 sm:p-4">
          <div class="text-xs font-medium text-fg-subtle uppercase tracking-wider">
            {{ t('nodePreview.protocolTypes') }}
          </div>
          <div class="mt-1 text-xl font-semibold font-mono text-fg">
            {{ Object.keys(protocolStats).length }}
          </div>
        </div>
        <div class="bg-inset px-3.5 py-3 sm:p-4">
          <div class="text-xs font-medium text-fg-subtle uppercase tracking-wider">
            {{ t('nodePreview.regionsCount') }}
          </div>
          <div class="mt-1 text-xl font-semibold font-mono text-fg">
            {{ Object.keys(regionStats).length }}
          </div>
        </div>
        <div class="bg-inset px-3.5 py-3 sm:p-4">
          <div class="text-xs font-medium text-fg-subtle uppercase tracking-wider">
            {{ t('nodePreview.totalPages') }}
          </div>
          <div class="mt-1 text-xl font-semibold font-mono text-fg">
            {{ totalPages }}
          </div>
        </div>
      </div>

      <!-- 筛选控件 - 统一响应式布局 -->
      <NodeFilters
        v-if="!loading && !error && Object.keys(protocolStats).length > 0"
        :api-endpoint="apiEndpoint"
        :available-protocols="availableProtocols"
        :available-regions="availableRegions"
        :profile-id="profileId"
        :protocol-filter="protocolFilter"
        :region-filter="regionFilter"
        :search-query="searchQuery"
        :show-processed="showProcessed"
        :view-mode="viewMode"
        class="mb-4"
        @update:search-query="searchQuery = $event"
        @update:protocol-filter="protocolFilter = $event"
        @update:region-filter="regionFilter = $event"
        @update:view-mode="viewMode = $event"
        @update:show-processed="showProcessed = $event"
      />

      <!-- 测速与节点启用控制栏（仅后台预览显示） -->
      <div
        v-if="!loading && !error && allNodes.length > 0 && allowPing"
        class="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-line bg-inset/60 px-3.5 py-2.5 text-xs"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            :disabled="isTestingLatency || filteredNodes.length === 0"
            class="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-elevated-card px-2.5 py-1.5 font-medium text-fg hover:bg-hover disabled:opacity-50 transition-colors"
            data-testid="preview-test-latency-btn"
            type="button"
            @click="testFilteredNodes"
          >
            <Loader2 v-if="isTestingLatency" class="h-3.5 w-3.5 animate-spin" />
            <Gauge v-else class="h-3.5 w-3.5" />
            <span>{{ isTestingLatency ? t('nodePreview.testingLatency') : t('nodePreview.testFilteredLatency') }}</span>
          </button>

          <div class="inline-flex items-center rounded-md border border-line overflow-hidden divide-x divide-line">
            <button
              :class="
                pingMode === 'tcping' ? 'bg-active text-fg font-semibold' : 'bg-transparent text-fg-muted hover:text-fg'
              "
              class="px-2 py-1 transition-colors"
              type="button"
              @click="pingMode = 'tcping'"
            >
              TCPing
            </button>
            <button
              :class="
                pingMode === 'local' ? 'bg-active text-fg font-semibold' : 'bg-transparent text-fg-muted hover:text-fg'
              "
              class="px-2 py-1 transition-colors"
              type="button"
              @click="pingMode = 'local'"
            >
              Local
            </button>
          </div>

          <button
            v-if="canManageSubscriptionNodes && failedFilteredUrls.length > 0"
            class="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-red-400 hover:bg-red-500/20 transition-colors"
            type="button"
            @click="disableFailedNodes"
          >
            {{ t('nodePreview.disableFailedAction', { count: failedFilteredUrls.length }) }}
          </button>

          <button
            v-if="canManageSubscriptionNodes && disabledCount > 0"
            class="inline-flex items-center gap-1 rounded-md border border-line bg-transparent px-2.5 py-1 text-fg-muted hover:border-line-strong hover:text-fg transition-colors"
            type="button"
            @click="enableAllNodes"
          >
            {{ t('nodePreview.enableAllAction') }}
          </button>
        </div>

        <div v-if="canManageSubscriptionNodes" class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-fg-muted">
            {{ t('nodePreview.enabledSummary', { enabled: enabledCount, total: allNodes.length }) }}
          </span>
          <label class="inline-flex items-center gap-2 text-fg-muted cursor-pointer">
            <span>{{ t('nodePreview.autoDisableFailedLabel') }}</span>
            <Switch v-model="autoDisableFailed" size="sm" />
          </label>
        </div>
      </div>

      <!-- 节点列表 -->
      <div ref="nodeListStartRef" class="flex-1 overflow-hidden bg-transparent" style="min-height: 0">
        <div ref="nodeListScrollRef" class="h-full overflow-y-auto">
          <!-- 加载状态 -->
          <div v-if="loading" class="flex h-64 items-center justify-center">
            <div class="rounded-md border border-line bg-inset px-8 py-8 text-center shadow-none">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-line-strong"></div>
              <p class="mt-3 text-xs text-fg-subtle">
                {{ t('nodePreview.loadingNodes') }}
              </p>
            </div>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" class="flex h-64 items-center justify-center">
            <div class="rounded-md border border-line bg-inset px-8 py-8 text-center shadow-none">
              <div class="flex items-center justify-center gap-2 text-sm text-red-500">
                <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                <span>{{ error }}</span>
              </div>
              <button
                class="mt-4 rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:opacity-90"
                @click="loadNodes"
              >
                {{ t('common.retry') }}
              </button>
            </div>
          </div>

          <!-- 无数据状态 -->
          <div v-else-if="paginatedNodes.length === 0" class="flex h-64 items-center justify-center">
            <div class="rounded-md border border-dashed border-line bg-transparent px-8 py-8 text-center">
              <p class="text-xs text-fg-subtle">
                {{ t('nodePreview.noMatchingNodes') }}
              </p>
            </div>
          </div>

          <!-- 节点列表/卡片视图 -->
          <div v-else class="flex h-full flex-col">
            <!-- 简洁列表视图 (仅大屏桌面端) -->
            <NodeList
              v-if="effectiveViewMode === 'list'"
              :allow-ping="allowPing"
              :copied-node-id="copiedNodeId"
              :get-protocol-style="getProtocolStyle"
              :node-enabled-map="nodeEnabledMap"
              :node-ping-map="nodePingMap"
              :nodes="paginatedNodes"
              :parse-node-info="parseNodeInfo"
              :selected-urls="selectedUrls"
              :selection-mode="pickingMode"
              :show-node-switch="canManageSubscriptionNodes"
              @copy="copyNodeUrl"
              @detail="openNodeDetail"
              @ping="testSingleNode"
              @toggle-enabled="handleToggleNodeEnabled"
              @toggle-select="toggleNodeSelection"
            />

            <!-- 卡片视图 container -->
            <NodeCard
              v-else
              :allow-ping="allowPing"
              :copied-node-id="copiedNodeId"
              :get-protocol-style="getProtocolStyle"
              :node-enabled-map="nodeEnabledMap"
              :node-ping-map="nodePingMap"
              :nodes="paginatedNodes"
              :parse-node-info="parseNodeInfo"
              :selected-urls="selectedUrls"
              :selection-mode="pickingMode"
              :show-node-switch="canManageSubscriptionNodes"
              @copy="copyNodeUrl"
              @detail="openNodeDetail"
              @ping="testSingleNode"
              @toggle-enabled="handleToggleNodeEnabled"
              @toggle-select="toggleNodeSelection"
            />
          </div>
        </div>
      </div>

      <NodePagination
        v-if="!loading && !error"
        :current-page="currentPage"
        :page-size="pageSize"
        :total-items="filteredTotalCount"
        :total-pages="totalPages"
        @go-to-page="goToPage"
      />
    </template>

    <template #footer>
      <div v-if="pickingMode" class="flex w-full flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col">
          <span class="text-xs text-fg-muted uppercase tracking-wider font-semibold">
            {{ t('nodePreview.pickingMode') }}
          </span>
          <span class="text-xs font-medium text-fg-muted">
            {{ t('nodePreview.selectedNodesPrefix') }}
            <span class="text-sm font-mono font-bold text-fg">{{ selectedUrls.size }}</span>
            {{ t('nodePreview.selectedNodesSuffix') }}
          </span>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <button
            class="px-4 py-2 bg-transparent hover:bg-hover border border-line text-fg-muted hover:text-fg font-medium text-sm rounded-md transition-colors"
            @click="selectAll"
          >
            {{ t('actions.selectAll') }}
          </button>
          <button
            class="px-4 py-2 bg-transparent hover:bg-hover border border-line text-fg-muted hover:text-fg font-medium text-sm rounded-md transition-colors"
            @click="clearSelection"
          >
            {{ t('common.clear') }}
          </button>
          <button
            class="px-4 py-2 font-semibold text-sm rounded-md transition-colors bg-accent text-accent-fg hover:opacity-90 border border-accent"
            @click="handleSaveSelection"
          >
            {{ t('nodePreview.saveSelection') }}
          </button>
        </div>
      </div>
      <template v-else>
        <button
          class="px-4 py-2 bg-transparent hover:bg-hover border border-line text-fg-muted hover:text-fg font-medium text-sm rounded-md transition-colors"
          @click="closeModal"
        >
          {{ t('actions.cancel') }}
        </button>
        <button
          class="px-4 py-2 font-semibold text-sm rounded-md transition-colors bg-accent text-accent-fg hover:opacity-90 border border-accent"
          @click="closeModal"
        >
          {{ t('actions.confirm') }}
        </button>
      </template>
    </template>
  </Modal>

  <NodeDetailModal v-model:show="showDetailModal" :node="detailNode" />
</template>
