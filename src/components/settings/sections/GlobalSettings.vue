<script setup lang="ts">
import { computed } from 'vue';
import type { OperatorRule, ProfilePrefixSettings, RegionOverrideRule } from '@misub/core/types.js';
import { List, Map, SlidersHorizontal } from '@lucide/vue';
import OperatorChain from '@/components/operators/OperatorChain.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { useI18n } from '@/i18n/index.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const buildDefaultPrefixSettings = (): ProfilePrefixSettings => ({
  enableManualNodes: true,
  enableSubscriptions: true,
  manualNodePrefix: 'Manual Node',
  subscriptionPrefix: '',
  prependTagName: false,
});

const defaultPrefixSettings = computed<ProfilePrefixSettings>(() => ({
  ...buildDefaultPrefixSettings(),
  ...props.settings?.defaultPrefixSettings,
}));

const defaultOperators = computed<OperatorRule[]>(() =>
  Array.isArray(props.settings?.defaultOperators) ? props.settings.defaultOperators : [],
);

const regionOverrides = computed<RegionOverrideRule[]>(() =>
  Array.isArray(props.settings?.regionOverrides) ? props.settings.regionOverrides : [],
);

function patchSettings(patch: Partial<AppSettingsConfig>): void {
  emit('update:settings', {
    ...props.settings,
    ...patch,
  });
}

function patchPrefixSettings(patch: Partial<ProfilePrefixSettings>): void {
  patchSettings({
    defaultPrefixSettings: {
      ...defaultPrefixSettings.value,
      ...patch,
    },
  });
}

const prefixToggleOptions = [
  { labelKey: 'profiles.optionEnabled', value: true },
  { labelKey: 'profiles.optionDisabled', value: false },
];

const resolvedPrefixToggleOptions = computed(() =>
  prefixToggleOptions.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  })),
);

const globalSwitchSelects = computed(() => [
  {
    labelKey: 'settings.globalManualNodePrefixSwitch',
    value: defaultPrefixSettings.value.enableManualNodes !== false,
    update: (val: boolean) => patchPrefixSettings({ enableManualNodes: val }),
  },
  {
    labelKey: 'settings.globalSubscriptionPrefixSwitch',
    value: defaultPrefixSettings.value.enableSubscriptions !== false,
    update: (val: boolean) => patchPrefixSettings({ enableSubscriptions: val }),
  },
  {
    labelKey: 'settings.globalFlagEmojiSwitch',
    value: props.settings.enableFlagEmoji !== false,
    update: (val: boolean) => patchSettings({ enableFlagEmoji: val }),
  },
]);

function addRegionOverride(): void {
  patchSettings({
    regionOverrides: [...regionOverrides.value, { pattern: '', region: '美国', flags: 'i' }],
  });
}

function updateRegionOverride(index: number, patch: Partial<RegionOverrideRule>): void {
  const next = regionOverrides.value.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule));
  patchSettings({ regionOverrides: next });
}

function removeRegionOverride(index: number): void {
  patchSettings({
    regionOverrides: regionOverrides.value.filter((_, idx) => idx !== index),
  });
}
</script>

<template>
  <div class="space-y-4">
    <SettingCard
      :description="t('settings.globalNodeSettingsDesc')"
      :title="t('settings.globalNodeSettingsTitle')"
      tone="blue"
    >
      <template #icon>
        <List class="h-4 w-4" />
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <!-- 第一排：手动节点文本前缀 与 开关 -->
        <div>
          <Input
            :label="t('settings.globalManualNodePrefix')"
            :model-value="defaultPrefixSettings.manualNodePrefix"
            @update:model-value="patchPrefixSettings({ manualNodePrefix: String($event ?? '') })"
          />
        </div>

        <div v-for="item in globalSwitchSelects" :key="item.labelKey">
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t(item.labelKey) }}</label>
          <Select
            :model-value="item.value"
            :options="resolvedPrefixToggleOptions"
            @update:model-value="item.update(Boolean($event))"
          />
        </div>
      </div>
    </SettingCard>

    <SettingCard
      :description="t('settings.regionOverridesDesc')"
      :title="t('settings.regionOverridesTitle')"
      tone="purple"
    >
      <template #icon>
        <Map class="h-4 w-4" />
      </template>
      <template #actions>
        <button
          class="shrink-0 whitespace-nowrap rounded-md border border-accent bg-accent px-3.5 py-1.5 text-xs font-semibold leading-5 text-accent-fg transition-colors hover:opacity-90"
          type="button"
          @click="addRegionOverride"
        >
          {{ t('settings.regionOverrideAdd') }}
        </button>
      </template>

      <p v-if="!regionOverrides.length" class="text-xs text-fg-muted">
        {{ t('settings.regionOverridesEmpty') }}
      </p>

      <div v-else class="divide-y divide-line-subtle">
        <div
          v-for="(rule, index) in regionOverrides"
          :key="index"
          class="grid grid-cols-1 gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_160px_96px_auto]"
        >
          <Input
            :label="t('settings.regionOverridePattern')"
            :model-value="rule.pattern"
            :placeholder="t('settings.regionOverridePatternPlaceholder')"
            @update:model-value="updateRegionOverride(index, { pattern: String($event ?? '') })"
          />
          <Input
            :label="t('settings.regionOverrideRegion')"
            :model-value="rule.region"
            :placeholder="t('settings.regionOverrideRegionPlaceholder')"
            @update:model-value="updateRegionOverride(index, { region: String($event ?? '') })"
          />
          <Input
            :label="t('settings.regionOverrideFlags')"
            :model-value="rule.flags"
            placeholder="i"
            @update:model-value="updateRegionOverride(index, { flags: String($event ?? '') })"
          />
          <div class="flex items-end">
            <button
              class="w-full rounded-md border border-red-900/60 bg-transparent px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-950/40"
              type="button"
              @click="removeRegionOverride(index)"
            >
              {{ t('actions.delete') }}
            </button>
          </div>
        </div>
      </div>
    </SettingCard>

    <SettingCard
      :description="t('settings.globalDefaultOperatorsDesc')"
      :title="t('settings.globalDefaultOperatorsTitle')"
      tone="green"
    >
      <template #icon>
        <SlidersHorizontal class="h-4 w-4" />
      </template>
      <template #actions>
        <span
          class="rounded-md border border-line bg-transparent px-2 py-0.5 font-mono text-xs font-medium text-fg-muted"
          >{{ t('settings.globalDefaultBadge') }}</span
        >
      </template>

      <OperatorChain
        :model-value="defaultOperators"
        @update:model-value="patchSettings({ defaultOperators: $event })"
      />
    </SettingCard>
  </div>
</template>
