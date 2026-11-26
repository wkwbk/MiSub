import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useQuery, type QueryClient } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';

export interface AccessLogFilter {
  profileId?: string;
  profileName?: string;
}

export interface AccessLogEntry {
  id?: string;
  profileId?: string;
  profileName?: string;
  userAgent?: string;
  ip?: string;
  country?: string;
  city?: string;
  isp?: string;
  status?: string | number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ClearAccessLogsOptions {
  profileId?: string;
  profileName?: string;
}

export type AccessLogQueryKey = ReturnType<typeof QUERY_KEYS.accessLogs>;

export interface UseAccessLogsQueryOptions {
  enabled?: MaybeRefOrGetter<boolean>;
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number;
  refetchOnWindowFocus?: boolean;
  queryClient?: QueryClient;
}

function extractAccessLogs(response: unknown): AccessLogEntry[] {
  if (!response || typeof response !== 'object') return [];
  const data = (response as { data?: unknown }).data;
  return Array.isArray(data) ? (data as AccessLogEntry[]) : [];
}

export async function clearAccessLogsWithQuery(
  queryClient: QueryClient,
  { profileId = '', profileName = '' }: ClearAccessLogsOptions = {},
): Promise<unknown> {
  const queryParts: string[] = [];
  if (profileId) queryParts.push(`profileId=${encodeURIComponent(profileId)}`);
  if (profileName) queryParts.push(`profileName=${encodeURIComponent(profileName)}`);
  const queryStr = queryParts.join('&');
  const endpoint = queryStr ? `${API_ENDPOINTS.LOGS}?${queryStr}` : API_ENDPOINTS.LOGS;
  const result: unknown = await api.del(endpoint);
  queryClient.setQueriesData<AccessLogEntry[]>({ queryKey: QUERY_KEYS.accessLogsRoot }, (old) => {
    if (!Array.isArray(old)) return old;
    if (!profileId && !profileName) return [];
    return old.filter((log) => {
      if (profileId && log.profileId) return log.profileId !== profileId;
      if (profileName && log.profileName) return log.profileName !== profileName;
      return true;
    });
  });
  return result;
}

export function useAccessLogsQuery(
  filterSource: MaybeRefOrGetter<AccessLogFilter> = {},
  options: UseAccessLogsQueryOptions = {},
) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  const queryKey = computed<AccessLogQueryKey>(() => QUERY_KEYS.accessLogs(toValue(filterSource)));
  return useQuery(
    {
      queryKey,
      queryFn: async (): Promise<AccessLogEntry[]> => {
        const res: unknown = await api.get(`${API_ENDPOINTS.LOGS}?t=${Date.now()}`);
        return extractAccessLogs(res);
      },
      ...options,
    },
    queryClient,
  );
}
