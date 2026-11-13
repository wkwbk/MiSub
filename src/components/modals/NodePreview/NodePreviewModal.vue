<script setup>
    import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
    import { X } from 'lucide-vue-next';
    import { api, APIError } from '../../../lib/http.js';
    import { useToastStore } from '../../../stores/toast.js';
    import { useDataStore } from '../../../stores/useDataStore.js';
    import { useManualNodes } from '../../../composables/useManualNodes.js';
    import { useI18n } from '../../../i18n/index.js';
    import { isNetworkErrorMessage } from '../../../utils/network-error.js';
    import Modal from '../../forms/Modal.vue';
    import NodeFilters from './components/NodeFilters.vue';
    import NodeList from './components/NodeList.vue';
    import NodeCard from './components/NodeCard.vue';
    import NodePagination from './components/NodePagination.vue';
    import { REGION_EMOJI } from '../../../../functions/modules/utils/geo-utils.js';

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

    // [New] Selection Mode State
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

    const handleSaveSelection = async () => {
        if (selectedUrls.value.size === 0) {
            showToast(t('nodePreview.selectAtLeastOne'), 'warning');
            return;
        }

        try {
            const urls = Array.from(selectedUrls.value);

            // Add nodes to data store as manual nodes
            // You can also add logic here to associate them specifically with props.profileId
            // For now, we'll use bulk import logic to create manual nodes
            const nodesToAdd = urls.map((url) => {
                // Try to find full node object from allNodes
                const originalNode = allNodes.value.find((n) => n.url === url);
                return {
                    name: (originalNode?.name || 'Pick').split('#')[0].trim(),
                    url: url,
                    enabled: true,
                };
            });

            addNodesFromBulk(nodesToAdd);

            // Add nodes to the manual list. Profile association remains an explicit follow-up action.
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
        return props.profileId
            ? t('nodePreview.profileSubtitle')
            : t('nodePreview.subscriptionSubtitle');
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
                    node.region.toLowerCase().includes(query)
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
        showProcessed.value = false;
        error.value = '';
        allNodes.value = [];
        protocolStats.value = {};
        regionStats.value = {};
        availableProtocols.value = [];
        availableRegions.value = [];
        copiedNodeId.value = '';
        pickingMode.value = false;
        selectedUrls.value.clear();
    };

    const closeModal = () => {
        emit('update:show', false);
    };

    // 监听弹窗显示状态
    watch(
        () => props.show,
        (newVal) => {
            if (newVal) {
                loadNodes();
            } else {
                resetState();
            }
        }
    );

    onMounted(() => {
        window.addEventListener('resize', handleResize);
        if (props.show) {
            loadNodes();
        }
    });

    onUnmounted(() => {
        window.removeEventListener('resize', handleResize);
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
            protocolStats.value = data.stats?.protocols || {};
            regionStats.value = data.stats?.regions || {};

            // 更新可用筛选选项
            // 协议类型按常见程度排序
            const protocolOrder = [
                'vmess',
                'vless',
                'trojan',
                'ss',
                'ssr',
                'hysteria2',
                'tuic',
                'socks5',
                'anytls',
                'unknown',
            ];
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
        try {
            await navigator.clipboard.writeText(node.url);
            copiedNodeId.value = nodeId;
            setTimeout(() => {
                copiedNodeId.value = '';
            }, 2000);
        } catch (err) {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = node.url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            copiedNodeId.value = nodeId;
            setTimeout(() => {
                copiedNodeId.value = '';
            }, 2000);
        }
    };

    // 获取协议类型的显示样式
    const getProtocolStyle = () => {
        return 'bg-transparent text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 font-mono';
    };

    // 获取地区 Emoji
    const getRegionEmoji = (region) => {
        if (!region) return '🌐';
        if (REGION_EMOJI[region]) return REGION_EMOJI[region];

        // 英文代码别名。中文地区名以 geo-utils 的旗帜表为准，台湾固定为 🇨🇳。
        const regionMap = {
            HK: '🇭🇰',
            'Hong Kong': '🇭🇰',
            香港: '🇭🇰',
            TW: '🇨🇳',
            Taiwan: '🇨🇳',
            台湾: '🇨🇳',
            JP: '🇯🇵',
            Japan: '🇯🇵',
            日本: '🇯🇵',
            US: '🇺🇸',
            'United States': '🇺🇸',
            美国: '🇺🇸',
            SG: '🇸🇬',
            Singapore: '🇸🇬',
            新加坡: '🇸🇬',
            KR: '🇰🇷',
            Korea: '🇰🇷',
            韩国: '🇰🇷',
            UK: '🇬🇧',
            'United Kingdom': '🇬🇧',
            英国: '🇬🇧',
            DE: '🇩🇪',
            Germany: '🇩🇪',
            德国: '🇩🇪',
            FR: '🇫🇷',
            France: '🇫🇷',
            法国: '🇫🇷',
            RU: '🇷🇺',
            Russia: '🇷🇺',
            俄罗斯: '🇷🇺',
            CA: '🇨🇦',
            Canada: '🇨🇦',
            加拿大: '🇨🇦',
            MO: '🇲🇴',
            Macao: '🇲🇴',
            澳门: '🇲🇴',
            CN: '🇨🇳',
            China: '🇨🇳',
            中国: '🇨🇳',
            IN: '🇮🇳',
            India: '🇮🇳',
            印度: '🇮🇳',
            NL: '🇳🇱',
            Netherlands: '🇳🇱',
            荷兰: '🇳🇱',
            AU: '🇦🇺',
            Australia: '🇦🇺',
            澳大利亚: '🇦🇺',
            TH: '🇹🇭',
            Thailand: '🇹🇭',
            泰国: '🇹🇭',
            VN: '🇻🇳',
            Vietnam: '🇻🇳',
            越南: '🇻🇳',
            ID: '🇮🇩',
            Indonesia: '🇮🇩',
            印尼: '🇮🇩',
            MY: '🇲🇾',
            Malaysia: '🇲🇾',
            马来西亚: '🇲🇾',
            PH: '🇵🇭',
            Philippines: '🇵🇭',
            菲律宾: '🇵🇭',
            TR: '🇹🇷',
            Turkey: '🇹🇷',
            土耳其: '🇹🇷',
        };

        if (regionMap[region]) return regionMap[region];

        // 尝试在字符串中查找 Emoji
        const emojiMatch = region.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
        if (emojiMatch) return emojiMatch[0];

        return '🌍';
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
            const match = node.url.match(/@([^:\/]+):(\d+)/);
            if (match) {
                result.server = match[1];
                result.port = match[2];
            }
        }

        return result;
    };

    // 分页控件
    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages.value) {
            currentPage.value = page;
        }
    };
