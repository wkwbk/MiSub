<script setup>
import { useI18n } from '@/i18n/index.js';
import { ref, watch } from 'vue';
import { useToastStore } from '@/stores/toast.js';
import Modal from '@/components/forms/Modal.vue';
import { handleError } from '@/utils/errorHandler.js';
import { generateNodeId } from '@/utils/id.js';
import { api, APIError } from '@/lib/http.js';
import FormatDetector from '@/components/modals/SubscriptionImport/FormatDetector.vue';
import ImportForm from '@/components/modals/SubscriptionImport/ImportForm.vue';
import FileImport from '@/components/modals/SubscriptionImport/FileImport.vue';
import ParseResult from '@/components/modals/SubscriptionImport/ParseResult.vue';
import TagInput from '@/components/ui/TagInput.vue';
import { readFilesAsText } from '@/utils/importFile.js';
import { buildAutoTagName } from '@/utils/auto-tag-name.js';
import { normalizeTagList } from '@/utils/tags.js';
import { cleanNodeUrl } from '@/lib/utils.js';

const { t } = useI18n();

const isDev = import.meta.env.DEV;

const props = defineProps({
  show: Boolean,
  addNodesFromBulk: Function,
  tags: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['update:show']);

const activeTab = ref('url'); // 'url' | 'file'
const subscriptionUrl = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const parseStatus = ref('');
const selectedTags = ref([]);

const toastStore = useToastStore();

watch(
  () => props.show,
  (newVal) => {
    if (!newVal) {
      subscriptionUrl.value = '';
      selectedTags.value = [];
      errorMessage.value = '';
      successMessage.value = '';
      parseStatus.value = '';
      isLoading.value = false;
      activeTab.value = 'url';
    }
  },
);

const commitParsedNodes = (backendNodes, targetTags, sourceLabel) => {
  const normalizedTags = normalizeTagList(targetTags);
  const nodes = (backendNodes || []).map((node) => ({
    id: generateNodeId(),
    name: node.name || 'Unknown',
    url: cleanNodeUrl(node.url),
    enabled: true,
    protocol: node.protocol || 'unknown',
    source: 'import',
  }));

  if (nodes.length === 0) return false;

  const uniqueNodes = nodes.filter((node, index, self) => index === self.findIndex((n) => n.url === node.url));
  const duplicateCount = nodes.length - uniqueNodes.length;

  props.addNodesFromBulk(uniqueNodes, normalizedTags);

  const successMsg =
    t('importNodes.addedNodes', { count: uniqueNodes.length }) +
    (normalizedTags.length > 0 ? t('importNodes.addedWithTags', { tags: normalizedTags.join(', ') }) : '') +
    (duplicateCount > 0 ? t('importNodes.dedupedSuffix', { count: duplicateCount }) : '');

  successMessage.value = successMsg;
  toastStore.showToast(successMsg, 'success');
  if (isDev) {
    console.debug(`[Import] ${sourceLabel}: ${uniqueNodes.length} unique nodes, ${duplicateCount} duplicates`);
  }

  setTimeout(() => {
    emit('update:show', false);
  }, 2000);
  return true;
};

const importFiles = async (fileList) => {
  if (normalizeTagList(selectedTags.value).length === 0 && fileList?.length) {
    const autoTag = buildAutoTagName({ fileName: fileList[0].name });
    selectedTags.value = autoTag ? [autoTag] : [];
  }
  const targetTags = [...selectedTags.value];
  errorMessage.value = '';
  successMessage.value = '';
  isLoading.value = true;

  try {
    parseStatus.value = t('importNodes.readingFile');
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
    commitParsedNodes(backendNodes, targetTags, 'File upload');
  } catch (error) {
    console.error('文件导入失败:', error);
    handleError(error, 'File Import Error', { parseStatus: parseStatus.value });
    parseStatus.value = '';
    errorMessage.value = error.message || t('importNodes.failed');
    toastStore.showToast(t('importNodes.failedWithMessage', { message: error.message }), 'error');
  } finally {
    isLoading.value = false;
  }
};

/**
 * 验证URL格式
 */
const isValidUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * 导入订阅
 */
const importSubscription = async () => {
  const targetTags = [...selectedTags.value];

  // 验证URL
  if (!isValidUrl(subscriptionUrl.value)) {
    errorMessage.value = t('importNodes.invalidUrl');
    return;
  }

  isLoading.value = true;
  parseStatus.value = t('importNodes.fetchingSubscription');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒超时

    let responseData;
    try {
      responseData = await api.post(
        '/api/fetch_external_url',
        {
          url: subscriptionUrl.value,
          timeout: 15000,
        },
        {
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error instanceof APIError) {
        const errorMsg = error.data?.error || error.data?.message || error.message || `HTTP ${error.status}`;

        // 根据错误类型提供友好的错误信息
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

    // [重构] 调用后端解析API
    const parseResult = await api.post('/api/parse_subscription', {
      content: responseData.content,
    });

    if (!parseResult.success) {
      throw new Error(parseResult.error || t('importNodes.parseSubscriptionFailed'));
    }

    const backendNodes = parseResult.data.nodes || [];

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
    toastStore.showToast(t('importNodes.failedWithMessage', { message: error.message }), 'error');
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Modal
    :show="show"
    @confirm="activeTab === 'url' ? importSubscription() : null"
    @update:show="emit('update:show', $event)"
  >
    <template #title>{{ t('importNodes.title') }}</template>
    <template #footer>
      <button
        class="px-4 py-2 border border-line bg-transparent hover:bg-hover text-fg-muted hover:text-fg font-medium text-xs rounded-md transition-colors"
        @click="emit('update:show', false)"
      >
        {{ t('actions.cancel') }}
      </button>
      <button
        v-if="activeTab === 'url'"
        :disabled="isLoading || !subscriptionUrl.trim()"
        class="px-4 py-2 bg-accent hover:opacity-90 text-accent-fg font-semibold text-xs rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        @click="importSubscription"
      >
        {{ t('actions.import') }}
      </button>
    </template>
    <template #body>
      <div class="space-y-4">
        <!-- 来源切换 -->
        <div
          class="grid grid-cols-2 divide-x divide-line-subtle border border-line rounded-md overflow-hidden bg-inset"
        >
          <button
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

        <!-- Tag Input -->
        <div class="relative">
          <label class="text-xs font-semibold text-fg-muted mb-1.5 block">
            {{ t('importNodes.targetTags') }}
          </label>
          <TagInput
            v-model="selectedTags"
            :placeholder="t('importNodes.targetTagsPlaceholder')"
            :suggestions="tags"
            class="w-full"
          />
        </div>

        <template v-if="activeTab === 'url'">
          <FormatDetector />
          <ImportForm
            :is-loading="isLoading"
            :subscription-url="subscriptionUrl"
            @submit="importSubscription"
            @update:subscription-url="subscriptionUrl = $event"
          />
          <ParseResult
            :error-message="errorMessage"
            :is-loading="isLoading"
            :parse-status="parseStatus"
            :success-message="successMessage"
          />
        </template>

        <FileImport
          v-else
          :error-message="errorMessage"
          :is-processing="isLoading"
          :parse-status="parseStatus"
          :success-message="successMessage"
          @files="importFiles"
        />
      </div>
    </template>
  </Modal>
</template>
