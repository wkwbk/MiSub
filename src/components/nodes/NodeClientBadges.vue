<script setup>
import { computed } from 'vue';
import { getNodeClientCompatibility } from '@/utils/node-client-compatibility.js';
import { useI18n } from '@/i18n/index.js';
import { useHorizontalScrollFade } from '@/composables/useHorizontalScrollFade.js';

const props = defineProps({
  url: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();

const compatibility = computed(() => getNodeClientCompatibility(props.url));

const { scrollRef, scrollFadeClass, updateScrollFade } = useHorizontalScrollFade({
  enabled: () => props.compact,
  deps: () => compatibility.value.clients.length,
});

const getTooltip = (client) => {
  if (client.supported) {
    return t('clientCompat.supportedTooltip', { client: client.label });
  }
  const reason = client.reasonKey ? t(client.reasonKey, client.reasonParams) : '';
  return t('clientCompat.unsupportedTooltip', {
    client: client.label,
    reason,
  });
};
</script>

<template>
  <div
    v-if="compatibility.clients.length > 0"
    ref="scrollRef"
    :class="compact ? ['flex-nowrap overflow-x-auto no-scrollbar', scrollFadeClass] : 'flex-wrap'"
    class="flex min-w-0 items-center gap-1"
    data-testid="node-client-compatibility"
    @scroll.passive="updateScrollFade"
  >
    <span
      v-for="client in compatibility.clients"
      :key="client.id"
      :class="[
        compact ? 'px-1 py-0 text-xs shrink-0 whitespace-nowrap' : 'px-1.5 py-0.5 text-xs',
        client.supported
          ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
          : 'border-transparent bg-transparent text-fg-muted/60 dark:text-zinc-600 line-through decoration-zinc-400/60 dark:decoration-zinc-600/60',
      ]"
      :data-supported="String(client.supported)"
      :data-testid="`client-badge-${client.id}`"
      :title="getTooltip(client)"
      class="inline-flex items-center gap-1 rounded border font-mono leading-tight select-none transition-colors"
    >
      <span
        :class="client.supported ? 'bg-emerald-500' : 'bg-zinc-400/50 dark:bg-zinc-600/70'"
        class="h-1 w-1 rounded-full shrink-0"
      ></span>
      <span>{{ client.label }}</span>
    </span>
  </div>
</template>
