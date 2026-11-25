import {
  useMutation,
  useQuery,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import type { WebdavBackupConfig, WebdavRemoteFile } from '@misub/core/types.js';
import {
  listWebdavBackups,
  restoreLocalBackup,
  restoreWebdavBackup,
  runWebdavBackup,
  testWebdavConnection,
  type BackupRestoreResponse,
  type WebdavActionResponse,
} from '@/lib/api.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';
import { t } from '@/i18n/index.js';

export interface LocalBackupRestoreVariables {
  payload: unknown;
  scope: string;
}

export type UseWebdavRemoteFilesQueryOptions = Omit<
  UseQueryOptions<WebdavRemoteFile[], Error, WebdavRemoteFile[], typeof QUERY_KEYS.webdavRemoteFiles>,
  'queryKey' | 'queryFn'
> & {
  queryClient?: QueryClient;
};

export interface UseWebdavTestMutationOptions
  extends Omit<UseMutationOptions<WebdavActionResponse, Error, Partial<WebdavBackupConfig>>, 'mutationFn'> {
  queryClient?: QueryClient;
}

export interface UseWebdavRunBackupMutationOptions {
  queryClient?: QueryClient;
  onSuccess?: (data: WebdavActionResponse, variables: string) => unknown | Promise<unknown>;
  onError?: (error: Error, variables: string) => unknown | Promise<unknown>;
}

export interface UseWebdavRestoreRemoteMutationOptions
  extends Omit<UseMutationOptions<WebdavActionResponse, Error, string>, 'mutationFn'> {
  queryClient?: QueryClient;
}

export interface UseLocalBackupRestoreMutationOptions
  extends Omit<UseMutationOptions<BackupRestoreResponse | null, Error, LocalBackupRestoreVariables>, 'mutationFn'> {
  queryClient?: QueryClient;
}

export function useWebdavRemoteFilesQuery(options: UseWebdavRemoteFilesQueryOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useQuery(
    {
      queryKey: QUERY_KEYS.webdavRemoteFiles,
      enabled: false,
      queryFn: async (): Promise<WebdavRemoteFile[]> => {
        const result = await listWebdavBackups();
        if (!result?.success) {
          throw new Error(String(result?.message || result?.error || t('settings.webdavLoadRemoteFailed')));
        }
        return Array.isArray(result.data) ? result.data : [];
      },
      ...options,
    },
    queryClient,
  );
}

export function useWebdavTestMutation(options: UseWebdavTestMutationOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: async (config: Partial<WebdavBackupConfig>): Promise<WebdavActionResponse> => {
        const result = await testWebdavConnection(config);
        if (!result?.success) {
          throw new Error(String(result?.message || result?.error || t('settings.webdavTestFailed')));
        }
        return result;
      },
      ...options,
    },
    queryClient,
  );
}

export function useWebdavRunBackupMutation(options: UseWebdavRunBackupMutationOptions = {}) {
  const { queryClient: customClient, onSuccess, ...rest } = options;
  const queryClient = customClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: async (scope: string): Promise<WebdavActionResponse> => {
        const result = await runWebdavBackup(scope);
        if (!result?.success) {
          throw new Error(String(result?.message || result?.error || t('settings.webdavBackupFailed')));
        }
        return result;
      },
      ...rest,
      onSuccess: async (data, variables) => {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.webdavRemoteFiles });
        await onSuccess?.(data, variables);
      },
    },
    queryClient,
  );
}

export function useWebdavRestoreRemoteMutation(options: UseWebdavRestoreRemoteMutationOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: async (filePath: string): Promise<WebdavActionResponse> => {
        const result = await restoreWebdavBackup(filePath);
        if (!result?.success) {
          throw new Error(String(result?.message || result?.error || t('settings.webdavRestoreFailed')));
        }
        return result;
      },
      ...options,
    },
    queryClient,
  );
}

export function useLocalBackupRestoreMutation(options: UseLocalBackupRestoreMutationOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: async ({ payload, scope }: LocalBackupRestoreVariables): Promise<BackupRestoreResponse | null> => {
        const result = await restoreLocalBackup(payload, scope);
        if (!result?.success) {
          throw new Error(String(result?.message || result?.error || t('settings.webdavRestoreFailed')));
        }
        return result;
      },
      ...options,
    },
    queryClient,
  );
}
