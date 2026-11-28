<script setup lang="ts">
import { computed } from 'vue';
import { Cpu, FileText } from '@lucide/vue';
import TransformSchemeEditor from '@/components/forms/TransformSchemeEditor.vue';
import Switch from '@/components/ui/Switch.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

function patchCommonToggle(settingKey: 'enableUdp' | 'skipCertVerify', value: boolean): void {
  emit('update:settings', {
    ...props.settings,
    [settingKey]: value,
  });
}

const commonSwitches = computed(() => [
  {
    key: 'udp',
    testId: 'common-switch-udp',
    label: t('settings.transformUdp'),
    value: props.settings?.enableUdp !== false,
    update: (val: boolean) => patchCommonToggle('enableUdp', val),
  },
  {
    key: 'scv',
    testId: 'common-switch-scv',
    label: t('settings.transformSkipCert'),
    value: Boolean(props.settings?.skipCertVerify),
    update: (val: boolean) => patchCommonToggle('skipCertVerify', val),
  },
]);
</script>

<template>
  <div class="space-y-4">
    <SettingCard
      :description="t('settings.transformRulesDesc')"
      :title="t('settings.transformRulesTitle')"
      tone="purple"
    >
      <template #icon>
        <FileText class="h-4 w-4" />
      </template>

      <TransformSchemeEditor
        :model="settings"
        scope="global"
        @update:model="emit('update:settings', $event as AppSettingsConfig)"
      />
    </SettingCard>

    <SettingCard
      :description="t('settings.transformCommonParamsDesc')"
      :title="t('settings.transformCommonParamsTitle')"
      data-testid="common-transform-params"
    >
      <template #icon>
        <Cpu class="h-4 w-4" />
      </template>

      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div v-for="item in commonSwitches" :key="item.key" class="setting-switch-card">
          <span class="truncate text-xs font-medium text-fg-muted">{{ item.label }}</span>
          <Switch
            :data-testid="item.testId"
            :model-value="item.value"
            size="sm"
            @update:model-value="item.update(Boolean($event))"
          />
        </div>
      </div>
    </SettingCard>
  </div>
</template>
