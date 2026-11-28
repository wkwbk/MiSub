<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, SlidersHorizontal } from '@lucide/vue';
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
import DnsOverrideCard from '@/components/settings/sections/ServiceSettings/DnsOverrideCard.vue';
import AdvancedBaseConfigSection from '@/components/settings/sections/ServiceSettings/AdvancedBaseConfigSection.vue';
import MultiSocksCard from '@/components/settings/sections/ServiceSettings/MultiSocksCard.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { useI18n } from '@/i18n/index.js';
import { normalizeAdvancedBaseConfig } from '@misub/core/domain/visual-rules-catalog.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const settingsModel = computed<AppSettingsConfig>({
  get: () => props.settings,
  set: (value: AppSettingsConfig) => emit('update:settings', value),
});

const showAdvanced = ref(false);

const activeBadges = computed(() => {
  const badges: string[] = [];
  if (props.settings?.dnsMode === 'polluted' || String(props.settings?.customDnsOverride || '').trim()) {
    badges.push('DNS');
  }
  const advanced = normalizeAdvancedBaseConfig(props.settings?.advancedBaseConfig);
  if (advanced.enableClashApi) {
    badges.push('Clash API');
  }
  const base = advanced.baseConfig || {};
  if (String(base.singbox || '').trim() || String(base.clash || '').trim() || String(base.surge || '').trim()) {
    badges.push('Base');
  }
  if (props.settings?.defaultMultiSocksEnabled) {
    badges.push('SOCKS5');
  }
  return badges;
});
</script>

<template>
  <div class="space-y-4">
    <TransformCard v-model:settings="settingsModel" />

    <SettingCard
      :description="t('settings.transformAdvancedDesc')"
      :title="t('settings.transformAdvancedTitle')"
      data-testid="transform-advanced-card"
    >
      <template #icon>
        <SlidersHorizontal class="h-4 w-4" />
      </template>

      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="badge in activeBadges"
            :key="badge"
            class="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent"
          >
            {{ badge }}
          </span>
          <button
            :aria-expanded="showAdvanced"
            class="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-inset px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            data-testid="toggle-transform-advanced-btn"
            type="button"
            @click="showAdvanced = !showAdvanced"
          >
            <span>{{
              showAdvanced ? t('settings.transformAdvancedCollapse') : t('settings.transformAdvancedExpand')
            }}</span>
            <ChevronDown :class="{ 'rotate-180': showAdvanced }" class="h-3.5 w-3.5 transition-transform" />
          </button>
        </div>
      </template>

      <div v-if="showAdvanced" class="space-y-6" data-testid="transform-advanced-content">
        <!-- DNS 策略与覆写 -->
        <DnsOverrideCard v-model:settings="settingsModel" />

        <!-- Clash API 与基础配置覆写 -->
        <div class="border-t border-line pt-5">
          <AdvancedBaseConfigSection v-model:settings="settingsModel" />
        </div>

        <!-- Mihomo 多端口 SOCKS5 -->
        <div class="border-t border-line pt-5">
          <MultiSocksCard v-model:settings="settingsModel" />
        </div>
      </div>
    </SettingCard>
  </div>
</template>
