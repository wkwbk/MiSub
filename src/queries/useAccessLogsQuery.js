import { computed, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';

export async function fetchAccessLogsWithQuery(queryClient) {
  const response = await api.get(`/api/logs?t=${Date.now()}`);
  const logs = Array.isArray(response?.data) ? response.data : [];
  queryClient?.setQueryData?.(QUERY_KEYS.accessLogs(), logs);
  return logs;
}

export async function clearAccessLogsWithQuery(queryClient, { profileId = '', profileName = '' } = {}) {
  const queryParts = [];
  if (profileId) queryParts.push(`profileId=${encodeURIComponent(profileId)}`);
  if (profileName) queryParts.push(`profileName=${encodeURIComponent(profileName)}`);
  const queryStr = queryParts.join('&');
  const endpoint = queryStr ? `/api/logs?${queryStr}` : '/api/logs';
  const result = await api.del(endpoint);
  await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accessLogsRoot });
  return result;
}

export function useAccessLogsQuery(filterSource = {}, options = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  const queryKey = computed(() => QUERY_KEYS.accessLogs(toValue(filterSource)));
  return useQuery(
    {
      queryKey,
      queryFn: async () => {
        const res = await api.get(`/api/logs?t=${Date.now()}`);
        return Array.isArray(res?.data) ? res.data : [];
      },
      ...options,
    },
    queryClient,
  );
}
