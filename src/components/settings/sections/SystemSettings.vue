<script setup>
import { AlertTriangle, Archive, Lock } from '@lucide/vue';
import { useToastStore } from '@/stores/useToastStore.js';
import Input from '@/components/ui/Input.vue';
import Switch from '@/components/ui/Switch.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
  exportBackup: Function,
  importBackup: Function,
  handleReset: Function,
});

const { showToast } = useToastStore();
const { t } = useI18n();

const ensureExternalApiDefaults = (settings) => {
  if (!settings.externalApi || typeof settings.externalApi !== 'object') {
    settings.externalApi = { enabled: false, tokens: [{ name: 'default', token: '' }] };
    return;
  }

  if (!Array.isArray(settings.externalApi.tokens) || settings.externalApi.tokens.length === 0) {
    settings.externalApi.tokens = [{ name: 'default', token: '' }];
    return;
  }

  settings.externalApi.tokens = settings.externalApi.tokens.map((item, index) => ({
    name: String(item?.name || `token-${index + 1}`).trim() || `token-${index + 1}`,
    token: String(item?.token || '').trim(),
  }));
};

const buildExternalApiToken = () => {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(18);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

ensureExternalApiDefaults(props.settings);

const handleGenerateExternalApiToken = (settings) => {
  ensureExternalApiDefaults(settings);
  settings.externalApi.tokens[0].token = buildExternalApiToken();
  showToast(t('systemSettings.externalApiTokenGenerated'), 'success');
};

const handleCopyExternalApiToken = async (settings) => {
  ensureExternalApiDefaults(settings);
  const token = settings.externalApi.tokens[0]?.token || '';
  if (!token) {
    showToast(t('systemSettings.externalApiTokenEmpty'), 'error');
    return;
  }

  const copied = await copyTextToClipboard(token);
  showToast(
    copied ? t('systemSettings.externalApiTokenCopied') : t('systemSettings.copyFailedManual'),
    copied ? 'success' : 'error',
  );
};
</script>

<template>
  <div class="space-y-4">
    <!-- 外部管理 API -->
    <SettingCard :description="t('systemSettings.externalApiDesc')" :title="t('systemSettings.externalApiTitle')">
      <template #icon>
        <Lock class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch v-model="settings.externalApi.enabled" @update:modelValue="ensureExternalApiDefaults(settings)" />
      </template>

      <div class="space-y-5">
        <div class="space-y-1.5">
          <p class="text-xs leading-relaxed text-fg-muted">
            {{ t('systemSettings.externalApiHint') }}
          </p>
          <p class="text-xs font-mono leading-relaxed text-fg-muted">
            {{ t('systemSettings.externalApiPathHint') }}
          </p>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
          <Input
            v-model="settings.externalApi.tokens[0].name"
            :label="t('systemSettings.externalApiTokenName')"
            :placeholder="t('systemSettings.externalApiTokenNamePlaceholder')"
          />
          <Input
            v-model="settings.externalApi.tokens[0].token"
            :label="t('systemSettings.externalApiTokenValue')"
            :placeholder="t('systemSettings.externalApiTokenValuePlaceholder')"
          />
        </div>

        <div class="flex flex-wrap gap-2.5">
          <button
            class="px-3.5 py-1.5 text-xs font-semibold text-accent-fg rounded-md bg-accent border border-accent hover:opacity-90 transition-colors"
            @click="handleGenerateExternalApiToken(settings)"
          >
            {{ t('systemSettings.externalApiGenerateToken') }}
          </button>
          <button
            class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors"
            @click="handleCopyExternalApiToken(settings)"
          >
            {{ t('systemSettings.externalApiCopyToken') }}
          </button>
        </div>
      </div>
    </SettingCard>

    <!-- 备份与恢复 -->
    <SettingCard
      :description="t('systemSettings.backupRestoreDesc')"
      :title="t('systemSettings.backupRestoreTitle')"
      no-margin
    >
      <template #icon>
        <Archive class="h-4 w-4" />
      </template>
      <template #actions>
        <button
          class="px-4 py-1.5 text-xs font-semibold text-accent-fg rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-accent border border-accent hover:opacity-90"
          @click="exportBackup"
        >
          {{ t('systemSettings.exportBackup') }}
        </button>
        <button
          class="px-4 py-1.5 text-xs font-medium text-fg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border border-line hover:bg-hover hover:text-fg"
          @click="importBackup"
        >
          {{ t('systemSettings.importBackup') }}
        </button>
      </template>
    </SettingCard>

    <!-- 危险区域 -->
    <SettingCard :description="t('systemSettings.dangerZoneDesc')" :title="t('systemSettings.dangerZoneTitle')" danger>
      <template #icon>
        <AlertTriangle class="h-4 w-4 text-red-400" />
      </template>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h4 class="text-sm font-medium text-fg">
            {{ t('systemSettings.factoryResetTitle') }}
          </h4>
          <p class="text-xs text-fg-muted leading-relaxed">
            <span v-html="t('systemSettings.factoryResetDesc')"></span>
          </p>
        </div>
        <div class="shrink-0">
          <button
            class="px-4 py-1.5 rounded-md text-red-400 text-xs font-semibold border border-red-900/60 bg-transparent hover:bg-red-950/40 hover:text-red-300 transition-colors"
            @click="handleReset"
          >
            {{ t('systemSettings.factoryResetTitle') }}
          </button>
        </div>
      </div>
    </SettingCard>
  </div>
</template>
