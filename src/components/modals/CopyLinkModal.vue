<script setup>
import { useI18n } from '@/i18n/index.js';
import { computed, markRaw, ref, watch } from 'vue';
import { Box, Code2, Copy, Link2, Loader2, Monitor, Send, Zap } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useToastStore } from '@/stores/toast';
import { useSettingsStore } from '@/stores/settings.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { createShortLink } from '@/lib/api.js';
import { isReservedSubPath, normalizeSubPath } from '@shared/reserved-paths.js';

const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  profile: Object,
  token: String,
});

const emit = defineEmits(['update:show']);
const { showToast } = useToastStore();
const settingsStore = useSettingsStore();
const dataStore = useDataStore();

const customSlug = ref('');
const isGeneratingShortLink = ref(false);
const localShortLink = ref('');

const shortLinkEnabled = computed(() =>
  Boolean(settingsStore.config?.shortLink?.enabled && String(settingsStore.config?.shortLink?.apiUrl || '').trim()),
);

watch(
  () => [props.show, props.profile?.id, props.profile?.shortLink],
  () => {
    localShortLink.value = props.profile?.shortLink || '';
    customSlug.value = '';
  },
  { immediate: true },
);

const close = () => {
  emit('update:show', false);
};

const identifier = computed(() => {
  if (!props.profile) return '';
  return props.profile.customId || props.profile.id;
});

const subPath = computed(() => normalizeSubPath(props.token, 'sub'));

const baseUrl = computed(() => {
  if (!identifier.value || /[\s/?#]/.test(subPath.value) || isReservedSubPath(subPath.value)) return '';
  return `${window.location.origin}/${subPath.value}/${identifier.value}`;
});

const clients = computed(() => [
  {
    name: t('copyLink.autoDetect'),
    type: 'default',
    icon: markRaw(Link2),
    format: '',
  },
  {
    name: 'Clash',
    type: 'clash',
    icon: markRaw(Link2),
    format: '?clash',
  },
  {
    name: 'Sing-Box',
    type: 'singbox',
    icon: markRaw(Box),
    format: '?singbox',
  },
  { name: 'Surge', type: 'surge', icon: markRaw(Zap), format: '?surge' },
  { name: 'Loon', type: 'loon', icon: markRaw(Send), format: '?loon' },
  {
    name: 'V2Ray / Base64',
    type: 'base64',
    icon: markRaw(Code2),
    format: '?base64',
  },
  {
    name: 'Quantumult X',
    type: 'quanx',
    icon: markRaw(Monitor),
    format: '?quanx',
  },
]);

const copyToClipboard = async (format) => {
  if (!baseUrl.value) {
    showToast(t('copyLink.tokenMissing'), 'error');
    return;
  }

  const link = `${baseUrl.value}${format}`;
  const copied = await copyTextToClipboard(link);
  if (copied) {
    showToast(t('copyLink.copied'), 'success');
    close();
  } else {
    showToast(t('copyLink.copyFailed'), 'error');
  }
};

const copyShortLink = async () => {
  if (!localShortLink.value) return;
  const copied = await copyTextToClipboard(localShortLink.value);
  showToast(copied ? t('copyLink.shortLinkCopied') : t('copyLink.copyFailed'), copied ? 'success' : 'error');
};

const handleCreateShortLink = async () => {
  if (!baseUrl.value || isGeneratingShortLink.value) return;
  isGeneratingShortLink.value = true;
  try {
    const result = await createShortLink({
      url: baseUrl.value,
      slug: customSlug.value.trim(),
      profileId: props.profile?.id || '',
      saveToProfile: Boolean(props.profile?.id),
    });

    if (!result?.success || !result.shortUrl) {
      showToast(result?.message || result?.error || t('copyLink.shortLinkFailed'), 'error');
      return;
    }

    localShortLink.value = result.shortUrl;
    customSlug.value = '';
    if (result.savedToProfile && props.profile?.id) {
      const target = (dataStore.profiles || []).find((p) => p.id === props.profile.id);
      if (target) {
        target.shortLink = result.shortUrl;
      }
    }
    showToast(t('copyLink.shortLinkCreated'), 'success');
  } finally {
    isGeneratingShortLink.value = false;
  }
};
</script>

<template>
  <Modal :show="show" :show-cancel="false" :show-confirm="false" @update:show="close">
    <template #title>
      <h3 class="text-base font-semibold text-fg">
        {{ t('copyLink.title') }}
      </h3>
    </template>

    <template #body>
      <div v-if="!baseUrl" class="mt-2">
        <div class="flex items-center gap-2 text-red-400 text-xs bg-transparent p-3 rounded-md border border-line">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"></span>
          <span>{{ t('copyLink.tokenMissingHint') }}</span>
        </div>
      </div>
      <div v-else class="space-y-2 mt-2">
        <div
          v-if="shortLinkEnabled || localShortLink"
          class="mb-3 p-3 rounded-md border border-line bg-inset/40 space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
              <Link2 class="h-3.5 w-3.5 text-fg-muted" />
              {{ t('copyLink.shortLinkLabel') }}
            </span>
          </div>

          <div v-if="localShortLink" class="flex items-center gap-1.5">
            <input
              :value="localShortLink"
              class="flex-1 min-w-0 h-8 px-2.5 text-xs font-mono text-fg bg-inset border border-line rounded-md focus-visible:outline-hidden"
              readonly
              type="text"
            />
            <button
              class="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity cursor-pointer"
              type="button"
              @click="copyShortLink"
            >
              <Copy class="h-3.5 w-3.5" />
              <span>{{ t('actions.copy') }}</span>
            </button>
          </div>

          <div v-if="shortLinkEnabled" class="flex items-center gap-1.5">
            <input
              v-model="customSlug"
              :placeholder="t('copyLink.shortLinkSlugPlaceholder')"
              class="flex-1 min-w-0 h-8 px-2.5 text-xs font-mono text-fg bg-inset border border-line rounded-md focus-visible:outline-hidden focus-visible:border-line-strong"
              type="text"
              @keyup.enter="handleCreateShortLink"
            />
            <button
              :disabled="isGeneratingShortLink"
              class="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-line bg-transparent text-fg hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              type="button"
              @click="handleCreateShortLink"
            >
              <Loader2 v-if="isGeneratingShortLink" class="h-3.5 w-3.5 animate-spin" />
              <span>{{
                isGeneratingShortLink
                  ? t('copyLink.shortLinkGenerating')
                  : localShortLink
                    ? t('copyLink.shortLinkRegenerate')
                    : t('copyLink.shortLinkGenerate')
              }}</span>
            </button>
          </div>
        </div>

        <p class="text-xs text-fg-muted mb-3">
          {{ t('copyLink.formatHint') }}
        </p>

        <div
          v-for="client in clients"
          :key="client.type"
          class="flex items-center justify-between p-2.5 border border-line rounded-md hover:bg-hover hover:border-line-strong cursor-pointer transition-colors group"
          @click="copyToClipboard(client.format)"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-md border border-line bg-transparent flex items-center justify-center text-fg-muted group-hover:text-fg transition-colors"
            >
              <component :is="client.icon" class="h-4 w-4" />
            </div>
            <div>
              <p class="text-sm font-medium text-fg">
                {{ client.name }}
              </p>
            </div>
          </div>

          <button
            class="px-2.5 py-1 text-xs font-medium text-accent-fg bg-accent rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
          >
            {{ t('actions.copy') }}
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>
