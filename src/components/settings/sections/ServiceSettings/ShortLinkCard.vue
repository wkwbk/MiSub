<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ShortLinkConfig } from '@misub/core/types.js';
import { Link2, Loader2 } from '@lucide/vue';
import SecretInput from '@/components/settings/SecretInput.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import Switch from '@/components/ui/Switch.vue';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { testShortLinkConnection } from '@/lib/api.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import { useI18n } from '@/i18n/index.js';
import { extractErrorMessage } from '@/utils/error-handler.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const isTesting = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const shortLinkConfig = computed<ShortLinkConfig>({
  get() {
    return {
      ...DEFAULT_SETTINGS.shortLink,
      ...props.settings?.shortLink,
    };
  },
  set(value: ShortLinkConfig) {
    emit('update:settings', {
      ...props.settings,
      shortLink: value,
    });
  },
});

function updateField<K extends keyof ShortLinkConfig>(key: K, value: ShortLinkConfig[K]): void {
  shortLinkConfig.value = {
    ...shortLinkConfig.value,
    [key]: value,
  };
}

async function handleTestConnection() {
  if (isTesting.value) return;
  isTesting.value = true;
  testResult.value = null;

  try {
    const result = await testShortLinkConnection({
      apiUrl: shortLinkConfig.value.apiUrl,
      apiToken: shortLinkConfig.value.apiToken,
    });
    if (result?.success) {
      testResult.value = {
        success: true,
        message: result.message || t('settings.shortLinkTestSuccess'),
      };
    } else {
      testResult.value = {
        success: false,
        message: result?.message || result?.error || t('settings.shortLinkTestFailed'),
      };
    }
  } catch (error: unknown) {
    testResult.value = {
      success: false,
      message: extractErrorMessage(error, t('settings.shortLinkTestFailed')),
    };
  } finally {
    isTesting.value = false;
  }
}
</script>

<template>
  <SettingCard :description="t('settings.shortLinkDesc')" :title="t('settings.shortLinkTitle')">
    <template #icon>
      <Link2 class="h-4 w-4" />
    </template>
    <template #actions>
      <Switch
        :aria-label="t('settings.shortLinkEnable')"
        :model-value="Boolean(shortLinkConfig.enabled)"
        @update:model-value="updateField('enabled', Boolean($event))"
      />
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">
            {{ t('settings.shortLinkApiUrl') }}
          </label>
          <input
            :placeholder="t('settings.shortLinkApiUrlPlaceholder')"
            :value="shortLinkConfig.apiUrl"
            class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
            type="text"
            @input="updateField('apiUrl', ($event.target as HTMLInputElement).value)"
          />
          <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.shortLinkApiUrlHint') }}
          </p>
        </div>

        <SecretInput
          :hint="t('settings.shortLinkApiTokenHint')"
          :label="t('settings.shortLinkApiToken')"
          :model-value="shortLinkConfig.apiToken"
          :placeholder="
            shortLinkConfig.hasToken
              ? t('settings.shortLinkTokenSavedPlaceholder')
              : t('settings.shortLinkTokenPlaceholder')
          "
          @update:model-value="updateField('apiToken', String($event ?? ''))"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3 pt-1">
        <button
          :disabled="isTesting || !String(shortLinkConfig.apiUrl || '').trim()"
          class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-line bg-transparent text-fg hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          type="button"
          @click="handleTestConnection"
        >
          <Loader2 v-if="isTesting" class="h-3.5 w-3.5 animate-spin" />
          <span>{{ isTesting ? t('settings.shortLinkTesting') : t('settings.shortLinkTestBtn') }}</span>
        </button>

        <span
          v-if="testResult"
          :class="testResult.success ? 'text-status-success' : 'text-status-danger'"
          class="text-xs font-medium"
        >
          {{ testResult.message }}
        </span>
      </div>
    </div>
  </SettingCard>
</template>
