<script setup>
    import { computed, ref } from 'vue';
    import { Loader2 } from 'lucide-vue-next';
    import Switch from '../../../ui/Switch.vue';
    import { useI18n } from '../../../../i18n/index.js';

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
    <div class="space-y-6">
        <section class="bg-transparent rounded-md p-5 border border-zinc-800 shadow-none space-y-4">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.telegramNotifyBotTitle') }}
                    </h3>
                    <p class="mt-0.5 text-xs text-zinc-400">
                        {{ t('settings.telegramNotifyBotDesc') }}
                    </p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Bot Token</label>
                    <input
                        v-model="settings.BotToken"
                        type="text"
                        placeholder="123456:ABC-DEF..."
                        class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100 transition-colors"
                    />
                    <p class="mt-1 text-xs text-zinc-500">
                        {{ t('settings.telegramBotTokenHint') }}
                    </p>
                </div>
                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Chat ID</label>
                    <input
                        v-model="settings.ChatID"
                        type="text"
                        placeholder="123456789"
                        class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100 transition-colors"
                    />
                    <p class="mt-1 text-xs text-zinc-500">
                        {{ t('settings.telegramChatIdHint') }}
                    </p>
                </div>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                    type="button"
                    class="px-4 py-1.5 bg-zinc-100 hover:bg-white border border-zinc-100 text-zinc-900 text-xs font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    :disabled="isTesting || !settings.BotToken || !settings.ChatID"
                    @click="testNotification"
                >
                    <Loader2 v-if="isTesting" class="animate-spin h-4 w-4 text-zinc-600" />
                    <span>{{
                        isTesting ? t('settings.telegramTesting') : t('settings.telegramSendTest')
                    }}</span>
                </button>

                <div
                    v-if="testResult"
                    class="text-xs flex items-center gap-2"
                    :class="testResult.success ? 'text-emerald-400' : 'text-red-400'"
                >
                    <span
                        class="h-1.5 w-1.5 rounded-full shrink-0"
                        :class="testResult.success ? 'bg-emerald-500' : 'bg-red-500'"
                    ></span>
                    <span>{{ testResult.message }}</span>
                    <details
                        v-if="testResult.detail"
                        class="mt-2 text-xs font-mono bg-[#131515] border border-zinc-800 p-2 rounded-md max-h-32 overflow-auto"
                    >
                        <summary class="cursor-pointer text-zinc-500">
                            {{ t('settings.telegramDetails') }}
                        </summary>
                        <pre>{{ JSON.stringify(testResult.detail, null, 2) }}</pre>
                    </details>
                </div>
            </div>
        </section>

        <section class="bg-transparent rounded-md p-5 border border-zinc-800 shadow-none space-y-6">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-sm font-semibold text-zinc-100">Telegram Push Bot</h3>
                    <p class="mt-0.5 text-xs text-zinc-400">
                        {{ t('settings.telegramPushBotDesc') }}
                    </p>
                </div>
                <Switch v-model="telegramPushConfig.enabled" />
            </div>

            <div v-if="telegramPushConfig.enabled" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-medium text-zinc-300"
                            >Push Bot Token</label
                        >
                        <input
                            v-model="telegramPushConfig.bot_token"
                            type="text"
                            placeholder="123456:ABC-DEF..."
                            class="mt-1.5 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100"
                        />
                        <p class="mt-1 text-xs text-zinc-500">
                            {{ t('settings.telegramPushTokenHint') }}
                        </p>
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-zinc-300">{{
                            t('settings.telegramWebhookSecret')
                        }}</label>
                        <input
                            v-model="telegramPushConfig.webhook_secret"
                            type="text"
                            placeholder="random_secret-token"
                            class="mt-1.5 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100"
                            :aria-label="t('settings.telegramWebhookSecret')"
                        />
                        <p class="mt-1 text-xs text-zinc-500">
                            {{ t('settings.telegramWebhookSecretHint') }}
                        </p>
                        <p
                            v-if="webhookSecret && !isWebhookSecretValid"
                            class="mt-1 text-xs text-red-400"
                        >
                            {{ t('settings.telegramWebhookSecretInvalid') }}
                        </p>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-medium text-zinc-300">{{
                        t('settings.telegramAllowedUsers')
                    }}</label>
                    <textarea
                        v-model="allowedUsersStr"
                        rows="2"
                        placeholder="123456789, 987654321"
                        class="mt-1.5 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100"
                    />
                    <p class="mt-1 text-xs text-zinc-500">
                        {{ t('settings.telegramAllowedUsersHint') }}
                        <a
                            href="https://t.me/userinfobot"
                            target="_blank"
                            class="font-mono text-zinc-300 underline hover:text-zinc-100"
                            >{{ t('settings.telegramGetUserId') }}</a
                        >
                    </p>
                </div>

                <div class="bg-transparent border border-zinc-800 rounded-md p-4">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex items-start gap-2.5">
                            <span
                                class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"
                            ></span>
                            <div>
                                <label class="block text-sm font-medium text-zinc-100">{{
                                    t('settings.telegramPublicAccess')
                                }}</label>
                                <p class="mt-1 text-xs text-zinc-400">
                                    {{ t('settings.telegramPublicAccessHint') }}
                                </p>
                            </div>
                        </div>
                        <Switch v-model="telegramPushConfig.allow_all_users" />
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-medium text-zinc-300">Webhook URL</label>
                    <div class="mt-1.5 flex rounded-md shadow-none">
                        <input
                            :value="webhookUrl"
                            type="text"
                            readonly
                            class="flex-1 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-l-md text-xs font-mono text-zinc-200"
                        />
                        <button
                            type="button"
                            class="inline-flex items-center px-4 py-2 border border-l-0 border-zinc-800 rounded-r-md bg-transparent text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-hidden"
                            @click="copyText(webhookUrl, 'webhook')"
                        >
                            {{
                                copyStatus?.key === 'webhook'
                                    ? copyStatus.message
                                    : t('actions.copy')
                            }}
                        </button>
                    </div>
                    <p class="mt-1 text-xs text-zinc-500">
                        {{ t('settings.telegramWebhookUrlHint') }}
                    </p>
                </div>

                <div v-if="setWebhookUrl">
                    <label class="block text-xs font-medium text-zinc-300">{{
                        t('settings.telegramSetWebhookLink')
                    }}</label>
                    <div class="mt-1.5 flex rounded-md shadow-none">
                        <input
                            :value="setWebhookUrl"
                            type="text"
                            readonly
                            class="flex-1 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-l-md text-xs font-mono text-zinc-200"
                            :aria-label="t('settings.telegramPublicAccess')"
                        />
                        <button
                            type="button"
                            class="inline-flex items-center px-4 py-2 border border-l-0 border-zinc-800 rounded-r-md bg-transparent text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-hidden"
                            @click="copyText(setWebhookUrl, 'setWebhook')"
                        >
                            {{
                                copyStatus?.key === 'setWebhook'
                                    ? copyStatus.message
                                    : t('actions.copy')
                            }}
                        </button>
                    </div>
                    <p class="mt-1 text-xs text-zinc-500">
                        {{ t('settings.telegramSetWebhookHint') }}
                    </p>
                </div>

                <div
                    v-else
                    class="flex items-center gap-2.5 bg-transparent border border-zinc-800 rounded-md p-3"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.telegramSetWebhookEmpty') }}
                    </p>
                </div>

                <div class="flex flex-col sm:flex-row gap-2">
                    <button
                        type="button"
                        class="flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors flex-1"
                        :class="
                            showSetupGuide
                                ? 'bg-zinc-100 border-zinc-100 text-zinc-900'
                                : 'bg-transparent border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                        "
                        @click="showSetupGuide = !showSetupGuide"
                    >
                        <span>{{ t('settings.telegramSetupSteps') }}</span>
                    </button>

                    <button
                        type="button"
                        class="flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors flex-1"
                        :class="
                            showUsageGuide
                                ? 'bg-zinc-100 border-zinc-100 text-zinc-900'
                                : 'bg-transparent border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                        "
                        @click="showUsageGuide = !showUsageGuide"
                    >
                        <span>{{ t('settings.telegramUsageGuide') }}</span>
                    </button>
                </div>

                <div
                    v-if="showSetupGuide"
                    class="bg-transparent border border-zinc-800 rounded-md p-4"
                >
                    <ol class="list-decimal list-inside space-y-2 text-xs text-zinc-300">
                        <li>{{ t('settings.telegramSetupStep1') }}</li>
                        <li>{{ t('settings.telegramSetupStep2') }}</li>
                        <li>{{ t('settings.telegramSetupStep3') }}</li>
                        <li>{{ t('settings.telegramSetupStep4') }}</li>
                    </ol>
                </div>

                <div
                    v-if="showUsageGuide"
                    class="bg-transparent border border-zinc-800 rounded-md p-4"
                >
                    <div class="space-y-2 text-xs text-zinc-300">
                        <p>{{ t('settings.telegramUsageCommands') }}</p>
                        <p>{{ t('settings.telegramUsageImport') }}</p>
                        <p>{{ t('settings.telegramUsageIsolation') }}</p>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
