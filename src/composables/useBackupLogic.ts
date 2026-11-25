import { useToastStore } from '@/stores/useToastStore.js';
import { exportLocalBackup, restoreLocalBackup } from '@/lib/api.js';
import { t } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { downloadJsonFile, pickAndReadJsonFile } from '@/utils/import-file.js';

export type BackupScope = 'dataOnly' | 'dataAndSettings';

interface BackupFilePayload {
  scope?: string;
  [key: string]: unknown;
}

/**
 * 备份和恢复逻辑 composable
 *
 * 本地导出/导入与 WebDAV 备份/恢复共用后端统一备份格式：
 * - dataOnly：订阅/手动节点/订阅组/自定义规则模板
 * - dataAndSettings：dataOnly + 设置（后端会排除 WebDAV 配置本身和运行密钥）
 */
export function useBackupLogic() {
  const { showToast } = useToastStore();

  /**
   * 导出本地备份。
   * 默认导出“仅数据”，避免把设置/Token 带入普通本地备份；WebDAV UI 可单独选择范围。
   */
  const exportBackup = async (scope: BackupScope = 'dataOnly'): Promise<void> => {
    try {
      const result = await exportLocalBackup(scope);
      if (!result?.success || !result.exportData) {
        throw new Error(result?.message || t('backup.exportFailed'));
      }
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      downloadJsonFile(result.exportData, `misub-backup-${result.exportData.scope || scope}-${timestamp}.json`);
      showToast(t('backup.exportSuccess'), 'success');
    } catch (error: unknown) {
      console.error('Backup export failed:', error);
      showToast(
        t('backup.exportFailedWithMessage', { message: extractErrorMessage(error, t('backup.exportFailed')) }),
        'error',
      );
    }
  };

  /**
   * 导入本地备份。
   * 后端执行集合级恢复，不会清空整个 D1 数据库；旧版本地备份格式也由后端兼容。
   */
  const importBackup = async (): Promise<void> => {
    try {
      const picked = await pickAndReadJsonFile<BackupFilePayload>('application/json');
      if (!picked) return;

      const data = picked.data;
      const scope = data?.scope || 'dataOnly';
      const scopeLabel = scope === 'dataAndSettings' ? t('backup.scopeDataAndSettings') : t('backup.scopeDataOnly');
      const message = t('backup.restoreConfirm', { scope: scopeLabel });
      const confirmed = await confirmAction({ message, variant: 'danger' });
      if (!confirmed) return;

      const result = await restoreLocalBackup(data, scope);
      if (!result?.success) {
        throw new Error(result?.message || t('backup.restoreFailed'));
      }
      showToast(t('backup.restoreSuccess'), 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (err: unknown) {
      showToast(
        t('backup.importFailedWithMessage', { message: extractErrorMessage(err, t('backup.restoreFailed')) }),
        'error',
      );
    }
  };

  return {
    exportBackup,
    importBackup,
  };
}
