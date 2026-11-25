<script setup>
import { computed, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { Layers } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import TagInput from '@/components/ui/TagInput.vue';
import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';
import FormatDetector from '@/components/modals/SubscriptionImport/FormatDetector.vue';
import ImportForm from '@/components/modals/SubscriptionImport/ImportForm.vue';
import FileImport from '@/components/modals/SubscriptionImport/FileImport.vue';
import ParseResult from '@/components/modals/SubscriptionImport/ParseResult.vue';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { extractSubscriptionTagNames } from '@/composables/useSubscriptionBulkImport.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { api, APIError } from '@/lib/http.js';
import { handleError } from '@/utils/error-handler.js';
import { generateNodeId } from '@misub/core/utils/id.js';
import { readFilesAsText } from '@/utils/import-file.js';
import { buildAutoTagName } from '@/utils/auto-tag-name.js';
import { applyItemTags, normalizeTagList } from '@/utils/tags.js';
import { cleanNodeUrl } from '@/lib/utils.js';

const { t } = useI18n();
const isDev = import.meta.env.DEV;

const activePinia = getActivePinia();
const dataStore = activePinia ? useDataStore() : null;
const toastStore = activePinia ? useToastStore() : null;
const { manualNodeTags } = dataStore ? useManualNodes(dataStore.markDirty) : { manualNodeTags: computed(() => []) };

const props = defineProps({
  show: Boolean,
  /**
   * 导入模式：
   * - 'bulk': 混合批量粘贴或文件上传（首页 Dashboard 使用）
   * - 'nodes': 订阅 URL / 文件解析导入手动节点（手动节点页使用）
   * - 'subscriptions': 批量机场订阅链接导入（机场订阅页使用）
   */
  mode: {
    type: String,
    default: 'bulk',
    validator: (value) => ['bulk', 'nodes', 'subscriptions'].includes(value),
  },
  addNodesFromBulk: {
    type: Function,
    default: null,
  },
  tags: {
    type: Array,
    default: null,
  },
  initialTab: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:show', 'import', 'files-imported']);

const resolveDefaultTab = () => {
  if (props.initialTab) return props.initialTab;
  if (props.mode === 'nodes') return 'url';
  return 'text';
};

const activeTab = ref(resolveDefaultTab());
const importText = ref('');
const subscriptionUrl = ref('');
const selectedTags = ref([]);

const isProcessing = ref(false);
const parseStatus = ref('');
const errorMessage = ref('');
const successMessage = ref('');

const isNodesMode = computed(() => props.mode === 'nodes');
const isSubscriptionsMode = computed(() => props.mode === 'subscriptions');

const subscriptionTagNames = computed(() => extractSubscriptionTagNames(dataStore?.subscriptions || []));

const tagSuggestions = computed(() => {
  if (Array.isArray(props.tags)) return props.tags;
  if (isSubscriptionsMode.value) return subscriptionTagNames.value;
  return manualNodeTags.value || [];
});

const modalTitle = computed(() => {
  if (isNodesMode.value) return t('importNodes.title');
  if (isSubscriptionsMode.value) return t('subscriptionBulkImport.title');
  return t('bulkImport.title');
});

const modalDescription = computed(() => {
  if (isSubscriptionsMode.value) return t('subscriptionBulkImport.description');
  if (props.mode === 'bulk') return t('bulkImport.description');
  return '';
});

const tagsLabel = computed(() => {
  if (isNodesMode.value) return t('importNodes.targetTags');
  if (isSubscriptionsMode.value) return t('subscriptionBulkImport.tagsLabel');
  return t('bulkImport.tagsLabel');
});

const tagsPlaceholder = computed(() => {
  if (isNodesMode.value) return t('importNodes.targetTagsPlaceholder');
  if (isSubscriptionsMode.value) return t('subscriptionBulkImport.tagsPlaceholder');
  return t('manualNodes.tagsPlaceholder');
});

const textPlaceholder = computed(() =>
  isSubscriptionsMode.value
    ? 'https://example.com/api/v1/client/subscribe?token=...\nhttp://sub.example.com/link/...'
    : 'http://...\nhttps://...\nvmess://...\nvless://...\ntrojan://...',
);

const resetState = () => {
  importText.value = '';
  subscriptionUrl.value = '';
  selectedTags.value = [];
  activeTab.value = resolveDefaultTab();
  isProcessing.value = false;
  parseStatus.value = '';
  errorMessage.value = '';
  successMessage.value = '';
};

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      resetState();
    } else {
      activeTab.value = resolveDefaultTab();
    }
  },
);

