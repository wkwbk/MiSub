import { useToastStore } from '@/stores/useToastStore.js';
import { api } from '@/lib/http.js';
import { t } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';

export type BackupScope = 'dataOnly' | 'dataAndSettings';

interface BackupExportResponse {
  success?: boolean;
  message?: string;
  exportData?: {
    scope?: string;
    [key: string]: unknown;
  };
}

interface BackupRestoreResponse {
  success?: boolean;
  message?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return String(error ?? '');
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

  const downloadJson = (data: unknown, filename: string): void => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 导出本地备份。
   * 默认导出“仅数据”，避免把设置/Token 带入普通本地备份；WebDAV UI 可单独选择范围。
   */
  const exportBackup = async (scope: BackupScope = 'dataOnly'): Promise<void> => {
    try {
      const result = (await api.post('/api/backup/export', { scope })) as BackupExportResponse | null;
      if (!result?.success || !result.exportData) {
        throw new Error(result?.message || t('backup.exportFailed'));
      }
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      downloadJson(result.exportData, `misub-backup-${result.exportData.scope || scope}-${timestamp}.json`);
      showToast(t('backup.exportSuccess'), 'success');
    } catch (error: unknown) {
      console.error('Backup export failed:', error);
      showToast(t('backup.exportFailedWithMessage', { message: getErrorMessage(error) }), 'error');
    }
  };

  /**
   * 导入本地备份。
   * 后端执行集合级恢复，不会清空整个 D1 数据库；旧版本地备份格式也由后端兼容。
   */
  const importBackup = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const rawText = typeof e.target?.result === 'string' ? e.target.result : '';
          const data = JSON.parse(rawText) as { scope?: string; [key: string]: unknown } | null;
          const scope = data?.scope || 'dataOnly';
          const scopeLabel = scope === 'dataAndSettings' ? t('backup.scopeDataAndSettings') : t('backup.scopeDataOnly');
          const message = t('backup.restoreConfirm', { scope: scopeLabel });
          const confirmed = await confirmAction({ message, variant: 'danger' });
          if (!confirmed) return;

          const result = (await api.post('/api/backup/restore', { payload: data, scope })) as BackupRestoreResponse | null;
          if (!result?.success) {
            throw new Error(result?.message || t('backup.restoreFailed'));
          }
          showToast(t('backup.restoreSuccess'), 'success');
          setTimeout(() => window.location.reload(), 800);
        } catch (err: unknown) {
          showToast(t('backup.importFailedWithMessage', { message: getErrorMessage(err) }), 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    exportBackup,
    importBackup,
  };
}
