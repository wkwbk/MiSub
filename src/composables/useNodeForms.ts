import { ref } from 'vue';
import { useToastStore } from '@/stores/useToastStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { cleanNodeUrl, extractNodeName } from '@/lib/utils.js';
import { generateNodeId } from '@misub/core/utils/id.js';
import { getItemTags, normalizeTagList } from '@/utils/tags.js';
import { t } from '@/i18n/index.js';

export interface UseNodeFormsOptions {
  addNode: (node: StoreMisubItem) => void;
  updateNode: (node: StoreMisubItem) => void;
}

const isDev = import.meta.env.DEV;

export function useNodeForms({ addNode, updateNode }: UseNodeFormsOptions) {
  const { showToast } = useToastStore();
  const showModal = ref(false);
  const isNew = ref(false);
  const editingNode = ref<StoreMisubItem | null>(null);

  const openAdd = (): void => {
    isNew.value = true;
    editingNode.value = {
      id: generateNodeId(),
      name: '',
      url: '',
      enabled: true,
      tags: [],
      colorTag: null,
    };
    showModal.value = true;
  };

  const openEdit = (node: StoreMisubItem | null | undefined): void => {
    if (!node) {
      console.error('UseNodeForms: openEdit called with null');
      return;
    }
    if (isDev) {
      console.debug('UseNodeForms: openEdit called with', node);
    }
    isNew.value = false;
    editingNode.value = {
      ...node,
      tags: getItemTags(node),
    };
    showModal.value = true;
  };

  const handleUrlInput = (event: Event): void => {
    if (!editingNode.value) return;
    const target = event.target as HTMLInputElement | null;
    const newUrl = target?.value || '';
    if (newUrl && !editingNode.value.name) {
      editingNode.value.name = extractNodeName(newUrl);
    }
  };

  const handleSave = (): void => {
    if (!editingNode.value || !editingNode.value.url) {
      showToast(t('manualNodes.urlRequired'), 'error');
      return;
    }

    editingNode.value.url = cleanNodeUrl(editingNode.value.url);
    editingNode.value.tags = normalizeTagList(editingNode.value.tags);

    if (isNew.value) {
      addNode(editingNode.value);
    } else {
      updateNode(editingNode.value);
    }
    showModal.value = false;
  };

  return {
    showModal,
    isNew,
    editingNode,
    openAdd,
    openEdit,
    handleUrlInput,
    handleSave,
  };
}
