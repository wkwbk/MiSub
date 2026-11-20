import { ref } from 'vue';
import { useToastStore } from '@/stores/toast.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { extractNodeName } from '@/lib/utils.js';
import { generateSubscriptionId } from '@/utils/id.js';
import { applyItemTags, collectTags } from '@/utils/tags.js';
import { t } from '@/i18n/index.js';

/**
 * 从现有机场订阅中提取当前所有标签名称。
 */
export function extractSubscriptionTagNames(subscriptions = []) {
  const httpSubs = (subscriptions || []).filter((sub) => isValidSubscriptionUrl(sub?.url));
  return collectTags(httpSubs);
}

/**
 * 校验单行是否为合法的 http:// 或 https:// 订阅链接。
 */
export function isValidSubscriptionUrl(line) {
  if (!/^https?:\/\//i.test(line)) return false;
  try {
    const parsed = new URL(line);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 机场订阅专用批量导入逻辑：
 * 仅处理 http:// / https:// 订阅链接，支持统一设置多标签。
 */
export function useSubscriptionBulkImport({ addSubscriptionsFromBulk } = {}) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const showModal = ref(false);

  const handleSubscriptionBulkImport = (importText, tagsInput = []) => {
    if (!importText || !String(importText).trim()) return;

    const existingUrls = new Set((dataStore.subscriptions || []).map((s) => s.url).filter(Boolean));
    const seenInBatch = new Set();

    const lines = String(importText)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const validSubs = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const line of lines) {
      if (!isValidSubscriptionUrl(line)) {
        invalidCount++;
        continue;
      }
      if (existingUrls.has(line) || seenInBatch.has(line)) {
        duplicateCount++;
        continue;
      }
      seenInBatch.add(line);

      validSubs.push(
        applyItemTags(
          {
            id: generateSubscriptionId(),
            name: extractNodeName(line) || t('bulkImport.unnamed'),
            url: line,
            enabled: true,
            status: 'unchecked',
            exclude: '',
            customUserAgent: '',
            notes: '',
          },
          tagsInput,
        ),
      );
    }

    if (validSubs.length > 0) {
      addSubscriptionsFromBulk(validSubs);
      const parts = [t('bulkImport.importedSubscriptions', { count: validSubs.length })];
      if (duplicateCount > 0) {
        parts.push(t('bulkImport.skippedDuplicates', { count: duplicateCount }));
      }
      if (invalidCount > 0) {
        parts.push(t('subscriptionBulkImport.ignoredInvalid', { count: invalidCount }));
      }
      const [main, ...details] = parts;
      showToast(details.length > 0 ? `${main} (${details.join('，')})` : main, 'success');
    } else if (duplicateCount > 0) {
      showToast(t('subscriptionBulkImport.allDuplicates', { count: duplicateCount }), 'info');
    } else if (invalidCount > 0) {
      showToast(
        t('subscriptionBulkImport.noValidSubscriptionsWithInvalid', {
          count: invalidCount,
        }),
        'warning',
      );
    } else {
      showToast(t('subscriptionBulkImport.noValidSubscriptions'), 'warning');
    }

    showModal.value = false;
  };

  return {
    showModal,
    handleSubscriptionBulkImport,
  };
}
