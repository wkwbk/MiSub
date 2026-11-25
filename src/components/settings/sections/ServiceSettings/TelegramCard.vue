<script setup>
import { computed, ref } from 'vue';
import { Loader2, Send } from '@lucide/vue';
import CopyableInput from '@/components/settings/CopyableInput.vue';
import SecretInput from '@/components/settings/SecretInput.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const updatePushConfigField = (key, value) => {
  telegramPushConfig.value = {
    ...telegramPushConfig.value,
    [key]: value,
  };
};

const telegramPushConfig = computed({
  get() {
    return (
      props.settings.telegramPushConfig || {
        enabled: true,
        botToken: '',
        webhookSecret: '',
        allowedUserIds: [],
        allowAllUsers: false,
      }
    );
  },
  set(value) {
    props.settings.telegramPushConfig = value;
  },
});

const allowedUsersStr = computed({
  get() {
    return (telegramPushConfig.value.allowedUserIds || []).join(', ');
  },
  set(value) {
    const ids = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    telegramPushConfig.value = {
      ...telegramPushConfig.value,
      allowedUserIds: ids,
    };
  },
});

const webhookUrl = computed(() => `${window.location.origin}/api/telegram/webhook`);

const webhookSecret = computed(() => telegramPushConfig.value.webhookSecret?.trim() || '');

const isWebhookSecretValid = computed(() => {
  return /^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret.value);
});

const setWebhookUrl = computed(() => {
  const botToken = telegramPushConfig.value.botToken?.trim();

  if (!botToken || !isWebhookSecretValid.value) {
    return '';
  }

  return `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl.value)}&secret_token=${encodeURIComponent(webhookSecret.value)}`;
});

const copyStatus = ref(null);
const showSetupGuide = ref(false);
const showUsageGuide = ref(false);
const isTesting = ref(false);
const testResult = ref(null);
const isSyncingBot = ref(false);
const syncBotResult = ref(null);

async function copyText(value, key) {
  if (!value) return;

  const copied = await copyTextToClipboard(value);
  copyStatus.value = {
    key,
    message: copied ? t('settings.copiedShort') : t('settings.copyFailedManualSelect'),
  };

  window.setTimeout(() => {
    if (copyStatus.value?.key === key) {
      copyStatus.value = null;
    }
  }, 2500);
}

async function testNotification() {
  isTesting.value = true;
  testResult.value = null;

  try {
    const response = await fetch('/api/test_notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: props.settings.botToken,
        chatId: props.settings.chatId,
      }),
    });

    const data = await response.json();
    if (data.success) {
      testResult.value = { success: true, message: t('settings.telegramTestSuccess') };
    } else {
      testResult.value = {
        success: false,
        message: data.error || t('settings.telegramTestFailed'),
        detail: data.detail,
      };
    }
  } catch (error) {
    testResult.value = {
      success: false,
      message: error.message || t('settings.telegramRequestFailed'),
    };
  } finally {
    isTesting.value = false;
  }
}

