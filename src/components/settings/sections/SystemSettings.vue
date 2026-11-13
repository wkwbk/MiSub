<script setup>
    import { ref } from 'vue';
    import {
        AlertTriangle,
        Archive,
        ClipboardCopy,
        Database,
        KeyRound,
        Loader2,
        Lock,
    } from 'lucide-vue-next';
    import { useToastStore } from '../../../stores/toast.js';
    import Input from '../../ui/Input.vue';
    import Switch from '../../ui/Switch.vue';
    import { useI18n } from '../../../i18n/index.js';

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

    const passwordForm = ref({
        newPassword: '',
        confirmPassword: '',
    });
    const isUpdatingPassword = ref(false);

    const ensureExternalApiDefaults = (settings) => {
        if (!settings.externalApi || typeof settings.externalApi !== 'object') {
            settings.externalApi = { enabled: false, tokens: [{ name: 'default', token: '' }] };
            return;
        }

        if (
            !Array.isArray(settings.externalApi.tokens) ||
            settings.externalApi.tokens.length === 0
        ) {
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

        try {
            await navigator.clipboard.writeText(token);
            showToast(t('systemSettings.externalApiTokenCopied'), 'success');
        } catch (error) {
            showToast(t('systemSettings.copyFailedManual'), 'error');
        }
    };

    const handleUpdatePassword = async () => {
        if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
            showToast(t('systemSettings.passwordMismatch'), 'error');
            return;
        }
        if (passwordForm.value.newPassword.length < 6) {
            showToast(t('systemSettings.passwordTooShort'), 'error');
            return;
        }

        isUpdatingPassword.value = true;
        try {
            const res = await fetch('/api/settings/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordForm.value.newPassword }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(t('systemSettings.passwordUpdated'), 'success');
                passwordForm.value.newPassword = '';
                passwordForm.value.confirmPassword = '';
            } else {
                showToast(data.error || t('systemSettings.updateFailed'), 'error');
            }
        } catch (e) {
            showToast(t('systemSettings.requestFailed', { message: e.message }), 'error');
        } finally {
            isUpdatingPassword.value = false;
        }
    };

    const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);`;

    const copySchema = async () => {
        try {
            await navigator.clipboard.writeText(SCHEMA_SQL);
            showToast(t('systemSettings.schemaCopied'), 'success');
        } catch (err) {
            showToast(t('systemSettings.copyFailedManual'), 'error');
        }
    };

    const emit = defineEmits(['migrate']);
</script>

<template>
    <div class="space-y-6">
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <Database class="h-4 w-4" />
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('systemSettings.storageTypeTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('systemSettings.storageTypeDesc') }}
                    </p>
                </div>
            </div>
            <div class="space-y-3">
                <div class="flex items-center">
                    <input
                        type="radio"
                        value="kv"
                        v-model="settings.storageType"
                        class="h-4 w-4 text-zinc-100 focus-visible:ring-zinc-500 border-zinc-700 bg-zinc-900"
                        :aria-label="t('systemSettings.kvStorage')"
                    />
                    <span class="ml-3 text-sm text-zinc-300">{{
                        t('systemSettings.kvStorage')
                    }}</span>
                </div>
                <div class="flex items-center">
                    <input
                        type="radio"
                        value="d1"
                        v-model="settings.storageType"
                        class="h-4 w-4 text-zinc-100 focus-visible:ring-zinc-500 border-zinc-700 bg-zinc-900"
                        :aria-label="t('systemSettings.d1DatabaseRecommended')"
                    />
                    <span class="ml-3 text-sm text-zinc-300">{{
                        t('systemSettings.d1DatabaseRecommended')
                    }}</span>
                </div>

                <div
                    v-if="settings.storageType === 'kv'"
                    class="mt-4 p-4 bg-transparent rounded-md border border-zinc-800"
                >
                    <h4 class="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0"></span>
                        {{ t('systemSettings.migrateToD1') }}
                    </h4>
                    <p class="text-xs text-zinc-400 mb-3">
                        {{ t('systemSettings.d1MigrationDesc') }}
                    </p>
                    <ol class="list-decimal list-inside text-xs text-zinc-400 mb-3 space-y-1">
                        <li><span v-html="t('systemSettings.d1StepCreate')"></span></li>
                        <li><span v-html="t('systemSettings.d1StepSchema')"></span></li>
                        <li>{{ t('systemSettings.d1StepMigrate') }}</li>
                    </ol>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <button
                            @click="emit('migrate')"
                            class="px-4 py-1.5 text-xs font-semibold text-zinc-900 rounded-md transition-colors bg-zinc-100 hover:bg-white border border-zinc-100 flex items-center justify-center min-w-[120px] shadow-none"
                        >
                            {{ t('systemSettings.startMigration') }}
                        </button>
                        <button
                            @click="copySchema"
                            class="px-4 py-1.5 text-xs font-medium text-zinc-300 bg-transparent border border-zinc-800 rounded-md hover:bg-zinc-900 hover:text-zinc-100 transition-colors flex items-center justify-center gap-2 shadow-none"
                        >
                            <ClipboardCopy class="w-3.5 h-3.5" />
                            {{ t('systemSettings.copySchemaSql') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <Lock class="h-4 w-4" />
                </div>
                <div class="space-y-0.5 flex-1">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('systemSettings.externalApiTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('systemSettings.externalApiDesc') }}
                    </p>
                </div>
                <Switch
                    v-model="settings.externalApi.enabled"
                    @update:modelValue="ensureExternalApiDefaults(settings)"
                />
            </div>

            <div class="space-y-4 rounded-md border border-zinc-800 bg-transparent p-4">
                <p class="text-xs leading-5 text-zinc-300">
                    {{ t('systemSettings.externalApiHint') }}
                </p>
                <p class="text-xs font-mono leading-5 text-zinc-500">
                    {{ t('systemSettings.externalApiPathHint') }}
                </p>

                <div class="grid gap-4 md:grid-cols-2">
                    <Input
                        :label="t('systemSettings.externalApiTokenName')"
                        v-model="settings.externalApi.tokens[0].name"
                        :placeholder="t('systemSettings.externalApiTokenNamePlaceholder')"
                    />
                    <Input
                        :label="t('systemSettings.externalApiTokenValue')"
                        v-model="settings.externalApi.tokens[0].token"
                        :placeholder="t('systemSettings.externalApiTokenValuePlaceholder')"
                    />
                </div>

                <div class="flex flex-wrap gap-2">
                    <button
                        @click="handleGenerateExternalApiToken(settings)"
                        class="px-3.5 py-1.5 text-xs font-semibold text-zinc-900 rounded-md bg-zinc-100 border border-zinc-100 hover:bg-white transition-colors"
                    >
                        {{ t('systemSettings.externalApiGenerateToken') }}
                    </button>
                    <button
                        @click="handleCopyExternalApiToken(settings)"
                        class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                    >
                        {{ t('systemSettings.externalApiCopyToken') }}
                    </button>
                </div>
            </div>
        </div>

        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <Archive class="h-4 w-4" />
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('systemSettings.backupRestoreTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('systemSettings.backupRestoreDesc') }}
                    </p>
                </div>
            </div>
            <div class="flex gap-3">
                <button
                    @click="exportBackup"
                    class="px-4 py-1.5 text-xs font-semibold text-zinc-900 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-100 border border-zinc-100 hover:bg-white"
                >
                    {{ t('systemSettings.exportBackup') }}
                </button>
                <button
                    @click="importBackup"
                    class="px-4 py-1.5 text-xs font-medium text-zinc-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100"
                >
                    {{ t('systemSettings.importBackup') }}
                </button>
            </div>
        </div>

        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <KeyRound class="h-4 w-4" />
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('systemSettings.adminSecurityTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('systemSettings.adminSecurityDesc') }}
                    </p>
                </div>
            </div>

            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-transparent p-5 rounded-md border border-zinc-800"
            >
                <div class="space-y-4">
                    <div>
                        <Input
                            :label="t('systemSettings.newPassword')"
                            v-model="passwordForm.newPassword"
                            type="password"
                            :placeholder="t('systemSettings.newPasswordPlaceholder')"
                            class="rounded-md"
                        />
                    </div>
                    <div>
                        <Input
                            :label="t('systemSettings.confirmPassword')"
                            v-model="passwordForm.confirmPassword"
                            type="password"
                            :placeholder="t('systemSettings.confirmPasswordPlaceholder')"
                            class="rounded-md"
                        />
                    </div>
                </div>
                <div class="flex items-end">
                    <button
                        @click="handleUpdatePassword"
                        :disabled="isUpdatingPassword || !passwordForm.newPassword"
                        class="px-5 py-2 rounded-md text-zinc-900 text-xs font-semibold shadow-none transition-colors flex items-center gap-2 bg-zinc-100 border border-zinc-100 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Loader2
                            v-if="isUpdatingPassword"
                            class="animate-spin h-4 w-4 text-zinc-600"
                        />
                        <span>{{
                            isUpdatingPassword
                                ? t('systemSettings.updating')
                                : t('systemSettings.updatePassword')
                        }}</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-red-400"
                >
                    <AlertTriangle class="h-4 w-4" />
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
                        {{ t('systemSettings.dangerZoneTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('systemSettings.dangerZoneDesc') }}
                    </p>
                </div>
            </div>

            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-transparent p-5 rounded-md border border-zinc-800"
            >
                <div class="space-y-1.5">
                    <h4 class="text-sm font-medium text-zinc-100">
                        {{ t('systemSettings.factoryResetTitle') }}
                    </h4>
                    <p class="text-xs text-zinc-400">
                        <span v-html="t('systemSettings.factoryResetDesc')"></span>
                    </p>
                </div>
                <div class="flex items-center sm:justify-end">
                    <button
                        @click="handleReset"
                        class="px-4 py-2 rounded-md text-red-400 text-xs font-semibold border border-red-900/60 bg-transparent hover:bg-red-950/40 hover:text-red-300 transition-colors"
                    >
                        {{ t('systemSettings.factoryResetTitle') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
