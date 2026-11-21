import { ref } from 'vue';
import { useToastStore } from '@/stores/toast.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { cleanNodeUrl, extractNodeName } from '@/lib/utils.js';
import { generateNodeId, generateSubscriptionId } from '@/utils/id.js';
import { COMMON_NODE_PROTOCOLS, createProtocolRegex } from '@/constants/node-protocols.js';
import { applyItemTags, normalizeTagList } from '@/utils/tags.js';
import { parseSurgeConfig } from '@/utils/protocol-converter.js';
import { api } from '@/lib/http.js';
import { t } from '@/i18n/index.js';

const BULK_IMPORT_NODE_PROTOCOLS = COMMON_NODE_PROTOCOLS;
const BULK_IMPORT_NODE_REGEX = createProtocolRegex(BULK_IMPORT_NODE_PROTOCOLS, false);

export function needsServerParsing(text) {
  if (/^v2rayn:\/\//im.test(text)) return true;
  if (/^\s*proxies\s*:/im.test(text)) return true;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && /"outbounds"\s*:/.test(trimmed)) return true;
  return false;
}

export function useBulkImportLogic({ addSubscriptionsFromBulk, addNodesFromBulk }) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const showModal = ref(false);

  const convertViaServer = async (importText) => {
    try {
      const parsed = await api.post('/api/parse_subscription', { content: importText });
      const converted = (parsed?.data?.nodes || []).map((node) => node?.url).filter(Boolean);
      if (!parsed?.success || converted.length === 0) return importText;

      const keptLines = importText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^https?:\/\//i.test(line));

      return [...converted, ...keptLines].join('\n');
    } catch (error) {
      console.error('[bulk import] 后端解析失败，回退到前端解析:', error);
      return importText;
    }
  };

  const handleBulkImport = async (importText, tagsInput = []) => {
    if (!importText) return;

    const normalizedTags = normalizeTagList(tagsInput);

    let text = importText;
    if (needsServerParsing(importText)) {
      text = await convertViaServer(importText);
    }

    const existingUrls = new Set((dataStore.subscriptions || []).map((s) => s.url).filter(Boolean));

    const surgeNodes = parseSurgeConfig(text);

    const lines = text
      .split('\n')
      .map((line) => cleanNodeUrl(line.trim()))
      .filter(Boolean);
    const validSubs = [];
    const validNodes = [];
    let duplicateCount = 0;

    if (surgeNodes && surgeNodes.length > 0) {
      surgeNodes.forEach((node) => {
        const cleanedUrl = cleanNodeUrl(node.url);
        if (!existingUrls.has(cleanedUrl)) {
          validNodes.push(
            applyItemTags(
              {
                id: generateNodeId(),
                name: node.name || t('bulkImport.unnamed'),
                url: cleanedUrl,
                enabled: true,
                status: 'unchecked',
                colorTag: null,
                exclude: '',
                customUserAgent: '',
                notes: '',
              },
              normalizedTags,
            ),
          );
        } else {
          duplicateCount++;
        }
      });
    }

    lines.forEach((line) => {
      const baseItem = applyItemTags(
        {
          name: extractNodeName(line) || t('bulkImport.unnamed'),
          url: line,
          enabled: true,
          status: 'unchecked',
          colorTag: null,
          exclude: '',
          customUserAgent: '',
          notes: '',
        },
        normalizedTags,
      );

      if (/^https?:\/\//.test(line) && !BULK_IMPORT_NODE_REGEX.test(line)) {
        if (!existingUrls.has(line)) {
          validSubs.push({ ...baseItem, id: generateSubscriptionId() });
        } else {
          duplicateCount++;
        }
      } else if (BULK_IMPORT_NODE_REGEX.test(line)) {
        const alreadyParsed = validNodes.some((n) => n.url === line);
        if (!alreadyParsed) {
          if (!existingUrls.has(line)) {
            validNodes.push({ ...baseItem, id: generateNodeId() });
          } else {
            duplicateCount++;
          }
        }
      }
    });

    let message = '';

    if (validSubs.length > 0) {
      addSubscriptionsFromBulk(validSubs);
      message += t('bulkImport.importedSubscriptions', { count: validSubs.length }) + ' ';
    }

    if (validNodes.length > 0) {
      addNodesFromBulk(validNodes, normalizedTags);
      message += t('bulkImport.importedNodes', { count: validNodes.length });
    }

    if (message) {
      const trimmedMessage = message.trim();
      showToast(
        duplicateCount > 0
          ? `${trimmedMessage} (${t('bulkImport.skippedDuplicates', { count: duplicateCount })})`
          : trimmedMessage,
        'success',
      );
    } else if (duplicateCount > 0) {
      showToast(t('bulkImport.allDuplicates', { count: duplicateCount }), 'info');
    } else {
      showToast(t('bulkImport.noValidLinks'), 'warning');
    }
    showModal.value = false;
  };

  return {
    showModal,
    handleBulkImport,
  };
}
