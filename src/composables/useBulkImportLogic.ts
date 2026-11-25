import { ref } from 'vue';
import { HttpUrlStringSchema, ManualNodeUrlSchema, RemoteSubscriptionUrlSchema } from '@misub/core/schemas/entities.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useDataStore } from '@/stores/useDataStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { cleanNodeUrl, extractNodeName } from '@/lib/utils.js';
import { generateNodeId, generateSubscriptionId } from '@misub/core/utils/id.js';
import { applyItemTags, normalizeTagList } from '@/utils/tags.js';
import { parseQuantumultXConfig, parseSurgeConfig } from '@misub/core/protocols/index.js';
import { parseSubscriptionContent } from '@/lib/api.js';
import { t } from '@/i18n/index.js';

export interface UseBulkImportLogicOptions {
  addSubscriptionsFromBulk: (subs: StoreMisubItem[]) => void | Promise<void>;
  addNodesFromBulk: (nodes: StoreMisubItem[], tags?: string[]) => void;
}

export function needsServerParsing(text: string): boolean {
  if (/^v2rayn:\/\//im.test(text)) return true;
  if (/^\s*proxies\s*:/im.test(text)) return true;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && /"outbounds"\s*:/.test(trimmed)) return true;
  return false;
}

export function useBulkImportLogic({ addSubscriptionsFromBulk, addNodesFromBulk }: UseBulkImportLogicOptions) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const showModal = ref(false);

  const convertViaServer = async (importText: string): Promise<string> => {
    try {
      const parsed = await parseSubscriptionContent(importText);
      const converted = (parsed?.data?.nodes || []).map((node) => node?.url).filter(Boolean);
      if (!parsed?.success || converted.length === 0) return importText;

      const keptLines = importText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => HttpUrlStringSchema.safeParse(line).success);

      return [...converted, ...keptLines].join('\n');
    } catch (error: unknown) {
      console.error('[bulk import] 后端解析失败，回退到前端解析:', error);
      return importText;
    }
  };

  const handleBulkImport = async (importText: string, tagsInput: string | string[] = []): Promise<void> => {
    if (!importText) return;

    const normalizedTags = normalizeTagList(tagsInput);

    let text = importText;
    if (needsServerParsing(importText)) {
      text = await convertViaServer(importText);
    }

    const existingUrls = new Set((dataStore.subscriptions || []).map((s) => s.url).filter(Boolean));

    const parsedClientNodes = [...parseSurgeConfig(text), ...parseQuantumultXConfig(text)];

    const lines = text
      .split('\n')
      .map((line) => cleanNodeUrl(line.trim()))
      .filter(Boolean);
    const validSubs: StoreMisubItem[] = [];
    const validNodes: StoreMisubItem[] = [];
    let duplicateCount = 0;

    if (parsedClientNodes.length > 0) {
      parsedClientNodes.forEach((node) => {
        const cleanedUrl = cleanNodeUrl(node.url);
        if (!existingUrls.has(cleanedUrl)) {
          validNodes.push(
            applyItemTags<StoreMisubItem>(
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
                tags: [],
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
          colorTag: null as string | null,
          exclude: '',
          customUserAgent: '',
          notes: '',
          tags: [] as string[],
        },
        normalizedTags,
      );

      if (RemoteSubscriptionUrlSchema.safeParse(line).success) {
        if (!existingUrls.has(line)) {
          validSubs.push({ ...baseItem, id: generateSubscriptionId() });
        } else {
          duplicateCount++;
        }
      } else if (!/^v2rayn:\/\//i.test(line) && ManualNodeUrlSchema.safeParse(line).success) {
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
      await addSubscriptionsFromBulk(validSubs);
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
