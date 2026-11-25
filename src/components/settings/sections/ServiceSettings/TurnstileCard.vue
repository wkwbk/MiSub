<script setup lang="ts">
import { computed } from 'vue';
import type { TurnstileConfig } from '@misub/core/types.js';
import { ShieldCheck } from '@lucide/vue';
import SecretInput from '@/components/settings/SecretInput.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import Switch from '@/components/ui/Switch.vue';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { useI18n } from '@/i18n/index.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const turnstileConfig = computed<TurnstileConfig>({
  get() {
    return {
      ...DEFAULT_SETTINGS.turnstile,
      ...props.settings?.turnstile,
    };
  },
  set(value: TurnstileConfig) {
    emit('update:settings', {
      ...props.settings,
      turnstile: value,
    });
  },
});

function updateField<K extends keyof TurnstileConfig>(key: K, value: TurnstileConfig[K]): void {
  turnstileConfig.value = {
    ...turnstileConfig.value,
    [key]: value,
  };
}
</script>

<template>
  <SettingCard :description="t('settings.turnstileDesc')" :title="t('settings.turnstileTitle')" tone="blue">
    <template #icon>
      <ShieldCheck class="h-4 w-4" />
    </template>
    <template #actions>
      <Switch
        :aria-label="t('settings.turnstileEnable')"
        :model-value="Boolean(turnstileConfig.enabled)"
        @update:model-value="updateField('enabled', Boolean($event))"
      />
    </template>

    <div class="space-y-4">
      <p v-if="turnstileConfig.hasEnvKeys" class="text-xs text-fg-muted leading-relaxed">
        {{ t('settings.turnstileEnvKeysDetected') }}
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">
            {{ t('settings.turnstileSiteKey') }}
          </label>
          <input
            :placeholder="
              turnstileConfig.hasEnvKeys
                ? t('settings.turnstileEnvFallbackPlaceholder')
                : t('settings.turnstileSiteKeyPlaceholder')
            "
            :value="turnstileConfig.siteKey"
            autocomplete="off"
            class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
            type="text"
            @input="updateField('siteKey', ($event.target as HTMLInputElement).value)"
          />
          <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.turnstileSiteKeyHint') }}
          </p>
        </div>

        <SecretInput
          :hint="t('settings.turnstileSecretKeyHint')"
          :label="t('settings.turnstileSecretKey')"
          :model-value="turnstileConfig.secretKey"
          :placeholder="
            turnstileConfig.hasSecretKey
              ? t('settings.turnstileSecretSavedPlaceholder')
              : turnstileConfig.hasEnvKeys
                ? t('settings.turnstileEnvFallbackPlaceholder')
                : t('settings.turnstileSecretPlaceholder')
          "
          @update:model-value="updateField('secretKey', String($event ?? ''))"
        />
      </div>

      <div class="divide-y divide-line-subtle border-t border-line-subtle pt-2">
        <div class="py-3 flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <p class="text-sm font-medium text-fg">{{ t('settings.turnstileGuestbookTitle') }}</p>
            <p class="text-xs text-fg-muted leading-relaxed">{{ t('settings.turnstileGuestbookDesc') }}</p>
          </div>
          <Switch
            :aria-label="t('settings.turnstileGuestbookTitle')"
            :model-value="turnstileConfig.enableForGuestbook !== false"
            class="shrink-0"
            @update:model-value="updateField('enableForGuestbook', Boolean($event))"
          />
        </div>

        <div class="py-3 space-y-2.5">
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-0.5">
              <p class="text-sm font-medium text-fg">{{ t('settings.turnstileLoginTitle') }}</p>
              <p class="text-xs text-fg-muted leading-relaxed">{{ t('settings.turnstileLoginDesc') }}</p>
            </div>
            <Switch
              :aria-label="t('settings.turnstileLoginTitle')"
              :model-value="Boolean(turnstileConfig.enableForLogin)"
              class="shrink-0"
              @update:model-value="updateField('enableForLogin', Boolean($event))"
            />
          </div>
          <p v-if="turnstileConfig.enableForLogin" class="callout-warning">
            {{ t('settings.turnstileLoginWarning') }}
          </p>
          <p v-if="turnstileConfig.loginDisabledByEnv" class="callout-warning">
            {{ t('settings.turnstileLoginDisabledByEnvHint') }}
          </p>
        </div>
      </div>
    </div>
  </SettingCard>
</template>
