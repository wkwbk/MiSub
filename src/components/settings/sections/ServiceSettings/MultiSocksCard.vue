<script setup lang="ts">
import { computed } from 'vue';
import { Network } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import SettingCard from '@/components/settings/SettingCard.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

function patchSettings(patch: Partial<AppSettingsConfig>): void {
  emit('update:settings', {
    ...props.settings,
    ...patch,
  });
}

const defaultMultiSocksStartPortError = computed(() => {
  const raw = props.settings.defaultMultiSocksStartPort;
  if (raw === undefined || raw === null) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1024 && num <= 60000 ? '' : t('settings.invalidStartPortError');
});
</script>

<template>
  <SettingCard
    :description="t('settings.multiSocksCardDesc')"
    :title="t('settings.multiSocksCardTitle')"
    tone="indigo"
  >
    <template #icon>
      <Network class="h-4 w-4" />
    </template>

    <div class="space-y-4">
      <div class="flex items-center justify-between gap-6">
        <div class="space-y-1">
          <p class="text-sm font-medium text-fg">{{ t('settings.defaultMultiSocksEnabledTitle') }}</p>
          <p class="text-xs text-fg-muted leading-relaxed">
            {{ t('settings.defaultMultiSocksEnabledDesc') }}
          </p>
        </div>
        <Switch
          :model-value="Boolean(settings.defaultMultiSocksEnabled)"
          class="shrink-0"
          @update:model-value="patchSettings({ defaultMultiSocksEnabled: Boolean($event) })"
        />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-line-subtle">
        <div>
          <Input
            id="setting-defaultMultiSocksStartPort"
            :error="defaultMultiSocksStartPortError"
            :label="t('settings.defaultMultiSocksStartPortLabel')"
            :model-value="settings.defaultMultiSocksStartPort ?? 42001"
            placeholder="42001"
            type="number"
            @update:model-value="
              patchSettings({
                defaultMultiSocksStartPort: Number.parseInt(String($event ?? ''), 10) || 0,
              })
            "
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
            t('settings.defaultMultiSocksListenLabel')
          }}</label>
          <Select
            :model-value="settings.defaultMultiSocksListen || '127.0.0.1'"
            :options="[
              { value: '127.0.0.1', label: '127.0.0.1' },
              { value: '0.0.0.0', label: '0.0.0.0' },
            ]"
            @update:model-value="
              patchSettings({ defaultMultiSocksListen: ($event as '127.0.0.1' | '0.0.0.0') ?? '127.0.0.1' })
            "
          />
        </div>
      </div>
    </div>
  </SettingCard>
</template>
