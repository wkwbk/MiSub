<script setup>
import { computed, ref } from 'vue';
import { Loader2, Send } from '@lucide/vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const telegramPushConfig = computed({
  get() {
    return (
      props.settings.telegram_push_config || {
        enabled: true,
        bot_token: '',
        webhook_secret: '',
        allowed_user_ids: [],
        allow_all_users: false,
      }
    );
  },
  set(value) {
    props.settings.telegram_push_config = value;
  },
});

const allowedUsersStr = computed({
  get() {
    return (telegramPushConfig.value.allowed_user_ids || []).join(', ');
  },
  set(value) {
    const ids = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    telegramPushConfig.value = {
      ...telegramPushConfig.value,
      allowed_user_ids: ids,
    };
  },
});

const webhookUrl = computed(() => `${window.location.origin}/api/telegram/webhook`);

const webhookSecret = computed(() => telegramPushConfig.value.webhook_secret?.trim() || '');

const isWebhookSecretValid = computed(() => {
  return /^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret.value);
});

const setWebhookUrl = computed(() => {
  const botToken = telegramPushConfig.value.bot_token?.trim();

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

async function copyText(value, key) {
  if (!value) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    copyStatus.value = { key, message: t('settings.copiedShort') };
  } catch (error) {
    console.error('[TelegramCard] Copy failed:', error);
    copyStatus.value = { key, message: t('settings.copyFailedManualSelect') };
  } finally {
    window.setTimeout(() => {
      if (copyStatus.value?.key === key) {
        copyStatus.value = null;
      }
    }, 2500);
  }
}

async function testNotification() {
  isTesting.value = true;
  testResult.value = null;

  try {
    const response = await fetch('/api/test_notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: props.settings.BotToken,
        chatId: props.settings.ChatID,
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
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader :description="t('settings.telegramNotifyBotDesc')" :title="t('settings.telegramNotifyBotTitle')">
        <template #icon>
          <Send class="h-4 w-4" />
        </template>
      </SectionHeader>

      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">Bot Token</label>
            <input
              v-model="settings.BotToken"
              class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-line-strong text-sm font-mono text-fg transition-colors"
              placeholder="123456:ABC-DEF..."
              type="text"
            />
            <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
              {{ t('settings.telegramBotTokenHint') }}
            </p>
          </div>
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">Chat ID</label>
            <input
              v-model="settings.ChatID"
              class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-line-strong text-sm font-mono text-fg transition-colors"
              placeholder="123456789"
              type="text"
            />
            <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
              {{ t('settings.telegramChatIdHint') }}
            </p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            :disabled="isTesting || !settings.BotToken || !settings.ChatID"
            class="px-4 py-1.5 bg-accent hover:opacity-90 border border-accent text-accent-fg text-xs font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            type="button"
            @click="testNotification"
          >
            <Loader2 v-if="isTesting" class="animate-spin h-4 w-4 text-fg-subtle" />
            <span>{{ isTesting ? t('settings.telegramTesting') : t('settings.telegramSendTest') }}</span>
          </button>

          <div
            v-if="testResult"
            :class="testResult.success ? 'text-emerald-400' : 'text-red-400'"
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
    </section>

    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.telegramPushBotDesc')"
        :no-margin="!telegramPushConfig.enabled"
        title="Telegram Push Bot"
      >
        <template #icon>
          <Send class="h-4 w-4" />
        </template>
        <template #actions>
          <Switch v-model="telegramPushConfig.enabled" />
        </template>
      </SectionHeader>

      <div v-if="telegramPushConfig.enabled" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-medium text-fg-muted">Push Bot Token</label>
            <input
              v-model="telegramPushConfig.bot_token"
              class="mt-1.5 block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-line-strong text-sm font-mono text-fg"
              placeholder="123456:ABC-DEF..."
              type="text"
            />
            <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
              {{ t('settings.telegramPushTokenHint') }}
            </p>
          </div>

          <div>
            <label class="block text-xs font-medium text-fg-muted">{{ t('settings.telegramWebhookSecret') }}</label>
            <input
              v-model="telegramPushConfig.webhook_secret"
              :aria-label="t('settings.telegramWebhookSecret')"
              class="mt-1.5 block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-line-strong text-sm font-mono text-fg"
              placeholder="random_secret-token"
              type="text"
            />
            <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
              {{ t('settings.telegramWebhookSecretHint') }}
            </p>
            <p v-if="webhookSecret && !isWebhookSecretValid" class="mt-1.5 text-xs text-red-400">
              {{ t('settings.telegramWebhookSecretInvalid') }}
            </p>
          </div>
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
          <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
            {{ t('settings.telegramAllowedUsersHint') }}
            <a
              class="font-mono text-fg-muted underline hover:text-fg"
              href="https://t.me/userinfobot"
              target="_blank"
              >{{ t('settings.telegramGetUserId') }}</a
            >
          </p>
        </div>

        <div class="flex items-center justify-between gap-6 py-4 border-y border-line">
          <div class="flex items-start gap-2.5">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
            <div class="space-y-1">
              <label class="block text-sm font-medium text-fg">{{ t('settings.telegramPublicAccess') }}</label>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.telegramPublicAccessHint') }}
              </p>
            </div>
          </div>
          <Switch v-model="telegramPushConfig.allow_all_users" />
        </div>

        <div>
          <label class="block text-xs font-medium text-fg-muted">Webhook URL</label>
          <div class="mt-1.5 flex rounded-md shadow-none">
            <input
              :value="webhookUrl"
              class="flex-1 block w-full px-3 py-2 bg-inset border border-line rounded-l-md text-xs font-mono text-fg"
              readonly
              type="text"
            />
            <button
              class="inline-flex items-center px-4 py-2 border border-l-0 border-line rounded-r-md bg-transparent text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-hidden"
              type="button"
              @click="copyText(webhookUrl, 'webhook')"
            >
              {{ copyStatus?.key === 'webhook' ? copyStatus.message : t('actions.copy') }}
            </button>
          </div>
          <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
            {{ t('settings.telegramWebhookUrlHint') }}
          </p>
        </div>

        <div v-if="setWebhookUrl">
          <label class="block text-xs font-medium text-fg-muted">{{ t('settings.telegramSetWebhookLink') }}</label>
          <div class="mt-1.5 flex rounded-md shadow-none">
            <input
              :aria-label="t('settings.telegramPublicAccess')"
              :value="setWebhookUrl"
              class="flex-1 block w-full px-3 py-2 bg-inset border border-line rounded-l-md text-xs font-mono text-fg"
              readonly
              type="text"
            />
            <button
              class="inline-flex items-center px-4 py-2 border border-l-0 border-line rounded-r-md bg-transparent text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-hidden"
              type="button"
              @click="copyText(setWebhookUrl, 'setWebhook')"
            >
              {{ copyStatus?.key === 'setWebhook' ? copyStatus.message : t('actions.copy') }}
            </button>
          </div>
          <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
            {{ t('settings.telegramSetWebhookHint') }}
          </p>
        </div>

        <p v-else class="flex items-center gap-2 text-xs text-fg-subtle">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
          <span>{{ t('settings.telegramSetWebhookEmpty') }}</span>
        </p>

        <div class="flex flex-wrap gap-2.5">
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
    </section>
  </div>
</template>
