<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { Moon, Sun } from '@lucide/vue';
import { formatBytes } from '@misub/core/utils/format-utils.js';
import { useThemeStore } from '@/stores/useThemeStore.js';
import { useI18n } from '@/i18n/index.js';
import {
  PORTAL_PAGE_COMPONENT_PLACEHOLDERS,
  PORTAL_PAGE_SLOT_ALIASES,
  parseCustomPageSource,
  renderCustomPageHtml,
} from '@/utils/custom-page-source.js';
import type { SubscriptionPortalPayload } from '@/utils/portal-bootstrap.js';

const props = defineProps<{
  portalData: SubscriptionPortalPayload;
  content?: string;
  css?: string;
}>();

const activePinia = getActivePinia();
const themeStore = activePinia ? useThemeStore() : null;
const { t } = useI18n();

const currentTheme = computed(() => themeStore?.theme ?? 'light');
const toggleTheme = (): void => {
  themeStore?.toggleTheme({ instant: true });
};

const styleId = 'custom-portal-page-styles';
const disableTeleport = ref(false);
const isReady = ref(false);

const removeStyles = (): void => {
  const styleEl = typeof document !== 'undefined' ? document.getElementById(styleId) : null;
  if (styleEl) {
    styleEl.remove();
  }
};

const parsedSource = computed(() => parseCustomPageSource(props.content, props.css));

const renderedHtml = computed(() => {
  const totalBytes = Math.max(0, Number(props.portalData.traffic.total) || 0);
  const usedBytes =
    Math.max(0, Number(props.portalData.traffic.upload) || 0) +
    Math.max(0, Number(props.portalData.traffic.download) || 0);
  const remainingBytes = totalBytes > 0 ? Math.max(0, Number(props.portalData.traffic.remaining) || 0) : 0;
  const remainingPercent =
    totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((remainingBytes / totalBytes) * 100))) : 0;

  const textVars: Record<string, string | number> = {
    version: props.portalData.version || '1.0.0',
    title: props.portalData.title || props.portalData.subName || 'MiSub',
    sub_name: props.portalData.subName || props.portalData.title || 'MiSub',
    notice: props.portalData.notice || '',
    remaining_traffic: totalBytes > 0 ? formatBytes(remainingBytes) : '-',
    used_traffic: totalBytes > 0 ? formatBytes(usedBytes) : '-',
    total_traffic: totalBytes > 0 ? formatBytes(totalBytes) : '-',
    remaining_percent: remainingPercent,
    expire_time: props.portalData.expireText || '-',
    expire_status: props.portalData.expireStatus || '-',
    node_count: props.portalData.nodeCount,
    subscription_url: props.portalData.subscriptionUrl,
    socks_port_count: props.portalData.multiSocks.enabled ? props.portalData.multiSocks.bindings.length : 0,
    socks_listen: props.portalData.multiSocks.listen || '127.0.0.1',
  };

  return renderCustomPageHtml(parsedSource.value.html || '', textVars, {
    componentPlaceholders: PORTAL_PAGE_COMPONENT_PLACEHOLDERS,
    slotAliases: PORTAL_PAGE_SLOT_ALIASES,
  });
});

const hasSlot = (name: string): boolean => renderedHtml.value.includes(`data-slot="${name}"`);

watch(
  renderedHtml,
  async () => {
    isReady.value = false;
    await nextTick();
    isReady.value = true;
  },
  { immediate: true },
);

const injectStyles = (): void => {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = parsedSource.value.css;
};

onMounted(injectStyles);
watch(parsedSource, injectStyles, { deep: true });
onUnmounted(() => {
  disableTeleport.value = true;
  isReady.value = false;
  removeStyles();
});
</script>

<template>
  <div class="custom-portal-renderer">
    <div class="custom-html-container" v-html="renderedHtml"></div>

    <template v-if="isReady">
      <Teleport v-if="hasSlot('overview')" :disabled="disableTeleport" to='[data-slot="overview"]'>
        <slot name="overview"></slot>
      </Teleport>

      <Teleport v-if="hasSlot('quick_import')" :disabled="disableTeleport" to='[data-slot="quick_import"]'>
        <slot name="quick_import"></slot>
      </Teleport>

      <Teleport v-if="hasSlot('multi_socks')" :disabled="disableTeleport" to='[data-slot="multi_socks"]'>
        <slot name="multi_socks"></slot>
      </Teleport>

      <Teleport v-if="hasSlot('theme_toggle')" :disabled="disableTeleport" to='[data-slot="theme_toggle"]'>
        <button
          :aria-label="currentTheme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
          :title="currentTheme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
          class="theme-toggle-btn p-2 rounded-md border border-line bg-surface shadow-none transition-colors hover:bg-hover text-fg"
          type="button"
          @click="toggleTheme"
        >
          <Sun v-if="currentTheme === 'dark'" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
        </button>
      </Teleport>
    </template>
  </div>
</template>

<style>
.custom-portal-renderer {
  width: 100%;
  min-height: 100dvh;
}

.custom-html-container {
  width: 100%;
  min-height: inherit;
}

[data-slot]:empty {
  min-height: 0;
}
</style>
