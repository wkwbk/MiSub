<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ManualNodeItem } from '@misub/core/types.js';
import { ArrowRightCircle, ClipboardList, CloudUpload, Link2, Tag } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import Input from '@/components/ui/Input.vue';
import TagInput from '@/components/ui/TagInput.vue';
import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { needsServerParsing, useBulkImportLogic } from '@/composables/useBulkImportLogic.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useI18n } from '@/i18n/index.js';
import { parseQuantumultXConfig, parseSurgeConfig } from '@misub/core/protocols/index.js';
import { IMPORT_FILE_ACCEPT, readFilesAsText } from '@/utils/import-file.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { buildAutoTagName } from '@/utils/auto-tag-name.js';
import { normalizeTagList } from '@/utils/tags.js';
import { cleanNodeUrl, extractNodeName } from '@/lib/utils.js';

const props = withDefaults(
  defineProps<{
    show?: boolean;
    isNew?: boolean;
    editingNode?: ManualNodeItem | null;
    tags?: string[];
  }>(),
  {
    show: false,
    isNew: false,
    editingNode: null,
    tags: () => [],
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  'update:editingNode': [value: ManualNodeItem | null];
  confirm: [];
  'input-url': [event: Event];
}>();

const updateEditingNode = (patch: Partial<ManualNodeItem>): ManualNodeItem | null => {
  if (!props.editingNode) return null;
  const nextNode: ManualNodeItem = {
    ...props.editingNode,
    ...patch,
  };
  emit('update:editingNode', nextNode);
  return nextNode;
};
const dataStore = useDataStore();
const { markDirty } = dataStore;
const { t } = useI18n();

const { addSubscriptionsFromBulk } = useSubscriptions(markDirty);
const { addNodesFromBulk } = useManualNodes(markDirty);
const { handleBulkImport } = useBulkImportLogic({ addSubscriptionsFromBulk, addNodesFromBulk });

// [文件导入] 新增节点时支持选择本地文件，内容直接填入编辑框，复用多行预览与批量导入流程
const fileInputRef = ref<HTMLInputElement | null>(null);
const fileAccept = IMPORT_FILE_ACCEPT;
const fileNameHint = ref('');
const isReadingFile = ref(false);

const openFilePicker = () => {
  fileInputRef.value?.click();
};

const onFilePicked = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  input.value = '';
  if (!files || !files.length || !props.editingNode) return;

  isReadingFile.value = true;
  try {
    const { text, fileCount } = await readFilesAsText(Array.from(files));
    if (!text.trim()) {
      fileNameHint.value = t('manualNodes.fileImportEmpty');
      return;
    }
    // 合并进编辑框（已有内容则追加），交给既有的多行解析逻辑
    const existing = (props.editingNode.url || '').trim();
    const nextUrl = existing ? `${existing}\n${text}` : text;
    fileNameHint.value = fileCount > 1 ? t('manualNodes.fileImportPickedMulti', { count: fileCount }) : files[0].name;

    // 自动填充标签（用文件名），用户无需手填；已有标签时不覆盖
    const patch: Partial<ManualNodeItem> = { url: nextUrl };
    if (normalizeTagList(props.editingNode.tags).length === 0) {
      const autoTag = buildAutoTagName({ fileName: files[0].name });
      patch.tags = autoTag ? [autoTag] : [];
    }
    updateEditingNode(patch);
  } catch (error: unknown) {
    console.error('读取文件失败:', error);
    fileNameHint.value = extractErrorMessage(error, t('manualNodes.fileImportFailed'));
  } finally {
    isReadingFile.value = false;
  }
};

// 浮动标签状态
const nameFocused = ref(false);

