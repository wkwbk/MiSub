<script setup>
import { ref } from 'vue';
import { CloudDownload } from '@lucide/vue';
import { api } from '@/lib/http.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { copyTextToClipboard } from '@/utils/clipboard.js';

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
  if (isTesting.value) return;
  const config = ensureConfig();
  isTesting.value = true;
  try {
    const result = await api.post('/api/backup/webdav/test', { webdavBackup: config });
    if (!result.success) throw new Error(result.message || t('settings.webdavTestFailed'));
    showToast(result.message || t('settings.webdavTestSuccess'), 'success');
  } catch (error) {
    showToast(t('settings.webdavTestFailedWithMessage', { message: error.message }), 'error');
  } finally {
    isTesting.value = false;
  }
};

const runBackup = async () => {
  if (isBackingUp.value) return;
  const config = ensureConfig();
  const confirmed = await confirmAction({
    message: t('settings.webdavRunBackupConfirm'),
  });
  if (!confirmed) return;
  isBackingUp.value = true;
  try {
    const result = await api.post('/api/backup/webdav/run', { scope: config.backupScope });
    if (!result.success) throw new Error(result.message || t('settings.webdavBackupFailed'));
    config.lastBackupAt = result.timestamp;
    config.lastBackupStatus = 'success';
    config.lastBackupMessage = result.message;
    config.lastBackupFile = result.file;
    showToast(t('settings.webdavBackupSuccess'), 'success');
  } catch (error) {
    showToast(t('settings.webdavBackupFailedWithMessage', { message: error.message }), 'error');
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
          scope === 'dataAndSettings' ? t('settings.webdavScopeDataAndSettings') : t('settings.webdavScopeDataOnly');
        const confirmed = await confirmAction({
          message: t('settings.webdavRestoreLocalConfirm', { scope: label }),
          variant: 'danger',
        });
        if (!confirmed) return;
        const result = await api.post('/api/backup/restore', { payload, scope });
        if (!result.success) throw new Error(result.message || t('settings.webdavRestoreFailed'));
        showToast(t('settings.webdavRestoreSuccessReload'), 'success');
        setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        showToast(t('settings.webdavRestoreFailedWithMessage', { message: error.message }), 'error');
      } finally {
        isRestoring.value = false;
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

const loadRemoteFiles = async () => {
  if (isLoadingRemoteFiles.value) return;
  isLoadingRemoteFiles.value = true;
  try {
    const result = await api.get('/api/backup/webdav/list');
    if (!result.success) throw new Error(result.message || t('settings.webdavLoadRemoteFailed'));
    remoteFiles.value = Array.isArray(result.data) ? result.data : [];
    showToast(t('settings.webdavLoadRemoteSuccess', { count: remoteFiles.value.length }), 'success');
  } catch (error) {
    showToast(t('settings.webdavLoadRemoteFailedWithMessage', { message: error.message }), 'error');
  } finally {
    isLoadingRemoteFiles.value = false;
  }
};

const restoreRemoteFile = async (file) => {
  if (!file?.path || isRestoring.value) return;
  const confirmed = await confirmAction({
    message: t('settings.webdavRestoreRemoteConfirm', { name: file.name }),
    variant: 'danger',
  });
  if (!confirmed) return;
  isRestoring.value = true;
  try {
    const result = await api.post('/api/backup/webdav/restore', { file: file.path });
    if (!result.success) throw new Error(result.message || t('settings.webdavRestoreFailed'));
    showToast(t('settings.webdavRestoreRemoteSuccessReload'), 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    showToast(t('settings.webdavRestoreRemoteFailedWithMessage', { message: error.message }), 'error');
  } finally {
    isRestoring.value = false;
  }
};

const copyCronHint = async () => {
  const secret = props.settings?.cronSecret;
  const text = secret
    ? `${window.location.origin}/cron/backup?secret=${encodeURIComponent(secret)}`
    : `${window.location.origin}/cron/backup`;
  const copied = await copyTextToClipboard(text);
  showToast(copied ? t('settings.webdavCronCopied') : t('settings.webdavCronCopyFailed'), copied ? 'success' : 'error');
};

ensureConfig();
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <SectionHeader :description="t('settings.webdavDesc')" :title="t('settings.webdavTitle')">
      <template #icon>
        <CloudDownload class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch v-model="settings.webdavBackup.enabled" :aria-label="t('settings.webdavEnable')" />
      </template>
    </SectionHeader>

    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          v-model="settings.webdavBackup.endpoint"
          :label="t('settings.webdavEndpoint')"
          placeholder="https://dav.example.com/remote.php/dav/files/user"
        />
        <Input
          v-model="settings.webdavBackup.remotePath"
          :label="t('settings.webdavRemotePath')"
          placeholder="/MiSub"
        />
        <Input
          v-model="settings.webdavBackup.username"
          :label="t('settings.webdavUsername')"
          :placeholder="t('settings.webdavUsernamePlaceholder')"
        />
        <Input
          v-model="settings.webdavBackup.password"
          :label="t('settings.webdavPassword')"
          :placeholder="t('settings.webdavPasswordPlaceholder')"
          type="password"
        />
        <Input
          v-model="settings.webdavBackup.filenameTemplate"
          :label="t('settings.webdavFilenameTemplate')"
          placeholder="misub-backup-{datetime}.json"
        />
        <Input
          v-model.number="settings.webdavBackup.retentionCount"
          :label="t('settings.webdavRetentionCount')"
          max="100"
          min="1"
          type="number"
        />
      </div>

      <div class="space-y-6 pt-6 border-t border-line">
        <div class="space-y-3">
          <h4 class="text-xs font-semibold text-fg">
            {{ t('settings.webdavBackupScope') }}
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label
              :class="
                settings.webdavBackup.backupScope === 'dataOnly'
                  ? 'border-line-strong bg-inset'
                  : 'border-line bg-inset/40 hover:border-line-strong'
              "
              class="flex items-start gap-2.5 rounded-md border p-3.5 text-sm text-fg cursor-pointer transition-colors"
            >
              <input
                v-model="settings.webdavBackup.backupScope"
                class="mt-1 border-line-strong bg-elevated-card text-fg"
                type="radio"
                value="dataOnly"
              />
              <span class="space-y-0.5"
                ><span class="block text-sm font-medium text-fg">{{ t('settings.webdavScopeDataOnly') }}</span
                ><span class="block text-xs text-fg-muted leading-relaxed">{{
                  t('settings.webdavScopeDataOnlyDesc')
                }}</span></span
              >
            </label>
            <label
              :class="
                settings.webdavBackup.backupScope === 'dataAndSettings'
                  ? 'border-line-strong bg-inset'
                  : 'border-line bg-inset/40 hover:border-line-strong'
              "
              class="flex items-start gap-2.5 rounded-md border p-3.5 text-sm text-fg cursor-pointer transition-colors"
            >
              <input
                v-model="settings.webdavBackup.backupScope"
                class="mt-1 border-line-strong bg-elevated-card text-fg"
                type="radio"
                value="dataAndSettings"
              />
              <span class="space-y-0.5"
                ><span class="block text-sm font-medium text-fg">{{ t('settings.webdavScopeDataAndSettings') }}</span
                ><span class="block text-xs text-fg-muted leading-relaxed">{{
                  t('settings.webdavScopeDataAndSettingsDesc')
                }}</span></span
              >
            </label>
          </div>
          <p class="callout-warning">
            {{ t('settings.webdavSecurityHint') }}
          </p>
        </div>

        <div class="space-y-3 pt-6 border-t border-line">
          <h4 class="text-xs font-semibold text-fg">
            {{ t('settings.webdavRequestAutoBackup') }}
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div class="setting-switch-card">
              <span class="text-xs font-medium text-fg-muted">
                {{ t('settings.webdavEnableAutoBackup') }}
              </span>
              <Switch v-model="settings.webdavBackup.autoBackup" size="sm" />
            </div>
            <div>
              <Select
                v-model="settings.webdavBackup.interval"
                :disabled="!settings.webdavBackup.autoBackup"
                :options="[
                  { value: 'hourly', label: t('settings.webdavIntervalHourly') },
                  { value: 'daily', label: t('settings.webdavIntervalDaily') },
                  { value: 'weekly', label: t('settings.webdavIntervalWeekly') },
                  { value: 'monthly', label: t('settings.webdavIntervalMonthly') },
                ]"
              />
            </div>
          </div>
          <p class="text-xs text-fg-muted leading-relaxed">
            {{ t('settings.webdavAutoBackupHint') }}
          </p>
        </div>
      </div>

      <div class="pt-6 border-t border-line space-y-4 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h4 class="text-xs font-semibold text-fg">
            {{ t('settings.webdavRecentStatus') }}
          </h4>
          <div class="flex flex-wrap items-center gap-2">
            <button
              :disabled="isTesting"
              class="px-3.5 py-1.5 text-xs font-medium text-fg-muted rounded-md border border-line bg-transparent hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors"
              @click="testConnection"
            >
              {{ isTesting ? t('settings.webdavTesting') : t('settings.webdavTestConnection') }}
            </button>
            <button
              :disabled="isBackingUp"
              class="px-3.5 py-1.5 text-xs font-semibold text-accent-fg rounded-md border border-accent bg-accent hover:opacity-90 disabled:opacity-50 transition-colors"
              @click="runBackup"
            >
              {{ isBackingUp ? t('settings.webdavBackingUp') : t('settings.webdavRunBackup') }}
            </button>
            <button
              :disabled="isRestoring"
              class="px-3.5 py-1.5 text-xs font-medium text-fg-muted rounded-md border border-line bg-transparent hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors"
              @click="restoreFromLocalFile"
            >
              {{ isRestoring ? t('settings.webdavRestoring') : t('settings.webdavRestoreFromFile') }}
            </button>
            <button
              :disabled="isLoadingRemoteFiles"
              class="px-3.5 py-1.5 text-xs font-medium text-fg-muted rounded-md border border-line bg-transparent hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors"
              @click="loadRemoteFiles"
            >
              {{ isLoadingRemoteFiles ? t('settings.webdavLoadingRemote') : t('settings.webdavLoadRemote') }}
            </button>
            <button
              class="px-3.5 py-1.5 text-xs font-medium rounded-md border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="copyCronHint"
            >
              {{ t('settings.webdavCopyCron') }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastChecked') }}</span>
            <span class="block font-mono text-xs text-fg truncate">
              {{ settings.webdavBackup.lastCheckedAt || t('settings.webdavNotChecked') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastBackup') }}</span>
            <span class="block font-mono text-xs text-fg truncate">
              {{ settings.webdavBackup.lastBackupAt || t('settings.webdavNotBackedUp') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastResult') }}</span>
            <span class="block font-mono text-xs text-fg truncate">
              {{ settings.webdavBackup.lastBackupStatus || t('settings.webdavNone') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastFile') }}</span>
            <span
              :title="settings.webdavBackup.lastBackupFile || t('settings.webdavNone')"
              class="block font-mono text-xs text-fg truncate"
            >
              {{ settings.webdavBackup.lastBackupFile || t('settings.webdavNone') }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="remoteFiles.length" class="pt-6 border-t border-line">
        <h4 class="text-xs font-semibold text-fg mb-3">
          {{ t('settings.webdavRemoteFiles') }}
        </h4>
        <div class="divide-y divide-line-subtle max-h-56 overflow-y-auto">
          <div v-for="file in remoteFiles" :key="file.path" class="flex items-center justify-between gap-3 py-2.5">
            <span class="text-xs font-mono text-fg-muted break-all">{{ file.name }}</span>
            <button
              :disabled="isRestoring"
              class="shrink-0 px-3 py-1 text-xs font-medium text-fg-muted rounded-md border border-line bg-transparent hover:bg-hover hover:text-fg disabled:opacity-50"
              @click="restoreRemoteFile(file)"
            >
              {{ t('settings.webdavRestore') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