watch(
  () => props.mode,
  () => {
    activeTab.value = resolveDefaultTab();
  },
);

const showToast = (msg, type) => {
  toastStore?.showToast?.(msg, type);
};

const normalizeAndDedupeParsedNodes = (backendNodes, targetTags, applyTagsDirectly = false) => {
  const mapped = (backendNodes || []).map((node) => {
    const base = {
      id: generateNodeId(),
      name: node.name || 'Unknown',
      url: cleanNodeUrl(node.url),
      enabled: true,
      protocol: node.protocol || 'unknown',
      source: 'import',
    };
    return applyTagsDirectly ? applyItemTags(base, targetTags) : base;
  });

  const uniqueNodes = mapped.filter((node, index, self) => index === self.findIndex((n) => n.url === node.url));
  return {
    uniqueNodes,
    duplicateCount: mapped.length - uniqueNodes.length,
  };
};

const commitParsedNodes = (backendNodes, targetTags, sourceLabel, { applyTagsDirectly = false } = {}) => {
  const normalizedTags = normalizeTagList(targetTags);
  const { uniqueNodes, duplicateCount } = normalizeAndDedupeParsedNodes(
    backendNodes,
    normalizedTags,
    applyTagsDirectly,
  );
  if (uniqueNodes.length === 0) return false;

  if (typeof props.addNodesFromBulk === 'function') {
    props.addNodesFromBulk(uniqueNodes, normalizedTags);
  }
  emit('files-imported', uniqueNodes, normalizedTags);

  const successMsg =
    t('importNodes.addedNodes', { count: uniqueNodes.length }) +
    (normalizedTags.length > 0 ? t('importNodes.addedWithTags', { tags: normalizedTags.join(', ') }) : '') +
    (duplicateCount > 0 ? t('importNodes.dedupedSuffix', { count: duplicateCount }) : '');

  successMessage.value = successMsg;
  showToast(successMsg, 'success');
  if (isDev) {
    console.debug(`[Import] ${sourceLabel}: ${uniqueNodes.length} unique nodes, ${duplicateCount} duplicates`);
  }

  setTimeout(() => {
    emit('update:show', false);
  }, 2000);
  return true;
};

const handleTextConfirm = () => {
  if (activeTab.value !== 'text' || !importText.value.trim()) return;
  let tags = normalizeTagList(selectedTags.value);
  if (!isSubscriptionsMode.value && tags.length === 0) {
    const autoTag = buildAutoTagName();
    tags = autoTag ? [autoTag] : [];
  }
  selectedTags.value = tags;
  emit('import', importText.value, tags);
  importText.value = '';
  selectedTags.value = [];
  if (isSubscriptionsMode.value) {
    emit('update:show', false);
  } else {
    setTimeout(() => {
      emit('update:show', false);
    }, 1000);
  }
};