async function syncPushBot() {
  const botToken = telegramPushConfig.value.botToken?.trim() || '';
  if (!botToken && !telegramPushConfig.value.hasBotToken) return;

  isSyncingBot.value = true;
  syncBotResult.value = null;

  try {
    const response = await fetch('/api/telegram/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken,
        webhookSecret: webhookSecret.value,
      }),
    });

    const data = await response.json();
    if (data.success) {
      const webhookSkipped = Boolean(data.webhook?.skipped);
      syncBotResult.value = {
        success: true,
        message: webhookSkipped ? t('settings.telegramSyncCommandsOnlySuccess') : t('settings.telegramSyncSuccess'),
        detail: data,
      };
    } else {
      syncBotResult.value = {
        success: false,
        message: data.error || t('settings.telegramSyncFailed'),
        detail: data,
      };
    }
  } catch (error) {
    syncBotResult.value = {
      success: false,
      message: error.message || t('settings.telegramRequestFailed'),
    };
  } finally {
    isSyncingBot.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <SettingCard :description="t('settings.telegramNotifyBotDesc')" :title="t('settings.telegramNotifyBotTitle')">
      <template #icon>
        <Send class="h-4 w-4" />
      </template>

      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SecretInput
            v-model="settings.botToken"
            :hint="t('settings.telegramBotTokenHint')"
            :placeholder="settings.hasBotToken ? t('settings.telegramBotTokenSavedPlaceholder') : '123456:ABC-DEF...'"
            label="Bot Token"
          />
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">Chat ID</label>
            <input
              v-model="settings.chatId"
              class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
              placeholder="123456789"
              type="text"
            />
            <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
              {{ t('settings.telegramChatIdHint') }}
            </p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            :disabled="isTesting || (!settings.botToken && !settings.hasBotToken) || !settings.chatId"
            class="px-4 py-1.5 bg-accent hover:opacity-90 border border-accent text-accent-fg text-xs font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            type="button"
            @click="testNotification"
          >
            <Loader2 v-if="isTesting" class="animate-spin h-4 w-4 text-fg-subtle" />
            <span>{{ isTesting ? t('settings.telegramTesting') : t('settings.telegramSendTest') }}</span>
          </button>

          <div
            v-if="testResult"
            :class="testResult.success ? 'text-status-success' : 'text-status-danger'"
            class="text-xs flex items-center gap-2"
          >
            <span
              :class="testResult.success ? 'bg-emerald-500' : 'bg-red-500'"
              class="h-1.5 w-1.5 rounded-full shrink-0"
            ></span>
            <span>{{ testResult.message }}</span>
            <details
              v-if="testResult.detail"
              class="mt-2 text-xs font-mono bg-inset border border-line p-2 rounded-md max-h-32 overflow-auto"
            >
              <summary class="cursor-pointer text-fg-subtle">
                {{ t('settings.telegramDetails') }}
              </summary>
              <pre>{{ JSON.stringify(testResult.detail, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </SettingCard>

    <SettingCard
      :description="t('settings.telegramPushBotDesc')"
      :no-margin="!telegramPushConfig.enabled"
      title="Telegram Push Bot"
    >
      <template #icon>
        <Send class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch
          :model-value="telegramPushConfig.enabled"
          @update:model-value="(val) => updatePushConfigField('enabled', val)"
        />
      </template>

      <div v-if="telegramPushConfig.enabled" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SecretInput
            :hint="t('settings.telegramPushTokenHint')"
            :model-value="telegramPushConfig.botToken"
            :placeholder="
              telegramPushConfig.hasBotToken ? t('settings.telegramBotTokenSavedPlaceholder') : '123456:ABC-DEF...'
            "
            label="Push Bot Token"
            @update:model-value="(val) => updatePushConfigField('botToken', val)"
          />

          <SecretInput
            :aria-label="t('settings.telegramWebhookSecret')"
            :hint="t('settings.telegramWebhookSecretHint')"
            :label="t('settings.telegramWebhookSecret')"
            :model-value="telegramPushConfig.webhookSecret"
            :placeholder="
              telegramPushConfig.hasWebhookSecret
                ? t('settings.telegramWebhookSecretSavedPlaceholder')
                : 'random_secret-token'
            "
            @update:model-value="(val) => updatePushConfigField('webhookSecret', val)"
          >
            <template #extra>
              <p v-if="webhookSecret && !isWebhookSecretValid" class="mt-1.5 text-xs text-status-danger">
                {{ t('settings.telegramWebhookSecretInvalid') }}
              </p>
            </template>
          </SecretInput>
        </div>

        <div>
          <label class="block text-xs font-medium text-fg-muted">{{ t('settings.telegramAllowedUsers') }}</label>
          <Textarea
            v-model="allowedUsersStr"
            class="px-3 py-2 text-sm font-mono"
            placeholder="123456789, 987654321"
            rows="2"
            wrapperClass="mt-1.5"
          />
          <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
            {{ t('settings.telegramAllowedUsersHint') }}
            <a class="font-mono text-fg underline hover:opacity-80" href="https://t.me/userinfobot" target="_blank">{{
              t('settings.telegramGetUserId')
            }}</a>
          </p>
        </div>

        <div
          class="flex items-center justify-between gap-6 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3"
        >
          <div class="space-y-1">
            <label class="block text-sm font-medium text-status-warning">{{
              t('settings.telegramPublicAccess')
            }}</label>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.telegramPublicAccessHint') }}
            </p>
          </div>
          <Switch
            :model-value="telegramPushConfig.allowAllUsers"
            @update:model-value="(val) => updatePushConfigField('allowAllUsers', val)"
          />
        </div>

        <CopyableInput
          :button-text="copyStatus?.key === 'webhook' ? copyStatus.message : t('actions.copy')"
          :hint="t('settings.telegramWebhookUrlHint')"
          :value="webhookUrl"
          label="Webhook URL"
          @copy="copyText(webhookUrl, 'webhook')"
        />

        <CopyableInput
          v-if="setWebhookUrl"
          :aria-label="t('settings.telegramPublicAccess')"
          :button-text="copyStatus?.key === 'setWebhook' ? copyStatus.message : t('actions.copy')"
          :hint="t('settings.telegramSetWebhookHint')"
          :label="t('settings.telegramSetWebhookLink')"
          :value="setWebhookUrl"
          @copy="copyText(setWebhookUrl, 'setWebhook')"
        />

        <p v-else class="callout-warning">
          {{ t('settings.telegramSetWebhookEmpty') }}
        </p>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div class="flex flex-wrap items-center gap-3">
            <button
              :disabled="isSyncingBot || (!telegramPushConfig.botToken?.trim() && !telegramPushConfig.hasBotToken)"
              class="px-4 py-1.5 bg-accent hover:opacity-90 border border-accent text-accent-fg text-xs font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              type="button"
              @click="syncPushBot"
            >
              <Loader2 v-if="isSyncingBot" class="animate-spin h-4 w-4 text-fg-subtle" />
              <span>{{ isSyncingBot ? t('settings.telegramSyncing') : t('settings.telegramSyncBot') }}</span>
            </button>

            <div
              v-if="syncBotResult"
              :class="syncBotResult.success ? 'text-status-success' : 'text-status-danger'"
              class="text-xs flex items-center gap-2 flex-wrap"
            >
              <span
                :class="syncBotResult.success ? 'bg-emerald-500' : 'bg-red-500'"
                class="h-1.5 w-1.5 rounded-full shrink-0"
              ></span>
              <span>{{ syncBotResult.message }}</span>
              <details
                v-if="syncBotResult.detail && !syncBotResult.success"
                class="w-full mt-1 text-xs font-mono bg-inset border border-line p-2 rounded-md max-h-32 overflow-auto"
              >
                <summary class="cursor-pointer text-fg-subtle">
                  {{ t('settings.telegramDetails') }}
                </summary>
                <pre>{{ JSON.stringify(syncBotResult.detail, null, 2) }}</pre>
              </details>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2.5">
            <button
              :class="
                showSetupGuide
                  ? 'bg-accent border-accent text-accent-fg'
                  : 'bg-transparent border-line text-fg-muted hover:bg-hover hover:text-fg'
              "
              class="flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors"
              type="button"
              @click="showSetupGuide = !showSetupGuide"
            >
              <span>{{ t('settings.telegramSetupSteps') }}</span>
            </button>

            <button
              :class="
                showUsageGuide
                  ? 'bg-accent border-accent text-accent-fg'
                  : 'bg-transparent border-line text-fg-muted hover:bg-hover hover:text-fg'
              "
              class="flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors"
              type="button"
              @click="showUsageGuide = !showUsageGuide"
            >
              <span>{{ t('settings.telegramUsageGuide') }}</span>
            </button>
          </div>
        </div>

        <div v-if="showSetupGuide" class="pl-4 border-l-2 border-line py-1">
          <ol class="list-decimal list-inside space-y-1.5 text-xs text-fg-muted leading-relaxed">
            <li>{{ t('settings.telegramSetupStep1') }}</li>
            <li>{{ t('settings.telegramSetupStep2') }}</li>
            <li>{{ t('settings.telegramSetupStep3') }}</li>
            <li>{{ t('settings.telegramSetupStep4') }}</li>
          </ol>
        </div>

        <div v-if="showUsageGuide" class="pl-4 border-l-2 border-line py-1">
          <div class="space-y-1.5 text-xs text-fg-muted leading-relaxed">
            <p>{{ t('settings.telegramUsageCommands') }}</p>
            <p>{{ t('settings.telegramUsageImport') }}</p>
            <p>{{ t('settings.telegramUsageIsolation') }}</p>
          </div>
        </div>
      </div>
    </SettingCard>
  </div>
</template>
