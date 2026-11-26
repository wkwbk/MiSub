<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';
import { computed, markRaw, ref, watch } from 'vue';
import type { ProfileConfig } from '@misub/core/types.js';
import { Box, Code2, Copy, Download, Link2, Loader2, Monitor, RefreshCw, Send, Zap } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { createShortLink } from '@/lib/api.js';
import { isReservedSubPath, normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import { getProfileShareIdentifier } from '@misub/core/domain/profile-link.js';
import { shadowrocketConfigUrl } from '@misub/core/domain/shadowrocket-links.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    show?: boolean;
    profile?: ProfileConfig | null;
    token?: string | null;
  }>(),
  {
    show: false,
    profile: null,
    token: '',
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();
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
  return getProfileShareIdentifier(props.profile);
});

const subPath = computed(() => normalizeSubPath(props.token || '', 'sub'));

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
    name: t('copyLink.shadowrocketConfig'),
    hint: t('copyLink.shadowrocketConfigHint'),
    type: 'shadowrocket-config',
    icon: markRaw(Zap),
    format: 'shadowrocket-config',
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

const copyToClipboard = async (format: string) => {
  if (!baseUrl.value) {
    showToast(t('copyLink.tokenMissing'), 'error');
    return;
  }

  const link =
    format === 'shadowrocket-config'
      ? shadowrocketConfigUrl(baseUrl.value, props.profile?.name)
      : `${baseUrl.value}${format}`;
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
      const target = (dataStore.profiles as ProfileConfig[]).find((p) => p.id === props.profile?.id);
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
  <Modal :show="show" :show-cancel="false" :show-confirm="false" size="md" @update:show="close">
    <template #title>
      <h3 class="text-base font-semibold text-fg">
        {{ t('copyLink.title') }}
      </h3>
    </template>

    <template #body>
      <div v-if="!baseUrl">
        <div class="flex items-center gap-2 text-red-400 text-xs bg-transparent p-3 rounded-md border border-line">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"></span>
          <span>{{ t('copyLink.tokenMissingHint') }}</span>
        </div>
      </div>
      <div v-else class="space-y-4">
        <div
          v-if="shortLinkEnabled || localShortLink"
          class="p-3.5 rounded-lg border border-line bg-inset/40 space-y-2.5"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
              <Link2 class="h-3.5 w-3.5 text-fg-muted shrink-0" />
              {{ t('copyLink.shortLinkLabel') }}
            </span>
          </div>

          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <template v-if="localShortLink">
              <div
                :title="localShortLink"
                class="flex items-center min-w-0 h-9 px-3 text-xs font-mono text-fg bg-inset border border-line rounded-md select-all overflow-hidden"
                data-testid="short-link-value"
              >
                <span class="truncate">{{ localShortLink }}</span>
              </div>
              <button
                class="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium whitespace-nowrap rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity cursor-pointer"
                type="button"
                @click="copyShortLink"
              >
                <Copy class="h-3.5 w-3.5 shrink-0" />
                <span>{{ t('actions.copy') }}</span>
              </button>
            </template>

            <template v-if="shortLinkEnabled">
              <input
                v-model="customSlug"
                :placeholder="t('copyLink.shortLinkSlugPlaceholder')"
                class="min-w-0 w-full h-9 px-3 text-xs font-mono placeholder:font-sans placeholder:text-fg-subtle text-fg bg-inset border border-line rounded-md focus-visible:outline-hidden focus-visible:border-line-strong transition-colors"
                type="text"
                @keyup.enter="handleCreateShortLink"
              />
              <button
                :disabled="isGeneratingShortLink"
                class="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium whitespace-nowrap rounded-md border border-line bg-transparent text-fg hover:bg-hover hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                type="button"
                @click="handleCreateShortLink"
              >
                <Loader2 v-if="isGeneratingShortLink" class="h-3.5 w-3.5 shrink-0 animate-spin" />
                <RefreshCw v-else-if="localShortLink" class="h-3.5 w-3.5 shrink-0" />
                <span>{{
                  isGeneratingShortLink
                    ? t('copyLink.shortLinkGenerating')
                    : localShortLink
                      ? t('copyLink.shortLinkRegenerate')
                      : t('copyLink.shortLinkGenerate')
                }}</span>
              </button>
            </template>
          </div>
        </div>

        <div class="space-y-2">
          <p class="text-xs text-fg-muted leading-relaxed mb-2.5">
            {{ t('copyLink.formatHint') }}
          </p>

          <div
            v-for="client in clients"
            :key="client.type"
            :class="client.hint ? 'items-start' : 'items-center'"
            class="flex gap-3 p-3 border border-line rounded-md hover:bg-hover hover:border-line-strong cursor-pointer transition-colors group"
            @click="copyToClipboard(client.format)"
          >
            <div
              class="w-8 h-8 shrink-0 rounded-md border border-line bg-transparent flex items-center justify-center text-fg-muted group-hover:text-fg transition-colors"
            >
              <component :is="client.icon" class="h-4 w-4" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2 min-h-8">
                <p class="text-sm font-medium text-fg leading-snug">
                  {{ client.name }}
                </p>
                <button
                  class="shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent-fg bg-accent rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                  type="button"
                >
                  <Copy class="h-3 w-3 shrink-0" />
                  <span>{{ t('actions.copy') }}</span>
                </button>
              </div>

              <p v-if="client.hint" class="mt-0.5 text-xs text-fg-muted leading-relaxed">
                {{ client.hint }}
              </p>

              <a
                v-if="client.type === 'shadowrocket-config'"
                :href="shadowrocketConfigUrl(baseUrl, profile?.name)"
                class="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-inset/60 px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:border-line-strong hover:bg-inset transition-colors"
                download
                @click.stop
              >
                <Download class="h-3.5 w-3.5 shrink-0" />
                <span>{{ t('copyLink.downloadShadowrocketConfig') }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>