const handleFiles = async (fileList) => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  parseStatus.value = t('importNodes.readingFile');

  try {
    let targetTags = normalizeTagList(selectedTags.value);
    if (targetTags.length === 0 && fileList?.length) {
      const autoTag = buildAutoTagName({ fileName: fileList[0].name });
      targetTags = autoTag ? [autoTag] : [];
      selectedTags.value = targetTags;
    }

    const { text, fileCount } = await readFilesAsText(fileList);
    if (!text.trim()) {
      throw new Error(t('importNodes.emptyFile'));
    }

    parseStatus.value = t('importNodes.parsingFiles', { count: fileCount });
    const parseResult = await api.post('/api/parse_subscription', { content: text });

    if (!parseResult.success) {
      throw new Error(parseResult.error || t('importNodes.parseFileFailed'));
    }

    const backendNodes = parseResult.data?.nodes || [];
    if (backendNodes.length === 0) {
      parseStatus.value = '';
      throw new Error(t('importNodes.noValidNodesFromFile'));
    }

    parseStatus.value = '';
    commitParsedNodes(backendNodes, targetTags, 'File upload', {
      applyTagsDirectly: !isNodesMode.value,
    });
  } catch (error) {
    console.error('批量文件导入失败:', error);
    if (isNodesMode.value) {
      handleError(error, 'File Import Error', { parseStatus: parseStatus.value });
    }
    parseStatus.value = '';
    errorMessage.value = error.message || t('importNodes.failed');
    showToast(t('importNodes.failedWithMessage', { message: error.message }), 'error');
  } finally {
    isProcessing.value = false;
  }
};

const isValidHttpUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const importSubscriptionUrl = async () => {
  if (isProcessing.value) return;
  const targetTags = [...selectedTags.value];

  if (!isValidHttpUrl(subscriptionUrl.value)) {
    errorMessage.value = t('importNodes.invalidUrl');
    return;
  }

  isProcessing.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  parseStatus.value = t('importNodes.fetchingSubscription');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let responseData;
    try {
      responseData = await api.post(
        '/api/fetch_external_url',
        {
          url: subscriptionUrl.value,
          timeout: 15000,
        },
        { signal: controller.signal },
      );
    } catch (error) {
      if (error instanceof APIError) {
        const errorMsg = error.data?.error || error.data?.message || error.message || `HTTP ${error.status}`;
        if (error.status === 408 || errorMsg.includes('timeout')) {
          throw new Error(t('importNodes.requestTimeout'));
        } else if (error.status === 413 || errorMsg.includes('too large')) {
          throw new Error(t('importNodes.contentTooLarge'));
        } else if (errorMsg.includes('DNS')) {
          throw new Error(t('importNodes.dnsFailed'));
        } else if (error.status >= 500) {
          throw new Error(t('importNodes.serverError'));
        }
        throw new Error(errorMsg);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!responseData.success) {
      throw new Error(responseData.error || t('importNodes.fetchFailed'));
    }

    parseStatus.value = t('importNodes.parsingSubscription');
    const parseResult = await api.post('/api/parse_subscription', {
      content: responseData.content,
    });

    if (!parseResult.success) {
      throw new Error(parseResult.error || t('importNodes.parseSubscriptionFailed'));
    }

    const backendNodes = parseResult.data?.nodes || [];
    if (backendNodes.length > 0) {
      commitParsedNodes(backendNodes, targetTags, 'URL import');
    } else {
      parseStatus.value = '';
      throw new Error(t('importNodes.noValidNodesFromSubscription'));
    }
  } catch (error) {
    console.error('导入订阅失败:', error);
    handleError(error, 'Subscription Import Error', {
      url: subscriptionUrl.value,
      parseStatus: parseStatus.value,
    });
    errorMessage.value = error.message || t('importNodes.failed');
    showToast(t('importNodes.failedWithMessage', { message: error.message }), 'error');
  } finally {
    isProcessing.value = false;
  }
};

const handleModalConfirm = () => {
  if (activeTab.value === 'url') {
    importSubscriptionUrl();
  } else if (activeTab.value === 'text') {
    handleTextConfirm();
  }
};
</script>

