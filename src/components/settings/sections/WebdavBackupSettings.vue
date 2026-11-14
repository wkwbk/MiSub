<script setup>
    import { ref } from 'vue';
    import { CloudDownload } from 'lucide-vue-next';
    import { api } from '../../../lib/http.js';
    import { useToastStore } from '../../../stores/toast.js';
    import { useI18n } from '../../../i18n/index.js';
    import { confirmAction } from '../../../composables/useConfirm.js';
    import Input from '../../ui/Input.vue';
    import Select from '../../ui/Select.vue';
    import SectionHeader from '../SectionHeader.vue';

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const { showToast } = useToastStore();
    const { t } = useI18n();
    const isTesting = ref(false);
    const isBackingUp = ref(false);
    const isRestoring = ref(false);
    const isLoadingRemoteFiles = ref(false);
    const remoteFiles = ref([]);

    const ensureConfig = () => {
        if (!props.settings.webdavBackup) {
            props.settings.webdavBackup = {
                enabled: false,
                endpoint: '',
                username: '',
                password: '',
                remotePath: '/MiSub',
                filenameTemplate: 'misub-backup-{datetime}.json',
                backupScope: 'dataOnly',
                autoBackup: false,
                interval: 'daily',
                retentionCount: 7,
                lastCheckedAt: null,
                lastBackupAt: null,
                lastBackupStatus: null,
                lastBackupMessage: '',
                lastBackupFile: '',
            };
        }
        return props.settings.webdavBackup;
    };

    const testConnection = async () => {
        const config = ensureConfig();
        isTesting.value = true;
        try {
            const result = await api.post('/api/backup/webdav/test', { webdavBackup: config });
            if (!result.success) throw new Error(result.message || t('settings.webdavTestFailed'));
            showToast(result.message || t('settings.webdavTestSuccess'), 'success');
        } catch (error) {
            showToast(
                t('settings.webdavTestFailedWithMessage', { message: error.message }),
                'error'
            );
        } finally {
            isTesting.value = false;
        }
    };

    const runBackup = async () => {
        const config = ensureConfig();
        const confirmed = await confirmAction({
            message: t('settings.webdavRunBackupConfirm'),
        });
        if (!confirmed) return;
        isBackingUp.value = true;
        try {
            const result = await api.post('/api/backup/webdav/run', { scope: config.backupScope });
            if (!result.success)
                throw new Error(result.message || t('settings.webdavBackupFailed'));
            config.lastBackupAt = result.timestamp;
            config.lastBackupStatus = 'success';
            config.lastBackupMessage = result.message;
            config.lastBackupFile = result.file;
            showToast(t('settings.webdavBackupSuccess'), 'success');
        } catch (error) {
            showToast(
                t('settings.webdavBackupFailedWithMessage', { message: error.message }),
                'error'
            );
        } finally {
            isBackingUp.value = false;
        }
    };

    const restoreFromLocalFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                isRestoring.value = true;
                try {
                    const payload = JSON.parse(e.target.result);
                    const scope = payload?.scope || 'dataOnly';
                    const label =
                        scope === 'dataAndSettings'
                            ? t('settings.webdavScopeDataAndSettings')
                            : t('settings.webdavScopeDataOnly');
                    const confirmed = await confirmAction({
                        message: t('settings.webdavRestoreLocalConfirm', { scope: label }),
                        variant: 'danger',
                    });
                    if (!confirmed) return;
                    const result = await api.post('/api/backup/restore', { payload, scope });
                    if (!result.success)
                        throw new Error(result.message || t('settings.webdavRestoreFailed'));
                    showToast(t('settings.webdavRestoreSuccessReload'), 'success');
                    setTimeout(() => window.location.reload(), 800);
                } catch (error) {
                    showToast(
                        t('settings.webdavRestoreFailedWithMessage', { message: error.message }),
                        'error'
                    );
                } finally {
                    isRestoring.value = false;
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const loadRemoteFiles = async () => {
        isLoadingRemoteFiles.value = true;
        try {
            const result = await api.get('/api/backup/webdav/list');
            if (!result.success)
                throw new Error(result.message || t('settings.webdavLoadRemoteFailed'));
            remoteFiles.value = Array.isArray(result.data) ? result.data : [];
            showToast(
                t('settings.webdavLoadRemoteSuccess', { count: remoteFiles.value.length }),
                'success'
            );
        } catch (error) {
            showToast(
                t('settings.webdavLoadRemoteFailedWithMessage', { message: error.message }),
                'error'
            );
        } finally {
            isLoadingRemoteFiles.value = false;
        }
    };

    const restoreRemoteFile = async (file) => {
        if (!file?.path) return;
        const confirmed = await confirmAction({
            message: t('settings.webdavRestoreRemoteConfirm', { name: file.name }),
            variant: 'danger',
        });
        if (!confirmed) return;
        isRestoring.value = true;
        try {
            const result = await api.post('/api/backup/webdav/restore', { file: file.path });
            if (!result.success)
                throw new Error(result.message || t('settings.webdavRestoreFailed'));
            showToast(t('settings.webdavRestoreRemoteSuccessReload'), 'success');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            showToast(
                t('settings.webdavRestoreRemoteFailedWithMessage', { message: error.message }),
                'error'
            );
        } finally {
            isRestoring.value = false;
        }
    };

    const copyCronHint = async () => {
        try {
            const text = `${window.location.origin}/cron`;
            await navigator.clipboard.writeText(text);
            showToast(t('settings.webdavCronCopied'), 'success');
        } catch {
            showToast(t('settings.webdavCronCopyFailed'), 'error');
        }
    };

    ensureConfig();
</script>

<template>
    <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
        <SectionHeader
            :title="t('settings.webdavTitle')"
            :description="t('settings.webdavDesc')"
        >
            <template #icon>
                <CloudDownload class="h-4 w-4" />
            </template>
            <template #actions>
                <label class="flex items-center gap-2.5 text-xs font-medium text-zinc-200 cursor-pointer shrink-0">
                    <input
                        type="checkbox"
                        v-model="settings.webdavBackup.enabled"
                        class="h-4 w-4 text-zinc-100 rounded border-zinc-700 bg-zinc-900"
                    />
                    {{ t('settings.webdavEnable') }}
                </label>
            </template>
        </SectionHeader>

        <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                    :label="t('settings.webdavEndpoint')"
                    v-model="settings.webdavBackup.endpoint"
                    placeholder="https://dav.example.com/remote.php/dav/files/user"
                />
                <Input
                    :label="t('settings.webdavRemotePath')"
                    v-model="settings.webdavBackup.remotePath"
                    placeholder="/MiSub"
                />
                <Input
                    :label="t('settings.webdavUsername')"
                    v-model="settings.webdavBackup.username"
                    :placeholder="t('settings.webdavUsernamePlaceholder')"
                />
                <Input
                    :label="t('settings.webdavPassword')"
                    v-model="settings.webdavBackup.password"
                    type="password"
                    :placeholder="t('settings.webdavPasswordPlaceholder')"
                />
                <Input
                    :label="t('settings.webdavFilenameTemplate')"
                    v-model="settings.webdavBackup.filenameTemplate"
                    placeholder="misub-backup-{datetime}.json"
                />
                <Input
                    :label="t('settings.webdavRetentionCount')"
                    v-model.number="settings.webdavBackup.retentionCount"
                    type="number"
                    min="1"
                    max="100"
                />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-zinc-800/60">
                <div class="space-y-3">
                    <p class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        {{ t('settings.webdavBackupScope') }}
                    </p>
                    <label class="flex items-start gap-2.5 text-sm text-zinc-200 cursor-pointer">
                        <input
                            type="radio"
                            value="dataOnly"
                            v-model="settings.webdavBackup.backupScope"
                            class="mt-1 border-zinc-700 bg-zinc-900 text-zinc-100"
                        />
                        <span
                            ><strong class="font-medium">{{ t('settings.webdavScopeDataOnly') }}</strong
                            ><br /><span class="text-xs text-zinc-500 leading-relaxed">{{
                                t('settings.webdavScopeDataOnlyDesc')
                            }}</span></span
                        >
                    </label>
                    <label class="flex items-start gap-2.5 text-sm text-zinc-200 cursor-pointer">
                        <input
                            type="radio"
                            value="dataAndSettings"
                            v-model="settings.webdavBackup.backupScope"
                            class="mt-1 border-zinc-700 bg-zinc-900 text-zinc-100"
                        />
                        <span
                            ><strong class="font-medium">{{ t('settings.webdavScopeDataAndSettings') }}</strong
                            ><br /><span class="text-xs text-zinc-500 leading-relaxed">{{
                                t('settings.webdavScopeDataAndSettingsDesc')
                            }}</span></span
                        >
                    </label>
                </div>

                <div class="space-y-3">
                    <p class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        {{ t('settings.webdavRequestAutoBackup') }}
                    </p>
                    <label
                        class="flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            v-model="settings.webdavBackup.autoBackup"
                            class="h-4 w-4 text-zinc-100 rounded border-zinc-700 bg-zinc-900"
                        />
                        {{ t('settings.webdavEnableAutoBackup') }}
                    </label>
                    <Select
                        v-model="settings.webdavBackup.interval"
                        :options="[
                            { value: 'hourly', label: t('settings.webdavIntervalHourly') },
                            { value: 'daily', label: t('settings.webdavIntervalDaily') },
                            { value: 'weekly', label: t('settings.webdavIntervalWeekly') },
                            { value: 'monthly', label: t('settings.webdavIntervalMonthly') },
                        ]"
                    />
                    <p class="text-xs text-zinc-500 leading-relaxed">
                        {{ t('settings.webdavAutoBackupHint') }}
                    </p>
                </div>
            </div>

            <p class="flex items-start gap-2 text-xs text-zinc-500 leading-relaxed">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
                <span>{{ t('settings.webdavSecurityHint') }}</span>
            </p>

            <div class="pt-6 border-t border-zinc-800/60 flex flex-col lg:flex-row lg:items-end justify-between gap-6 text-xs">
                <div class="space-y-1.5 font-mono">
                    <p class="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                        {{ t('settings.webdavRecentStatus') }}
                    </p>
                    <p class="text-zinc-400">
                        {{ t('settings.webdavLastChecked') }}：{{
                            settings.webdavBackup.lastCheckedAt || t('settings.webdavNotChecked')
                        }}
                    </p>
                    <p class="text-zinc-400">
                        {{ t('settings.webdavLastBackup') }}：{{
                            settings.webdavBackup.lastBackupAt || t('settings.webdavNotBackedUp')
                        }}
                    </p>
                    <p class="text-zinc-400">
                        {{ t('settings.webdavLastResult') }}：{{
                            settings.webdavBackup.lastBackupStatus || t('settings.webdavNone')
                        }}
                    </p>
                    <p class="text-zinc-400 break-all">
                        {{ t('settings.webdavLastFile') }}：{{
                            settings.webdavBackup.lastBackupFile || t('settings.webdavNone')
                        }}
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2.5">
                    <button
                        @click="testConnection"
                        :disabled="isTesting"
                        class="px-3.5 py-1.5 text-xs font-medium text-zinc-300 rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                    >
                        {{
                            isTesting
                                ? t('settings.webdavTesting')
                                : t('settings.webdavTestConnection')
                        }}
                    </button>
                    <button
                        @click="runBackup"
                        :disabled="isBackingUp"
                        class="px-3.5 py-1.5 text-xs font-semibold text-zinc-900 rounded-md border border-zinc-100 bg-zinc-100 hover:bg-white disabled:opacity-50"
                    >
                        {{
                            isBackingUp
                                ? t('settings.webdavBackingUp')
                                : t('settings.webdavRunBackup')
                        }}
                    </button>
                    <button
                        @click="restoreFromLocalFile"
                        :disabled="isRestoring"
                        class="px-3.5 py-1.5 text-xs font-medium text-zinc-300 rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                    >
                        {{
                            isRestoring
                                ? t('settings.webdavRestoring')
                                : t('settings.webdavRestoreFromFile')
                        }}
                    </button>
                    <button
                        @click="loadRemoteFiles"
                        :disabled="isLoadingRemoteFiles"
                        class="px-3.5 py-1.5 text-xs font-medium text-zinc-300 rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                    >
                        {{
                            isLoadingRemoteFiles
                                ? t('settings.webdavLoadingRemote')
                                : t('settings.webdavLoadRemote')
                        }}
                    </button>
                    <button
                        @click="copyCronHint"
                        class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('settings.webdavCopyCron') }}
                    </button>
                </div>
            </div>

            <div
                v-if="remoteFiles.length"
                class="pt-6 border-t border-zinc-800/60"
            >
                <p class="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                    {{ t('settings.webdavRemoteFiles') }}
                </p>
                <div class="divide-y divide-zinc-800/60 max-h-56 overflow-y-auto">
                    <div
                        v-for="file in remoteFiles"
                        :key="file.path"
                        class="flex items-center justify-between gap-3 py-2.5"
                    >
                        <span class="text-xs font-mono text-zinc-300 break-all">{{
                            file.name
                        }}</span>
                        <button
                            @click="restoreRemoteFile(file)"
                            :disabled="isRestoring"
                            class="shrink-0 px-3 py-1 text-xs font-medium text-zinc-300 rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                        >
                            {{ t('settings.webdavRestore') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
