<script setup>
    import { ref } from 'vue';
    import {
        AlertTriangle,
        Archive,
        KeyRound,
        Loader2,
        Lock,
    } from '@lucide/vue';
    import { useToastStore } from '@/stores/toast.js';
    import Input from '@/components/ui/Input.vue';
    import Switch from '@/components/ui/Switch.vue';
    import SectionHeader from '@/components/settings/SectionHeader.vue';
    import { useI18n } from '@/i18n/index.js';

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
</script>

<template>
    <div class="space-y-4">
        <!-- 外部管理 API -->
        <section class="rounded-lg border border-line bg-surface p-6">
            <SectionHeader
                :title="t('systemSettings.externalApiTitle')"
                :description="t('systemSettings.externalApiDesc')"
            >
                <template #icon>
                    <Lock class="h-4 w-4" />
                </template>
                <template #actions>
                    <Switch
                        v-model="settings.externalApi.enabled"
                        @update:modelValue="ensureExternalApiDefaults(settings)"
                    />
                </template>
            </SectionHeader>

            <div class="space-y-5">
                <div class="space-y-1.5">
                    <p class="text-xs leading-relaxed text-fg-muted">
                        {{ t('systemSettings.externalApiHint') }}
                    </p>
                    <p class="text-xs font-mono leading-relaxed text-fg-subtle">
                        {{ t('systemSettings.externalApiPathHint') }}
                    </p>
                </div>

                <div class="grid gap-6 md:grid-cols-2 max-w-2xl">
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

                <div class="flex flex-wrap gap-2.5">
                    <button
                        @click="handleGenerateExternalApiToken(settings)"
                        class="px-3.5 py-1.5 text-xs font-semibold text-accent-fg rounded-md bg-accent border border-accent hover:opacity-90 transition-colors"
                    >
                        {{ t('systemSettings.externalApiGenerateToken') }}
                    </button>
                    <button
                        @click="handleCopyExternalApiToken(settings)"
                        class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                    >
                        {{ t('systemSettings.externalApiCopyToken') }}
                    </button>
                </div>
            </div>
        </section>

        <!-- 备份与恢复 -->
        <section class="rounded-lg border border-line bg-surface p-6">
            <SectionHeader
                :title="t('systemSettings.backupRestoreTitle')"
                :description="t('systemSettings.backupRestoreDesc')"
                no-margin
            >
                <template #icon>
                    <Archive class="h-4 w-4" />
                </template>
                <template #actions>
                    <button
                        @click="exportBackup"
                        class="px-4 py-1.5 text-xs font-semibold text-accent-fg rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-accent border border-accent hover:opacity-90"
                    >
                        {{ t('systemSettings.exportBackup') }}
                    </button>
                    <button
                        @click="importBackup"
                        class="px-4 py-1.5 text-xs font-medium text-fg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border border-line hover:bg-hover hover:text-fg"
                    >
                        {{ t('systemSettings.importBackup') }}
                    </button>
                </template>
            </SectionHeader>
        </section>

        <!-- 管理员安全设置 -->
        <section class="rounded-lg border border-line bg-surface p-6">
            <SectionHeader
                :title="t('systemSettings.adminSecurityTitle')"
                :description="t('systemSettings.adminSecurityDesc')"
            >
                <template #icon>
                    <KeyRound class="h-4 w-4" />
                </template>
            </SectionHeader>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <Input
                    :label="t('systemSettings.newPassword')"
                    v-model="passwordForm.newPassword"
                    type="password"
                    :placeholder="t('systemSettings.newPasswordPlaceholder')"
                    class="rounded-md"
                />
                <Input
                    :label="t('systemSettings.confirmPassword')"
                    v-model="passwordForm.confirmPassword"
                    type="password"
                    :placeholder="t('systemSettings.confirmPasswordPlaceholder')"
                    class="rounded-md"
                />
            </div>
            <div class="mt-5">
                <button
                    @click="handleUpdatePassword"
                    :disabled="isUpdatingPassword || !passwordForm.newPassword"
                    class="px-4 py-1.5 rounded-md text-accent-fg text-xs font-semibold shadow-none transition-colors flex items-center gap-2 bg-accent border border-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Loader2 v-if="isUpdatingPassword" class="animate-spin h-4 w-4 text-fg-subtle" />
                    <span>{{
                        isUpdatingPassword
                            ? t('systemSettings.updating')
                            : t('systemSettings.updatePassword')
                    }}</span>
                </button>
            </div>
        </section>

        <!-- 危险区域 -->
        <section class="rounded-lg border border-red-900/50 bg-surface p-6">
            <SectionHeader
                :title="t('systemSettings.dangerZoneTitle')"
                :description="t('systemSettings.dangerZoneDesc')"
            >
                <template #icon>
                    <AlertTriangle class="h-4 w-4 text-red-400" />
                </template>
            </SectionHeader>

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
                        @click="handleReset"
                        class="px-4 py-1.5 rounded-md text-red-400 text-xs font-semibold border border-red-900/60 bg-transparent hover:bg-red-950/40 hover:text-red-300 transition-colors"
                    >
                        {{ t('systemSettings.factoryResetTitle') }}
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>
