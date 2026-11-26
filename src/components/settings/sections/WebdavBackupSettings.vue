<script setup lang="ts">
import { computed } from 'vue';
import type { WebdavBackupConfig, WebdavRemoteFile } from '@misub/core/types.js';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';
import { CloudDownload } from '@lucide/vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import {
  useLocalBackupRestoreMutation,
  useWebdavRemoteFilesQuery,
  useWebdavRestoreRemoteMutation,
  useWebdavRunBackupMutation,
  useWebdavTestMutation,
} from '@/queries/useWebdavBackupQueries.js';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { pickAndReadJsonFile } from '@/utils/import-file.js';

interface BackupFilePayload {
  scope?: string;
  [key: string]: unknown;
}

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const { showToast } = useToastStore();
const { t } = useI18n();

const webdavConfig = computed<WebdavBackupConfig>(() => ({
  ...DEFAULT_SETTINGS.webdavBackup,
  ...props.settings?.webdavBackup,
}));

function updateWebdav(patch: Partial<WebdavBackupConfig>): void {
  emit('update:settings', {
    ...props.settings,
    webdavBackup: {
      ...webdavConfig.value,
      ...patch,
    },
  });
}

const testMutation = useWebdavTestMutation();
const runBackupMutation = useWebdavRunBackupMutation();
const restoreRemoteMutation = useWebdavRestoreRemoteMutation();
const restoreLocalMutation = useLocalBackupRestoreMutation();
const remoteFilesQuery = useWebdavRemoteFilesQuery();

const isTesting = computed(() => testMutation.isPending.value);
const isBackingUp = computed(() => runBackupMutation.isPending.value);
const isRestoring = computed(() => restoreRemoteMutation.isPending.value || restoreLocalMutation.isPending.value);
const isLoadingRemoteFiles = computed(() => remoteFilesQuery.isFetching.value);
const remoteFiles = computed<WebdavRemoteFile[]>(() => remoteFilesQuery.data.value ?? []);

const testConnection = async (): Promise<void> => {
  if (isTesting.value) return;
  const config = webdavConfig.value;
  if (!isValidHttpUrlString(config.endpoint || '')) {
    showToast(t('settings.webdavInvalidEndpoint'), 'error');
    return;
  }

  try {
    const result = await testMutation.mutateAsync(config);
    showToast(String(result.message || t('settings.webdavTestSuccess')), 'success');
  } catch (error: unknown) {
    showToast(
      t('settings.webdavTestFailedWithMessage', {
        message: extractErrorMessage(error, t('settings.webdavTestFailed')),
      }),
      'error',
    );
  }
};

const runBackup = async (): Promise<void> => {
  if (isBackingUp.value) return;
  const config = webdavConfig.value;
  const confirmed = await confirmAction({
    message: t('settings.webdavRunBackupConfirm'),
  });
  if (!confirmed) return;

  try {
    const result = await runBackupMutation.mutateAsync(config.backupScope || 'dataOnly');
    updateWebdav({
      lastBackupAt: result.timestamp ?? null,
      lastBackupStatus: 'success',
      lastBackupMessage: result.message || '',
      lastBackupFile: result.file || '',
    });
    showToast(t('settings.webdavBackupSuccess'), 'success');
  } catch (error: unknown) {
    showToast(
      t('settings.webdavBackupFailedWithMessage', {
        message: extractErrorMessage(error, t('settings.webdavBackupFailed')),
      }),
      'error',
    );
  }
};