<template>
  <Modal
    :close-on-confirm="isSubscriptionsMode ? false : true"
    :confirm-disabled="isSubscriptionsMode ? !importText.trim() : false"
    :show="show"
    :size="isNodesMode ? undefined : '2xl'"
    @confirm="handleModalConfirm"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <template v-if="isNodesMode">
        {{ modalTitle }}
      </template>
      <div v-else class="flex items-center gap-3">
        <Layers class="h-5 w-5 text-fg-muted shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ modalTitle }}
          </h3>
          <p v-if="modalDescription" class="mt-0.5 text-xs text-fg-muted">
            {{ modalDescription }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <button
        class="px-4 py-2 border border-line bg-transparent hover:bg-hover text-fg-muted hover:text-fg font-medium text-xs rounded-md transition-colors"
        type="button"
        @click="emit('update:show', false)"
      >
        {{ t('actions.cancel') }}
      </button>
      <button
        v-if="activeTab === 'url'"
        :disabled="isProcessing || !subscriptionUrl.trim()"
        class="px-4 py-2 bg-accent hover:opacity-90 text-accent-fg font-semibold text-xs rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        @click="importSubscriptionUrl"
      >
        {{ t('actions.import') }}
      </button>
      <button
        v-else-if="activeTab === 'text'"
        :disabled="isSubscriptionsMode && !importText.trim()"
        class="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none text-accent-fg font-semibold text-xs rounded-md transition-colors"
        type="button"
        @click="handleTextConfirm"
      >
        {{ t('actions.confirm') }}
      </button>
    </template>

    <template #body>
      <div :class="isNodesMode ? 'space-y-4' : 'space-y-5'">
        <!-- 来源 Tab 切换（subscriptions 仅文本批量模式无需切换） -->
        <div
          v-if="!isSubscriptionsMode"
          class="grid grid-cols-2 divide-x divide-line-subtle border border-line rounded-md overflow-hidden bg-inset"
        >
          <button
            v-if="isNodesMode"
            :class="
              activeTab === 'url'
                ? 'bg-accent text-accent-fg font-semibold'
                : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="py-1.5 text-xs font-medium transition-colors"
            type="button"
            @click="activeTab = 'url'"
          >
            {{ t('importNodes.subscriptionUrl') }}
          </button>
          <button
            v-else
            :class="
              activeTab === 'text'
                ? 'bg-accent text-accent-fg font-semibold'
                : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="py-1.5 text-xs font-medium transition-colors"
            type="button"
            @click="activeTab = 'text'"
          >
            {{ t('importNodes.tabPaste') }}
          </button>
          <button
            :class="
              activeTab === 'file'
                ? 'bg-accent text-accent-fg font-semibold'
                : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="py-1.5 text-xs font-medium transition-colors"
            type="button"
            @click="activeTab = 'file'"
          >
            {{ t('importNodes.tabFile') }}
          </button>
        </div>

        <div class="relative">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-fg-muted mb-1 block">
              {{ tagsLabel }}
            </label>
            <TagInput
              v-model="selectedTags"
              :placeholder="tagsPlaceholder"
              :suggestions="tagSuggestions"
              class="w-full"
            />
          </div>
        </div>

        <template v-if="activeTab === 'url'">
          <FormatDetector />
          <ImportForm
            :is-loading="isProcessing"
            :subscription-url="subscriptionUrl"
            @submit="importSubscriptionUrl"
            @update:subscription-url="subscriptionUrl = $event"
          />
          <ParseResult
            :error-message="errorMessage"
            :is-loading="isProcessing"
            :parse-status="parseStatus"
            :success-message="successMessage"
          />
        </template>

        <div v-else-if="activeTab === 'text'" class="relative group space-y-1.5">
          <LineNumberTextarea v-model="importText" :placeholder="textPlaceholder" :rows="8" />
          <p class="text-xs text-fg-subtle">
            {{ isSubscriptionsMode ? t('subscriptionBulkImport.helper') : t('bulkImport.helper') }}
          </p>
        </div>

        <FileImport
          v-else
          :error-message="errorMessage"
          :is-processing="isProcessing"
          :parse-status="parseStatus"
          :success-message="successMessage"
          @files="handleFiles"
        />
      </div>
    </template>
  </Modal>
</template>
