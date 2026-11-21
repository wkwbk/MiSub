<script setup>
import { useI18n } from '@/i18n/index.js';
import { computed, markRaw } from 'vue';
import { Box, Code2, Link2, Monitor, Send, Zap } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useToastStore } from '@/stores/toast';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  profile: Object,
  token: String,
});

const emit = defineEmits(['update:show']);
const { showToast } = useToastStore();

const close = () => {
  emit('update:show', false);
};

const identifier = computed(() => {
  if (!props.profile) return '';
  return props.profile.customId || props.profile.id;
});

const baseUrl = computed(() => {
  if (!props.token || props.token === 'auto' || !props.token.trim()) return '';
  return `${window.location.origin}/${props.token}/${identifier.value}`;
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