const restoreFromLocalFile = async (): Promise<void> => {
  if (isRestoring.value) return;
  try {
    const picked = await pickAndReadJsonFile<BackupFilePayload>('application/json');
    if (!picked) return;

    const payload = picked.data;
    const scope = payload?.scope || 'dataOnly';
    const label =
      scope === 'dataAndSettings' ? t('settings.webdavScopeDataAndSettings') : t('settings.webdavScopeDataOnly');
    const confirmed = await confirmAction({
      message: t('settings.webdavRestoreLocalConfirm', { scope: label }),
      variant: 'danger',
    });
    if (!confirmed) return;

    await restoreLocalMutation.mutateAsync({ payload, scope });
    showToast(t('settings.webdavRestoreSuccessReload'), 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error: unknown) {
    showToast(
      t('settings.webdavRestoreFailedWithMessage', {
        message: extractErrorMessage(error, t('settings.webdavRestoreFailed')),
      }),
      'error',
    );
  }
};

const loadRemoteFiles = async (): Promise<void> => {
  if (isLoadingRemoteFiles.value) return;
  try {
    const result = await remoteFilesQuery.refetch();
    if (result.isError && result.error) {
      throw result.error;
    }
    const files = result.data || [];
    showToast(t('settings.webdavLoadRemoteSuccess', { count: files.length }), 'success');
  } catch (error: unknown) {
    showToast(
      t('settings.webdavLoadRemoteFailedWithMessage', {
        message: extractErrorMessage(error, t('settings.webdavLoadRemoteFailed')),
      }),
      'error',
    );
  }
};

const restoreRemoteFile = async (file: WebdavRemoteFile): Promise<void> => {
  if (!file?.path || isRestoring.value) return;
  const confirmed = await confirmAction({
    message: t('settings.webdavRestoreRemoteConfirm', { name: file.name }),
    variant: 'danger',
  });
  if (!confirmed) return;

  try {
    await restoreRemoteMutation.mutateAsync(file.path);
    showToast(t('settings.webdavRestoreRemoteSuccessReload'), 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error: unknown) {
    showToast(
      t('settings.webdavRestoreRemoteFailedWithMessage', {
        message: extractErrorMessage(error, t('settings.webdavRestoreFailed')),
      }),
      'error',
    );
  }
};

const copyCronHint = async (): Promise<void> => {
  const secret = props.settings?.cronSecret;
  const text = secret
    ? `${window.location.origin}/cron/backup?secret=${encodeURIComponent(secret)}`
    : `${window.location.origin}/cron/backup`;
  const copied = await copyTextToClipboard(text);
  showToast(copied ? t('settings.webdavCronCopied') : t('settings.webdavCronCopyFailed'), copied ? 'success' : 'error');
};
</script>

<template>
  <SettingCard :description="t('settings.webdavDesc')" :title="t('settings.webdavTitle')">
    <template #icon>
      <CloudDownload class="h-4 w-4" />
    </template>
    <template #actions>
      <Switch
        :aria-label="t('settings.webdavEnable')"
        :model-value="Boolean(webdavConfig.enabled)"
        @update:model-value="updateWebdav({ enabled: Boolean($event) })"
      />
    </template>

    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          :label="t('settings.webdavEndpoint')"
          :model-value="webdavConfig.endpoint"
          placeholder="https://dav.example.com/remote.php/dav/files/user"
          @update:model-value="updateWebdav({ endpoint: String($event ?? '') })"
        />
        <Input
          :label="t('settings.webdavRemotePath')"
          :model-value="webdavConfig.remotePath"
          placeholder="/MiSub"
          @update:model-value="updateWebdav({ remotePath: String($event ?? '') })"
        />
        <Input
          :label="t('settings.webdavUsername')"
          :model-value="webdavConfig.username"
          :placeholder="t('settings.webdavUsernamePlaceholder')"
          @update:model-value="updateWebdav({ username: String($event ?? '') })"
        />
        <Input
          :label="t('settings.webdavPassword')"
          :model-value="webdavConfig.password"
          :placeholder="t('settings.webdavPasswordPlaceholder')"
          type="password"
          @update:model-value="updateWebdav({ password: String($event ?? '') })"
        />
        <Input
          :label="t('settings.webdavFilenameTemplate')"
          :model-value="webdavConfig.filenameTemplate"
          placeholder="misub-backup-{datetime}.json"
          @update:model-value="updateWebdav({ filenameTemplate: String($event ?? '') })"
        />
        <Input
          :label="t('settings.webdavRetentionCount')"
          :model-value="webdavConfig.retentionCount"
          max="100"
          min="1"
          type="number"
          @update:model-value="updateWebdav({ retentionCount: Number($event) || 1 })"
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
                webdavConfig.backupScope === 'dataOnly'
                  ? 'border-line-strong bg-inset'
                  : 'border-line bg-inset/40 hover:border-line-strong'
              "
              class="flex items-start gap-2.5 rounded-md border p-3.5 text-sm text-fg cursor-pointer transition-colors"
            >
              <input
                :checked="webdavConfig.backupScope === 'dataOnly'"
                class="mt-1 border-line-strong bg-elevated-card text-fg"
                type="radio"
                value="dataOnly"
                @change="updateWebdav({ backupScope: 'dataOnly' })"
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
                webdavConfig.backupScope === 'dataAndSettings'
                  ? 'border-line-strong bg-inset'
                  : 'border-line bg-inset/40 hover:border-line-strong'
              "
              class="flex items-start gap-2.5 rounded-md border p-3.5 text-sm text-fg cursor-pointer transition-colors"
            >
              <input
                :checked="webdavConfig.backupScope === 'dataAndSettings'"
                class="mt-1 border-line-strong bg-elevated-card text-fg"
                type="radio"
                value="dataAndSettings"
                @change="updateWebdav({ backupScope: 'dataAndSettings' })"
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
              <Switch
                :model-value="Boolean(webdavConfig.autoBackup)"
                size="sm"
                @update:model-value="updateWebdav({ autoBackup: Boolean($event) })"
              />
            </div>
            <div>
              <Select
                :disabled="!webdavConfig.autoBackup"
                :model-value="webdavConfig.interval"
                :options="[
                  { value: 'hourly', label: t('settings.webdavIntervalHourly') },
                  { value: 'daily', label: t('settings.webdavIntervalDaily') },
                  { value: 'weekly', label: t('settings.webdavIntervalWeekly') },
                  { value: 'monthly', label: t('settings.webdavIntervalMonthly') },
                ]"
                @update:model-value="
                  updateWebdav({ interval: String($event) as WebdavBackupConfig['interval'] })
                "
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
              {{ webdavConfig.lastCheckedAt || t('settings.webdavNotChecked') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastBackup') }}</span>
            <span class="block font-mono text-xs text-fg truncate">
              {{ webdavConfig.lastBackupAt || t('settings.webdavNotBackedUp') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastResult') }}</span>
            <span class="block font-mono text-xs text-fg truncate">
              {{ webdavConfig.lastBackupStatus || t('settings.webdavNone') }}
            </span>
          </div>
          <div class="rounded-md border border-line bg-inset/40 px-3.5 py-2.5 space-y-1">
            <span class="block text-xs text-fg-muted">{{ t('settings.webdavLastFile') }}</span>
            <span
              :title="webdavConfig.lastBackupFile || t('settings.webdavNone')"
              class="block font-mono text-xs text-fg truncate"
            >
              {{ webdavConfig.lastBackupFile || t('settings.webdavNone') }}
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
  </SettingCard>
</template>
