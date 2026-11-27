<script setup lang="ts">
import Input from '@/components/ui/Input.vue';
import Switch from '@/components/ui/Switch.vue';
import TagInput from '@/components/ui/TagInput.vue';
import { computed, ref, watch } from 'vue';
import { Loader2, Zap } from '@lucide/vue';
import { fetchNodeCount } from '@/lib/api.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { extractSubscriptionTagNames } from '@/composables/useSubscriptionBulkImport.js';
import { getItemTags, normalizeTagList } from '@/utils/tags.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import type { SubscriptionItem } from '@misub/core/types.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import type { EditableSubscriptionForm } from '@/composables/useSubscriptionForms.js';

type EditableSub = EditableSubscriptionForm | StoreMisubItem | SubscriptionItem;

const props = defineProps<{
  editingSubscription: EditableSub;
}>();

const emit = defineEmits<{
  'update:editingSubscription': [value: EditableSub];
}>();

const updateField = (patch: Partial<EditableSub>) => {
  emit('update:editingSubscription', {
    ...props.editingSubscription,
    ...patch,
  } as EditableSub);
};

const { showToast } = useToastStore();
const dataStore = useDataStore();
const { t } = useI18n();

const subscriptionTagNames = computed(() => extractSubscriptionTagNames(dataStore.subscriptions || []));

const selectedTags = computed<string[]>({
  get: () => getItemTags(props.editingSubscription),
  set: (val: string[]) => {
    if (!props.editingSubscription) return;
    updateField({ tags: normalizeTagList(val) });
  },
});

const useFetchProxy = ref(false);
const isTestingProxy = ref(false);

watch(
  [
    () => props.editingSubscription?.id,
    () => props.editingSubscription?.configVersion,
    () => Boolean(props.editingSubscription?.fetchProxy),
    () =>
      Boolean(
        props.editingSubscription &&
          !props.editingSubscription.id &&
          !props.editingSubscription.name &&
          !props.editingSubscription.url &&
          !props.editingSubscription.fetchProxy,
      ),
  ],
  ([id, ver, hasProxy, isFreshEmpty], prev) => {
    const recordChanged = !prev || id !== prev[0] || ver !== prev[1];
    const resetEmptyDraft = Boolean(isFreshEmpty && prev && !prev[3]);
    if (recordChanged || hasProxy || resetEmptyDraft) {
      useFetchProxy.value = hasProxy;
    }
  },
  { immediate: true },
);

watch(useFetchProxy, (val) => {
  if (!val && props.editingSubscription?.fetchProxy) {
    updateField({ fetchProxy: '' });
  }
});

const testProxyConnectivity = async (): Promise<void> => {
  if (!props.editingSubscription.fetchProxy || !props.editingSubscription.url) {
    showToast(t('subscriptions.proxyRequired'), 'warning');
    return;
  }
  isTestingProxy.value = true;
  try {
    const res = await fetchNodeCount(
      props.editingSubscription.url,
      props.editingSubscription.fetchProxy,
      props.editingSubscription.plusAsSpace,
      props.editingSubscription.customUserAgent,
      {
        subscriptionId: props.editingSubscription.id,
        persist: false,
      },
    );
    if (res.success) {
      showToast(t('subscriptions.proxyTestSuccess', { count: res.data.count }), 'success');
    } else {
      showToast(t('subscriptions.proxyTestFailed', { message: res.error }), 'error');
    }
  } catch (err: unknown) {
    const message = extractErrorMessage(err);
    showToast(t('subscriptions.proxyTestError', { message }), 'error');
  } finally {
    isTestingProxy.value = false;
  }
};
</script>

<template>
  <!-- 订阅名称 -->
  <div>
    <Input
      id="sub-edit-name"
      :model-value="editingSubscription.name"
      :label="t('subscriptions.nameLabel')"
      :placeholder="t('subscriptions.nameAutoPlaceholder')"
      @update:model-value="updateField({ name: String($event ?? '') })"
    />
  </div>

  <!-- 订阅链接 -->
  <div>
    <Input
      id="sub-edit-url"
      :model-value="editingSubscription.url"
      :label="t('subscriptions.urlLabel')"
      class="font-mono"
      placeholder="https://..."
      @update:model-value="updateField({ url: String($event ?? '') })"
    />
  </div>

  <!-- 订阅标签 (可选) -->
  <div>
    <label class="block text-sm font-medium text-fg mb-1.5">
      {{ t('subscriptionBulkImport.tagsLabel') }}
    </label>
    <TagInput
      v-model="selectedTags"
      :placeholder="t('subscriptionBulkImport.tagsPlaceholder')"
      :suggestions="subscriptionTagNames"
    />
  </div>

  <!-- 专属拉取代理 -->
  <div class="pt-3 border-t border-line">
    <div class="flex items-center justify-between mb-2">
      <div>
        <span class="text-sm font-medium text-fg">{{ t('subscriptions.fetchProxyTitle') }}</span>
        <p class="text-xs text-fg-subtle mt-0.5">{{ t('subscriptions.fetchProxyDesc') }}</p>
      </div>
      <Switch v-model="useFetchProxy" />
    </div>

    <div v-if="useFetchProxy" class="mt-3 space-y-2 animate-fade-in">
      <div class="flex gap-2">
        <Input
          id="sub-edit-proxy"
          :model-value="editingSubscription.fetchProxy"
          :placeholder="t('subscriptions.proxyPlaceholder')"
          class="font-mono text-sm flex-1"
          @update:model-value="updateField({ fetchProxy: String($event ?? '') })"
        />
        <button
          :disabled="isTestingProxy || !editingSubscription.fetchProxy || !editingSubscription.url"
          class="h-[38px] px-3.5 bg-transparent border border-line text-fg-muted rounded-md text-xs font-medium hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center whitespace-nowrap"
          type="button"
          @click="testProxyConnectivity"
        >
          <Loader2 v-if="isTestingProxy" class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-fg-muted" />
          <Zap v-else class="w-3.5 h-3.5 mr-1.5" />
          {{ isTestingProxy ? t('subscriptions.testing') : t('subscriptions.testProxy') }}
        </button>
      </div>
      <p class="text-xs text-fg-subtle">
        {{ t('subscriptions.fetchProxyHint') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