// 协议检测
const getProtocol = (url?: string) => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase().trim();
  if (lowerUrl.startsWith('anytls://')) return { name: 'AnyTLS', color: 'slate' };
  if (lowerUrl.startsWith('v2rayn://')) return { name: 'v2rayN', color: 'blue' };
  if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://')) return { name: 'HY2', color: 'purple' };
  if (lowerUrl.startsWith('hysteria://') || lowerUrl.startsWith('hy://')) return { name: 'Hysteria', color: 'fuchsia' };
  if (lowerUrl.startsWith('ssr://')) return { name: 'SSR', color: 'rose' };
  if (lowerUrl.startsWith('tuic://')) return { name: 'TUIC', color: 'cyan' };
  if (lowerUrl.startsWith('ss://')) return { name: 'SS', color: 'orange' };
  if (lowerUrl.startsWith('vmess://')) return { name: 'VMess', color: 'teal' };
  if (lowerUrl.startsWith('vless://')) return { name: 'VLess', color: 'blue' };
  if (lowerUrl.startsWith('trojan://')) return { name: 'Trojan', color: 'red' };
  if (lowerUrl.startsWith('socks5://') || lowerUrl.startsWith('socks://')) return { name: 'SOCKS5', color: 'lime' };
  if (lowerUrl.startsWith('snell://')) return { name: 'Snell', color: 'indigo' };
  if (lowerUrl.startsWith('naive+')) return { name: 'Naive', color: 'pink' };
  if (lowerUrl.startsWith('http')) return { name: 'HTTP', color: 'green' };
  return null;
};

// 解析批量导入的节点列表
const parsedNodes = computed(() => {
  if (!props.editingNode?.url) return [];
  const lines = props.editingNode.url
    .split('\n')
    .map((l) => cleanNodeUrl(l.trim()))
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
    updateEditingNode({ name: suggestedName.value });
  }
};

const handleConfirm = async () => {
  // v2rayn:// 私有分享格式、Clash YAML、sing-box JSON 前端解析不了，
  // 单行粘贴时也要交给后端转成标准 URI，否则会被原样存成一个坏节点
  const rawUrl = (props.editingNode?.url || '').trim();
  const requiresServerParsing = props.isNew && rawUrl && needsServerParsing(rawUrl);

  if (props.isNew && props.editingNode && (isMultiLine.value || requiresServerParsing)) {
    // 多行批量导入 / 需后端转换：未填写标签时自动生成一个批次标签
    let targetTags = normalizeTagList(props.editingNode.tags);
    if (targetTags.length === 0) {
      const autoTag = buildAutoTagName();
      targetTags = autoTag ? [autoTag] : [];
      updateEditingNode({ tags: targetTags });
    }
    await handleBulkImport(props.editingNode.url, targetTags);
    emit('update:show', false);
    return;
  }

  // 单行模式下检测 Surge/Quantumult X 配置格式并自动转换，并对节点链接做导入前清洗
  if (!isMultiLine.value && props.editingNode?.url) {
    const patch: Partial<ManualNodeItem> = {
      url: props.editingNode.url,
    };
    if (props.isNew) {
      const surgeNodes = parseSurgeConfig(props.editingNode.url);
      const clientNodes = surgeNodes.length > 0 ? surgeNodes : parseQuantumultXConfig(props.editingNode.url);
      if (clientNodes && clientNodes.length === 1) {
        patch.url = clientNodes[0].url;
        if (!props.editingNode.name && clientNodes[0].name) {
          patch.name = clientNodes[0].name;
        }
      }
    }
    patch.url = cleanNodeUrl(patch.url || '');
    updateEditingNode(patch);
  }

  emit('confirm');
};
</script>