</script>

<template>
    <Modal :show="show" size="6xl" @update:show="(value) => !value && closeModal()">
        <template #title>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 space-y-0.5">
                    <div class="flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <h3
                            class="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:text-lg tracking-tight"
                        >
                            {{ title }}
                        </h3>
                    </div>
                    <p class="text-xs text-zinc-500 pl-3.5">
                        {{ subtitle }}
                    </p>
                </div>
                <div class="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        v-if="profileId"
                        @click="pickingMode = !pickingMode"
                        class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shadow-none"
                        :class="
                            pickingMode
                                ? 'bg-zinc-900 text-zinc-100 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                                : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                        "
                    >
                        {{
                            pickingMode ? t('nodePreview.exitPicking') : t('nodePreview.pickNodes')
                        }}
                    </button>
                    <button
                        @click="closeModal"
                        class="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                        :aria-label="t('common.close')"
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
                class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 bg-transparent mb-4"
            >
                <div class="p-4">
                    <div class="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Nodes Total
                    </div>
                    <div
                        class="mt-1 text-xl font-semibold font-mono text-zinc-900 dark:text-zinc-100"
                    >
                        {{ allNodes.length }}
                    </div>
                </div>
                <div class="p-4">
                    <div class="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Protocols
                    </div>
                    <div
                        class="mt-1 text-xl font-semibold font-mono text-zinc-900 dark:text-zinc-100"
                    >
                        {{ Object.keys(protocolStats).length }}
                    </div>
                </div>
                <div class="p-4">
                    <div class="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Regions
                    </div>
                    <div
                        class="mt-1 text-xl font-semibold font-mono text-zinc-900 dark:text-zinc-100"
                    >
                        {{ Object.keys(regionStats).length }}
                    </div>
                </div>
                <div class="p-4">
                    <div class="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Total Pages
                    </div>
                    <div
                        class="mt-1 text-xl font-semibold font-mono text-zinc-900 dark:text-zinc-100"
                    >
                        {{ totalPages }}
                    </div>
                </div>
            </div>

            <!-- 筛选控件 - 统一响应式布局 -->
            <NodeFilters
                v-if="!loading && !error && Object.keys(protocolStats).length > 0"
                class="mb-4"
                :search-query="searchQuery"
                :protocol-filter="protocolFilter"
                :region-filter="regionFilter"
                :view-mode="viewMode"
                :show-processed="showProcessed"
                :available-protocols="availableProtocols"
                :available-regions="availableRegions"
                :profile-id="profileId"
                :api-endpoint="apiEndpoint"
                @update:search-query="searchQuery = $event"
                @update:protocol-filter="protocolFilter = $event"
                @update:region-filter="regionFilter = $event"
                @update:view-mode="viewMode = $event"
                @update:show-processed="showProcessed = $event"
            />

            <!-- 节点列表 -->
            <div
                class="flex-1 overflow-hidden bg-transparent"
                :class="{ 'pb-24 sm:pb-28': pickingMode }"
                style="min-height: 0"
            >
                <div class="h-full overflow-y-auto">
                    <!-- 加载状态 -->
                    <div v-if="loading" class="flex h-64 items-center justify-center">
                        <div
                            class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131515] px-8 py-8 text-center shadow-none"
                        >
                            <div
                                class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-500"
                            ></div>
                            <p class="mt-3 text-xs text-zinc-500">
                                {{ t('nodePreview.loadingNodes') }}
                            </p>
                        </div>
                    </div>

                    <!-- 错误状态 -->
                    <div v-else-if="error" class="flex h-64 items-center justify-center">
                        <div
                            class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131515] px-8 py-8 text-center shadow-none"
                        >
                            <div
                                class="flex items-center justify-center gap-2 text-sm text-red-500"
                            >
                                <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                                <span>{{ error }}</span>
                            </div>
                            <button
                                @click="loadNodes"
                                class="mt-4 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-xs font-medium text-zinc-100 dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-white"
                            >
                                {{ t('common.retry') }}
                            </button>
                        </div>
                    </div>

                    <!-- 无数据状态 -->
                    <div
                        v-else-if="paginatedNodes.length === 0"
                        class="flex h-64 items-center justify-center"
                    >
                        <div
                            class="rounded-md border border-dashed border-zinc-300 dark:border-zinc-800 bg-transparent px-8 py-8 text-center"
                        >
                            <p class="text-xs text-zinc-500">
                                {{ t('nodePreview.noMatchingNodes') }}
                            </p>
                        </div>
                    </div>

                    <!-- 节点列表/卡片视图 -->
                    <div v-else class="flex h-full flex-col">
                        <!-- 简洁列表视图 (仅大屏桌面端) -->
                        <NodeList
                            v-if="effectiveViewMode === 'list'"
                            :nodes="paginatedNodes"
                            :copied-node-id="copiedNodeId"
                            :parse-node-info="parseNodeInfo"
                            :get-protocol-style="getProtocolStyle"
                            :selection-mode="pickingMode"
                            :selected-urls="selectedUrls"
                            @copy="copyNodeUrl"
                            @toggle-select="toggleNodeSelection"
                        />

                        <!-- 卡片视图 container -->
                        <NodeCard
                            v-else
                            :nodes="paginatedNodes"
                            :copied-node-id="copiedNodeId"
                            :parse-node-info="parseNodeInfo"
                            :get-protocol-style="getProtocolStyle"
                            :selection-mode="pickingMode"
                            :selected-urls="selectedUrls"
                            @copy="copyNodeUrl"
                            @toggle-select="toggleNodeSelection"
                        />
                    </div>
                </div>
            </div>

            <NodePagination
                v-if="!loading && !error"
                :current-page="currentPage"
                :total-pages="totalPages"
                :page-size="pageSize"
                :total-items="filteredTotalCount"
                @go-to-page="goToPage"
            />
        </template>
    </Modal>

    <!-- [New] Floating Selection Bar -->
    <Transition name="slide-up">
        <div
            v-if="show && pickingMode"
            class="fixed bottom-4 left-1/2 z-50 w-[94%] max-w-2xl -translate-x-1/2 sm:bottom-6"
        >
            <div
                class="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-[#171717] p-4 text-zinc-100 shadow-none"
            >
                <div class="flex flex-col">
                    <span
                        class="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold"
                        >{{ t('nodePreview.pickingMode') }}</span
                    >
                    <span class="text-xs font-medium text-zinc-300"
                        >{{ t('nodePreview.selectedNodesPrefix') }}
                        <span class="text-sm font-mono font-bold text-zinc-100">{{
                            selectedUrls.size
                        }}</span>
                        {{ t('nodePreview.selectedNodesSuffix') }}</span
                    >
                </div>
                <div class="flex flex-wrap items-center justify-end gap-2">
                    <button
                        @click="selectAll"
                        class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('actions.selectAll') }}
                    </button>
                    <button
                        @click="clearSelection"
                        class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('common.clear') }}
                    </button>
                    <button
                        @click="handleSaveSelection"
                        class="rounded-md bg-zinc-100 px-4 py-1.5 text-xs font-medium text-zinc-900 shadow-none transition-colors hover:bg-white"
                    >
                        {{ t('nodePreview.saveSelection') }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
    .slide-up-enter-active,
    .slide-up-leave-active {
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .slide-up-enter-from {
        transform: translate(-50%, 100%);
        opacity: 0;
    }
    .slide-up-leave-to {
        transform: translate(-50%, 100%);
        opacity: 0;
    }
</style>
