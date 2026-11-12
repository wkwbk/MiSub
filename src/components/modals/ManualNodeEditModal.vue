<script setup>
    import { computed, ref, watch } from 'vue';
    import Modal from '../forms/Modal.vue';
    import Input from '../ui/Input.vue';
    import GroupSelector from '../ui/GroupSelector.vue'; // Added
    import { useDataStore } from '../../stores/useDataStore.js';
    import { useSubscriptions } from '../../composables/useSubscriptions.js';
    import { useBulkImportLogic, needsServerParsing } from '../../composables/useBulkImportLogic.js';
    import { useManualNodes } from '../../composables/useManualNodes.js';
    import { useI18n } from '../../i18n/index.js';
    import { parseSurgeConfig } from '../../utils/protocolConverter.js';
    import { IMPORT_FILE_ACCEPT, readFilesAsText } from '../../utils/importFile.js';
    import { buildAutoGroupName } from '../../utils/auto-group-name.js';

    const props = defineProps({
        show: Boolean,
        isNew: Boolean,
        editingNode: Object,
        groups: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits(['update:show', 'confirm', 'input-url']);
    const dataStore = useDataStore();
    const { markDirty } = dataStore;
    const { t } = useI18n();

    const { addSubscriptionsFromBulk } = useSubscriptions(markDirty);
    const { addNodesFromBulk } = useManualNodes(markDirty);
    const { handleBulkImport } = useBulkImportLogic({ addSubscriptionsFromBulk, addNodesFromBulk });

    // [文件导入] 新增节点时支持选择本地文件，内容直接填入编辑框，复用多行预览与批量导入流程
    const fileInputRef = ref(null);
    const fileAccept = IMPORT_FILE_ACCEPT;
    const fileNameHint = ref('');
    const isReadingFile = ref(false);

    const openFilePicker = () => {
        fileInputRef.value?.click();
    };

    const onFilePicked = async (event) => {
        const files = event.target.files;
        event.target.value = '';
        if (!files || !files.length || !props.editingNode) return;

        isReadingFile.value = true;
        try {
            const { text, fileCount } = await readFilesAsText(files);
            if (!text.trim()) {
                fileNameHint.value = t('manualNodes.fileImportEmpty');
                return;
            }
            // 合并进编辑框（已有内容则追加），交给既有的多行解析逻辑
            const existing = (props.editingNode.url || '').trim();
            props.editingNode.url = existing ? `${existing}\n${text}` : text;
            fileNameHint.value =
                fileCount > 1
                    ? t('manualNodes.fileImportPickedMulti', { count: fileCount })
                    : files[0].name;

            // 自动填充分组名（用文件名），用户无需手填；已有分组时不覆盖
            if (!(props.editingNode.group || '').trim()) {
                props.editingNode.group = buildAutoGroupName({ fileName: files[0].name });
            }
        } catch (error) {
            console.error('读取文件失败:', error);
            fileNameHint.value = error.message || t('manualNodes.fileImportFailed');
        } finally {
            isReadingFile.value = false;
        }
    };

    // 浮动标签状态
    const nameFocused = ref(false);
    const urlFocused = ref(false);

    // 协议检测
    const getProtocol = (url) => {
        if (!url) return null;
        const lowerUrl = url.toLowerCase().trim();
        if (lowerUrl.startsWith('anytls://')) return { name: 'AnyTLS', color: 'slate' };
        if (lowerUrl.startsWith('v2rayn://')) return { name: 'v2rayN', color: 'blue' };
        if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://'))
            return { name: 'HY2', color: 'purple' };
        if (lowerUrl.startsWith('hysteria://') || lowerUrl.startsWith('hy://'))
            return { name: 'Hysteria', color: 'fuchsia' };
        if (lowerUrl.startsWith('ssr://')) return { name: 'SSR', color: 'rose' };
        if (lowerUrl.startsWith('tuic://')) return { name: 'TUIC', color: 'cyan' };
        if (lowerUrl.startsWith('ss://')) return { name: 'SS', color: 'orange' };
        if (lowerUrl.startsWith('vmess://')) return { name: 'VMess', color: 'teal' };
        if (lowerUrl.startsWith('vless://')) return { name: 'VLess', color: 'blue' };
        if (lowerUrl.startsWith('trojan://')) return { name: 'Trojan', color: 'red' };
        if (lowerUrl.startsWith('socks5://') || lowerUrl.startsWith('socks://'))
            return { name: 'SOCKS5', color: 'lime' };
        if (lowerUrl.startsWith('snell://')) return { name: 'Snell', color: 'indigo' };
        if (lowerUrl.startsWith('naive+')) return { name: 'Naive', color: 'pink' };
        if (lowerUrl.startsWith('http')) return { name: 'HTTP', color: 'green' };
        return null;
    };

    // 从链接提取节点名称
    const extractNodeName = (url) => {
        if (!url) return null;
        try {
            // VMess 特殊处理
            if (url.toLowerCase().startsWith('vmess://')) {
                const decoded = atob(url.slice(8));
                const config = JSON.parse(decoded);
                return config.ps || config.remarks || null;
            }
            // 其他协议尝试从 fragment 或参数中提取
            const hashIndex = url.indexOf('#');
            if (hashIndex !== -1) {
                return decodeURIComponent(url.slice(hashIndex + 1)) || null;
            }
        } catch {
            return null;
        }
        return null;
    };

    // 解析批量导入的节点列表
    const parsedNodes = computed(() => {
        if (!props.editingNode?.url) return [];
        const lines = props.editingNode.url
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        return lines.map((line, index) => {
            const protocol = getProtocol(line);
            const name = extractNodeName(line) || `${t('common.node')} ${index + 1}`;
            return { line, protocol, name, index };
        });
    });

    const isMultiLine = computed(() => {
        return props.isNew && parsedNodes.value.length > 1;
    });

    const validLineCount = computed(() => parsedNodes.value.length);

    // 单行模式下的协议检测
    const singleProtocol = computed(() => {
        if (isMultiLine.value || !props.editingNode?.url) return null;
        return getProtocol(props.editingNode.url);
    });

    // 单行模式下的名称建议
    const suggestedName = computed(() => {
        if (!props.isNew || isMultiLine.value || !props.editingNode?.url) return null;
        return extractNodeName(props.editingNode.url);
    });

    // 应用建议的名称
    const applySuggestedName = () => {
        if (suggestedName.value && props.editingNode) {
            props.editingNode.name = suggestedName.value;
        }
    };

    const handleConfirm = async () => {
        // v2rayn:// 私有分享格式、Clash YAML、sing-box JSON 前端解析不了，
        // 单行粘贴时也要交给后端转成标准 URI，否则会被原样存成一个坏节点
        const rawUrl = (props.editingNode?.url || '').trim();
        const requiresServerParsing = props.isNew && rawUrl && needsServerParsing(rawUrl);

        if (props.isNew && (isMultiLine.value || requiresServerParsing)) {
            // 多行批量导入 / 需后端转换：未填写分组时自动生成一个（用户无需手填）
            let groupName = (props.editingNode.group || '').trim();
            if (!groupName) {
                groupName = buildAutoGroupName();
                props.editingNode.group = groupName;
            }
            await handleBulkImport(props.editingNode.url, groupName);
            emit('update:show', false);
            return;
        }

        // 单行模式下检测 Surge 配置格式并自动转换
        if (props.isNew && !isMultiLine.value && props.editingNode?.url) {
            const surgeNodes = parseSurgeConfig(props.editingNode.url);
            if (surgeNodes && surgeNodes.length === 1) {
                props.editingNode.url = surgeNodes[0].url;
                if (!props.editingNode.name && surgeNodes[0].name) {
                    props.editingNode.name = surgeNodes[0].name;
                }
            }
        }

        emit('confirm');
    };

    // 颜色映射到 Tailwind 类
    const colorMap = {
        red: 'bg-red-500',
        orange: 'bg-orange-500',
        green: 'bg-green-500',
        blue: 'bg-blue-500',
    };

    const protocolColorMap = {
        slate: 'text-slate-500 dark:text-slate-400',
        purple: 'text-purple-500 dark:text-purple-400',
        fuchsia: 'text-fuchsia-500 dark:text-fuchsia-400',
        rose: 'text-rose-500 dark:text-rose-400',
        cyan: 'text-cyan-500 dark:text-cyan-400',
        orange: 'text-orange-500 dark:text-orange-400',
        teal: 'text-teal-500 dark:text-teal-400',
        blue: 'text-blue-500 dark:text-blue-400',
        red: 'text-red-500 dark:text-red-400',
        lime: 'text-lime-500 dark:text-lime-400',
        indigo: 'text-indigo-500 dark:text-indigo-400',
        pink: 'text-pink-500 dark:text-pink-400',
        green: 'text-green-500 dark:text-green-400',
    };
</script>

<template>
    <Modal
        v-if="editingNode"
        :show="show"
        size="2xl"
        @update:show="emit('update:show', $event)"
        @confirm="handleConfirm"
    >
        <template #title>
            <div class="flex items-center gap-3">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-zinc-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                </svg>
                <div>
                    <h3 class="text-base font-semibold text-zinc-100">
                        {{ isNew ? t('manualNodes.addTitle') : t('manualNodes.editTitle') }}
                    </h3>
                    <p
                        v-if="!(isNew && isMultiLine)"
                        class="mt-0.5 text-xs text-zinc-400"
                    >
                        {{ t('manualNodes.modalDescription') }}
                    </p>
                    <p
                        v-if="isNew && isMultiLine"
                        class="text-xs text-zinc-300 mt-0.5 font-medium flex items-center gap-1.5"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        {{ t('manualNodes.validLinksDetected', { count: validLineCount }) }}
                    </p>
                </div>
            </div>
        </template>

        <template #body>
            <div class="space-y-5">
                <!-- 名称和颜色标签 - 两栏布局 -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <!-- 节点名称 -->
                    <div class="relative">
                        <div class="flex flex-col">
                            <label
                                for="node-name"
                                class="text-xs font-semibold text-zinc-400 mb-1.5"
                            >
                                {{ t('manualNodes.nameOptional') }}
                            </label>
                            <Input
                                id="node-name"
                                v-model="editingNode.name"
                                :placeholder="t('manualNodes.namePlaceholderOptional')"
                                @focus="nameFocused = true"
                                @blur="nameFocused = false"
                            >
                                <template #icon>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                        />
                                    </svg>
                                </template>
                            </Input>

                            <!-- 名称建议 -->
                            <div
                                v-if="suggestedName && !editingNode.name"
                                class="mt-1.5 flex items-center gap-1.5"
                            >
                                <span class="text-xs text-zinc-500">{{
                                    t('manualNodes.suggestion')
                                }}</span>
                                <button
                                    @click="applySuggestedName"
                                    class="text-xs text-zinc-200 hover:text-white font-medium flex items-center gap-1 hover:underline"
                                >
                                    {{ suggestedName }}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-3.5 w-3.5"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fill-rule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 分组选择 -->
                    <div class="relative">
                        <div class="flex flex-col">
                            <label
                                for="node-group"
                                class="text-xs font-semibold text-zinc-400 mb-1.5"
                            >
                                {{ t('manualNodes.groupOptional') }}
                            </label>
                            <GroupSelector
                                v-model="editingNode.group"
                                :groups="groups"
                                :placeholder="t('manualNodes.groupPlaceholder')"
                            />
                        </div>
                    </div>
                </div>

                <!-- 节点链接 -->
                <div class="relative group">
                    <!-- [文件导入推荐] 新增节点时，优先引导用户直接上传文件自动识别。
                         选中的文件会写入编辑框，复用既有的多行预览 + 批量导入流程。 -->
                    <div
                        v-if="isNew"
                        class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-zinc-800 bg-transparent px-3 py-2.5"
                    >
                        <div
                            class="flex items-center gap-2 text-xs text-zinc-300"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 shrink-0 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                stroke-width="1.8"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                                />
                            </svg>
                            <span>{{ t('manualNodes.fileImportHint') }}</span>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <input
                                ref="fileInputRef"
                                type="file"
                                multiple
                                class="hidden"
                                :accept="fileAccept"
                                @change="onFilePicked"
                                aria-hidden="true"
                            />
                            <button
                                type="button"
                                class="text-xs font-semibold text-zinc-100 hover:underline"
                                @click="openFilePicker"
                            >
                                {{ t('manualNodes.fileImportPick') }}
                            </button>
                            <span
                                v-if="fileNameHint"
                                class="font-mono text-xs text-zinc-500 max-w-[10rem] truncate"
                                :title="fileNameHint"
                            >
                                {{ fileNameHint }}
                            </span>
                        </div>
                    </div>

                    <div
                        class="relative border rounded-md transition-colors overflow-hidden bg-[#09090b]"
                        :class="[
                            urlFocused
                                ? 'border-zinc-600'
                                : 'border-zinc-800 hover:border-zinc-700',
                        ]"
                    >
                        <!-- 协议检测徽章 - 显示在右上角 -->
                        <div
                            v-if="singleProtocol && !isMultiLine"
                            class="absolute right-3 top-3 z-10 px-2 py-0.5 rounded-md bg-[#0c0c0e] border border-zinc-800"
                        >
                            <span
                                class="font-mono text-xs font-semibold text-zinc-200 uppercase"
                            >
                                {{ singleProtocol.name }}
                            </span>
                        </div>

                        <div class="flex h-full">
                            <div
                                class="py-3 pl-3 flex items-start text-zinc-500 group-focus-within:text-zinc-300 transition-colors pointer-events-none"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-4 w-4 mt-0.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                    />
                                </svg>
                            </div>
                            <textarea
                                id="node-url"
                                v-model="editingNode.url"
                                rows="8"
                                @focus="urlFocused = true"
                                @blur="urlFocused = false"
                                @input="$emit('input-url', $event)"
                                class="flex-1 w-full bg-transparent border-0 focus-visible:ring-0 text-zinc-100 placeholder-zinc-600 text-xs font-mono resize-none py-3 pl-3 pr-20 min-h-[160px]"
                                :placeholder="t('manualNodes.urlPlaceholder')"
                            ></textarea>
                        </div>
                    </div>
                </div>

                <!-- 批量导入预览 -->
                <div v-if="isMultiLine && parsedNodes.length > 0" class="space-y-2">
                    <div class="flex items-center justify-between">
                        <h4
                            class="text-xs font-semibold text-zinc-300 flex items-center gap-2"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 text-zinc-400"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path
                                    fill-rule="evenodd"
                                    d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                            {{ t('manualNodes.importPreview') }}
                        </h4>
                        <span class="font-mono text-xs text-zinc-400">
                            {{ t('manualNodes.nodeCountPreview', { count: parsedNodes.length }) }}
                        </span>
                    </div>
                    <div
                        class="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-[#09090b] divide-y divide-zinc-800"
                    >
                        <div
                            v-for="(node, idx) in parsedNodes.slice(0, 10)"
                            :key="idx"
                            class="flex items-center gap-3 px-3 py-2"
                        >
                            <span class="font-mono text-xs text-zinc-500 w-5 text-right">{{
                                idx + 1
                            }}</span>
                            <span
                                v-if="node.protocol"
                                class="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md border border-zinc-800 bg-transparent text-zinc-300 shrink-0"
                            >
                                {{ node.protocol.name }}
                            </span>
                            <span
                                v-else
                                class="font-mono text-[10px] text-zinc-500 px-1.5 py-0.5 rounded-md border border-zinc-800 bg-transparent shrink-0"
                            >
                                {{ t('manualNodes.unknownProtocol') }}
                            </span>
                            <span class="text-xs text-zinc-200 truncate flex-1">
                                {{ node.name }}
                            </span>
                        </div>
                        <div
                            v-if="parsedNodes.length > 10"
                            class="px-3 py-2 text-center font-mono text-xs text-zinc-500 bg-transparent"
                        >
                            {{ t('manualNodes.moreNodes', { count: parsedNodes.length - 10 }) }}
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
    /* 移除 textarea 默认样式 */
    textarea:focus {
        outline: none;
    }

    /* 自定义滚动条 */
    .max-h-48::-webkit-scrollbar {
        width: 4px;
    }
    .max-h-48::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--color-indigo-500) 30%, transparent);
        border-radius: 2px;
    }
    .max-h-48::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--color-indigo-500) 50%, transparent);
    }
</style>
