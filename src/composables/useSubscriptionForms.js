import { ref } from 'vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { applyItemTags, getItemTags } from '@/utils/tags.js';
import { generateSubscriptionId } from '@misub/core/utils/id.js';
import { t } from '@/i18n/index.js';

const isDev = import.meta.env.DEV;

export function useSubscriptionForms({ addSubscription, updateSubscription }) {
  const { showToast } = useToastStore();
  const showModal = ref(false);
  const isNew = ref(false);
  const editingSubscription = ref(null);

  const openAdd = () => {
    isNew.value = true;
    editingSubscription.value = {
      name: '',
      url: '',
      enabled: true,
      autoUpdate: true,
      disabledNodes: [],
      exclude: '',
      customUserAgent: '',
      fetchProxy: '',
      enableNodeCache: false,
      plusAsSpace: false,
      excludeTraffic: false,
      website: '',
      notes: '',
      tags: [],
    };
    showModal.value = true;
  };

  const openEdit = (sub) => {
    if (!sub) {
      console.error('UseSubscriptionForms: openEdit called with null/undefined');
      return;
    }
    if (isDev) {
      console.debug('UseSubscriptionForms: openEdit called with', sub);
    }
    isNew.value = false;
    try {
      const cloned = JSON.parse(JSON.stringify(sub));
      cloned.autoUpdate = cloned.autoUpdate !== false;
      cloned.disabledNodes = Array.isArray(cloned.disabledNodes) ? cloned.disabledNodes : [];
      cloned.tags = getItemTags(cloned);
      editingSubscription.value = cloned;
      showModal.value = true;
    } catch (e) {
      console.error('UseSubscriptionForms: Failed to clone subscription', e);
      showToast(t('subscriptions.openEditFailed'), 'error');
    }
  };

  const handleSave = () => {
    if (!editingSubscription.value || !editingSubscription.value.url) {
      showToast(t('subscriptions.urlRequired'), 'error');
      return;
    }
    if (!/^https?:\/\//i.test(editingSubscription.value.url)) {
      showToast(t('subscriptions.invalidUrl'), 'error');
      return;
    }

    const payload = applyItemTags({ ...editingSubscription.value }, editingSubscription.value.tags);

    if (isNew.value) {
      addSubscription({ ...payload, id: generateSubscriptionId() });
    } else {
      updateSubscription(payload);
    }
    showModal.value = false;
  };

  return {
    showModal,
    isNew,
    editingSubscription,
    openAdd,
    openEdit,
    handleSave,
  };
}