<template>
  <Modal v-if="editingNode" :show="show" size="2xl" @confirm="handleConfirm" @update:show="emit('update:show', $event)">
    <template #title>
      <div class="flex items-center gap-3">
        <Link2 class="h-5 w-5 text-fg-muted shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ isNew ? t('manualNodes.addTitle') : t('manualNodes.editTitle') }}
          </h3>
          <p v-if="!(isNew && isMultiLine)" class="mt-0.5 text-xs text-fg-muted">
            {{ t('manualNodes.modalDescription') }}
          </p>
          <p v-if="isNew && isMultiLine" class="text-xs text-fg-muted mt-0.5 font-medium flex items-center gap-1.5">
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
              <label class="text-xs font-semibold text-fg-muted mb-1.5" for="node-name">
                {{ t('manualNodes.nameOptional') }}
              </label>
              <Input
                id="node-name"
                :model-value="editingNode.name"
                :placeholder="t('manualNodes.namePlaceholderOptional')"
                @blur="nameFocused = false"
                @focus="nameFocused = true"
                @update:model-value="updateEditingNode({ name: String($event ?? '') })"
              >
                <template #icon>
                  <Tag class="h-4 w-4" />
                </template>
              </Input>

              <!-- 名称建议 -->
              <div v-if="suggestedName && !editingNode.name" class="mt-1.5 flex items-center gap-1.5">
                <span class="text-xs text-fg-subtle">{{ t('manualNodes.suggestion') }}</span>
                <button
                  class="text-xs text-fg-muted hover:text-fg font-medium flex items-center gap-1 hover:underline transition-colors"
                  @click="applySuggestedName"
                >
                  {{ suggestedName }}
                  <ArrowRightCircle class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- 标签选择 -->
          <div class="relative">
            <div class="flex flex-col">
              <label class="text-xs font-semibold text-fg-muted mb-1.5" for="node-tags">
                {{ t('manualNodes.tagsOptional') }}
              </label>
              <TagInput
                :model-value="editingNode.tags"
                :placeholder="t('manualNodes.tagsPlaceholder')"
                :suggestions="tags"
                @update:model-value="updateEditingNode({ tags: $event })"
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
            class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-line bg-transparent px-3 py-2.5"
          >
            <div class="flex items-center gap-2 text-xs text-fg-muted">
              <CloudUpload class="h-4 w-4 shrink-0 text-fg-muted" />
              <span>{{ t('manualNodes.fileImportHint') }}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <input
                ref="fileInputRef"
                :accept="fileAccept"
                aria-hidden="true"
                class="hidden"
                multiple
                type="file"
                @change="onFilePicked"
              />
              <button class="text-xs font-semibold text-fg hover:underline" type="button" @click="openFilePicker">
                {{ t('manualNodes.fileImportPick') }}
              </button>
              <span
                v-if="fileNameHint"
                :title="fileNameHint"
                class="font-mono text-xs text-fg-subtle max-w-[10rem] truncate"
              >
                {{ fileNameHint }}
              </span>
            </div>
          </div>

          <LineNumberTextarea
            id="node-url"
            :model-value="editingNode.url"
            :placeholder="t('manualNodes.urlPlaceholder')"
            :rows="8"
            textarea-class="pr-20"
            @input="$emit('input-url', $event)"
            @update:model-value="updateEditingNode({ url: $event })"
          >
            <template #overlay>
              <!-- 协议检测徽章 - 显示在右上角 -->
              <div
                v-if="singleProtocol && !isMultiLine"
                class="absolute right-3 top-3 z-10 px-2 py-0.5 rounded-md bg-surface border border-line"
              >
                <span class="font-mono text-xs font-semibold text-fg uppercase">
                  {{ singleProtocol.name }}
                </span>
              </div>
            </template>
          </LineNumberTextarea>
        </div>

        <!-- 批量导入预览 -->
        <div v-if="isMultiLine && parsedNodes.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-fg-muted flex items-center gap-2">
              <ClipboardList class="h-4 w-4 text-fg-muted" />
              {{ t('manualNodes.importPreview') }}
            </h4>
            <span class="font-mono text-xs text-fg-muted">
              {{ t('manualNodes.nodeCountPreview', { count: parsedNodes.length }) }}
            </span>
          </div>
          <div class="max-h-48 overflow-y-auto rounded-md border border-line bg-inset divide-y divide-line-subtle">
            <div v-for="(node, idx) in parsedNodes.slice(0, 10)" :key="idx" class="flex items-center gap-3 px-3 py-2">
              <span class="font-mono text-xs text-fg-subtle w-5 text-right">{{ Number(idx) + 1 }}</span>
              <span
                v-if="node.protocol"
                class="font-mono text-xs font-semibold uppercase px-1.5 py-0.5 rounded-md border border-line bg-transparent text-fg-muted shrink-0"
              >
                {{ node.protocol.name }}
              </span>
              <span
                v-else
                class="font-mono text-xs text-fg-subtle px-1.5 py-0.5 rounded-md border border-line bg-transparent shrink-0"
              >
                {{ t('manualNodes.unknownProtocol') }}
              </span>
              <span class="text-xs text-fg truncate flex-1">
                {{ node.name }}
              </span>
            </div>
            <div
              v-if="parsedNodes.length > 10"
              class="px-3 py-2 text-center font-mono text-xs text-fg-subtle bg-transparent"
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
</style>
