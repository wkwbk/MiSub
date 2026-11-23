<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronDown, ClipboardList, Loader2 } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useToastStore } from '@/stores/toast';
import { getClientInfo } from '@/lib/utils';
import { api } from '@/lib/http.js';
import { useI18n } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';

const props = defineProps({
  show: Boolean,
  filterProfileName: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:show']);

const { showToast } = useToastStore();
const { t, locale } = useI18n();
const logs = ref([]);
const isLoading = ref(false);
const isClearing = ref(false);
const expandedLogId = ref(null);

const currentPage = ref(1);
const pageSize = 20;

const filteredLogs = computed(() => {
  if (!props.filterProfileName) return logs.value;
  return logs.value.filter((log) => log.profileName === props.filterProfileName);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / pageSize)));
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return filteredLogs.value.slice(start, end);
});

const fetchLogs = async () => {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const data = await api.get(`/api/logs?t=${Date.now()}`);
    logs.value = data.data || [];
    currentPage.value = 1;
  } catch (e) {
    showToast(t('logs.fetchFailed'), 'error');
  } finally {
    isLoading.value = false;
  }
};

const canClearLogs = computed(() => !isLoading.value && !isClearing.value && filteredLogs.value.length > 0);

const clearLogs = async () => {
  if (!canClearLogs.value) return;
  const targetProfileName = props.filterProfileName || '';
  const confirmed = await confirmAction({
    message: targetProfileName ? t('logs.clearProfileConfirm', { name: targetProfileName }) : t('logs.clearConfirm'),
    variant: 'danger',
  });
  if (!confirmed) return;

  isClearing.value = true;
  try {
    const endpoint = targetProfileName ? `/api/logs?profileName=${encodeURIComponent(targetProfileName)}` : '/api/logs';
    await api.del(endpoint);
    if (targetProfileName) {
      logs.value = logs.value.filter((log) => log.profileName !== targetProfileName);
    } else {
      logs.value = [];
    }
    currentPage.value = 1;
    showToast(t('logs.clearSuccess'), 'success');
  } catch (e) {
    showToast(t('logs.clearFailed'), 'error');
  } finally {
    isClearing.value = false;
  }
};

const formatTime = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleString(locale.value, { hour12: false });
};

const toggleExpand = (id) => {
  expandedLogId.value = expandedLogId.value === id ? null : id;
};

const logListScrollRef = ref(null);

const scrollLogListToStart = () => {
  nextTick(() => {
    scrollToPaginationStart(logListScrollRef.value);
  });
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    scrollLogListToStart();
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    scrollLogListToStart();
  }
};

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      fetchLogs();
    }
  },
);
</script>

<template>
  <Modal :show="show" :show-confirm="false" class="log-modal" size="4xl" @update:show="emit('update:show', $event)">
    <template #title>
      <div class="flex justify-between items-center w-full gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base font-semibold text-fg shrink-0">{{ t('logs.title') }}</span>
          <span
            v-if="filterProfileName"
            :title="filterProfileName"
            class="text-xs px-2 py-0.5 rounded-md border border-line bg-transparent text-fg-muted truncate"
          >
            {{ filterProfileName }}
          </span>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            :disabled="isLoading || isClearing"
            class="text-xs px-2.5 py-1 rounded-md border border-line bg-transparent hover:bg-hover transition-colors text-fg-muted hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            @click="fetchLogs"
          >
            {{ t('common.refresh') }}
          </button>
          <button
            :disabled="!canClearLogs"
            class="text-xs px-2.5 py-1 rounded-md border border-red-900/60 bg-transparent hover:bg-red-950/30 transition-colors text-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            @click="clearLogs"
          >
            {{ t('common.clear') }}
          </button>
        </div>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col h-[60vh]">
        <div ref="logListScrollRef" class="flex-1 overflow-y-auto pr-2 min-h-0">
          <div v-if="isLoading" class="py-12 text-center text-fg-subtle">
            <Loader2 class="animate-spin h-6 w-6 mx-auto mb-2 text-fg-muted" />
            {{ t('common.loading') }}
          </div>
          <div v-else-if="filteredLogs.length === 0" class="py-16 text-center">
            <ClipboardList class="mx-auto h-10 w-10 text-fg-subtle" />
            <p class="mt-2 text-xs text-fg-subtle">
              {{ filterProfileName ? t('logs.emptyForProfile') : t('logs.empty') }}
            </p>
          </div>
          <ul v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <li
              v-for="log in paginatedLogs"
              :key="log.id || log.timestamp"
              class="bg-transparent rounded-md p-3 text-xs border border-line relative overflow-hidden group hover:border-line-strong transition-colors cursor-pointer"
              @click="toggleExpand(log.id)"
            >
              <div>
                <div class="flex justify-between items-start mb-1.5 gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      :class="{
                        'bg-emerald-400': log.status === 'success',
                        'bg-amber-400': log.status === 'partial',
                        'bg-red-400': log.status === 'error',
                      }"
                      class="h-1.5 w-1.5 shrink-0 rounded-full"
                    ></span>
                    <span class="font-semibold text-fg truncate text-xs">
                      {{ log.profileName || 'Unknown Profile' }}
                    </span>
                  </div>
                  <span
                    class="shrink-0 px-1.5 py-0.5 rounded-md border border-line bg-transparent font-mono text-xs font-medium text-fg-muted whitespace-nowrap"
                  >
                    {{ getClientInfo(log.userAgent).name }}
                  </span>
                </div>

                <div class="flex flex-col gap-1 text-xs text-fg-muted">
                  <div class="flex justify-between items-center">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="text-xs px-1 py-px rounded-sm border border-line text-fg-subtle min-w-[24px] text-center"
                        >{{ t('logs.time') }}</span
                      >
                      <span class="font-mono text-xs text-fg-muted">{{ formatTime(log.timestamp) }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span
                      class="text-xs px-1 py-px rounded-sm border border-line text-fg-subtle min-w-[24px] text-center"
                      >{{ t('logs.location') }}</span
                    >
                    <span class="truncate text-fg-muted">
                      {{ log.geoInfo?.country || 'Unknown' }}
                      <span v-if="log.geoInfo?.city" class="text-fg-subtle text-xs"> / {{ log.geoInfo.city }}</span>
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span
                      class="font-mono text-xs px-1 py-px rounded-sm border border-line text-fg-subtle min-w-[24px] text-center"
                      >IP</span
                    >
                    <span class="font-mono text-xs text-fg-muted">{{ log.clientIp }}</span>
                  </div>
                </div>

                <div
                  v-show="expandedLogId === log.id"
                  class="mt-3 pt-3 border-t border-line text-xs space-y-1.5 animate-fadeIn"
                >
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div class="flex">
                      <span class="font-mono text-fg-subtle w-16 shrink-0">ISP:</span>
                      <span class="font-mono text-fg-muted truncate"
                        >{{ log.geoInfo?.isp || '-' }} ({{ log.geoInfo?.asn ? 'AS' + log.geoInfo.asn : '-' }})</span
                      >
                    </div>
                    <div class="flex">
                      <span class="text-fg-subtle w-16 shrink-0">{{ t('logs.duration') }}:</span>
                      <span class="font-mono text-fg-muted">{{ log.details?.duration || 0 }} ms</span>
                    </div>
                    <div class="flex col-span-1 sm:col-span-2">
                      <span class="text-fg-subtle w-16 shrink-0">{{ t('logs.nodes') }}:</span>
                      <span class="font-mono text-fg-muted truncate">
                        {{
                          t('logs.nodeSummary', {
                            total: log.details?.totalNodes || 0,
                            sources: log.details?.sourceCount || 0,
                            success: log.details?.successCount || 0,
                          })
                        }}
                      </span>
                    </div>
                    <div class="flex col-span-1 sm:col-span-2">
                      <span class="font-mono text-fg-subtle w-16 shrink-0">UA:</span>
                      <span :title="log.userAgent" class="font-mono text-fg-muted truncate">{{ log.userAgent }}</span>
                    </div>
                  </div>
                </div>

                <div v-show="expandedLogId !== log.id" class="mt-2 text-center">
                  <ChevronDown class="h-3.5 w-3.5 mx-auto text-fg-subtle" />
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div
          v-if="filteredLogs.length > 0"
          class="pt-4 mt-2 border-t border-line flex justify-between items-center shrink-0"
        >
          <span class="font-mono text-xs text-fg-muted">
            {{
              t('logs.pageSummary', {
                current: currentPage,
                total: totalPages,
                count: filteredLogs.length,
              })
            }}
          </span>
          <div class="flex gap-2">
            <button
              :disabled="currentPage === 1"
              class="px-3 py-1 text-xs border border-line rounded-md bg-transparent text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              @click="prevPage"
            >
              {{ t('common.previousPage') }}
            </button>
            <button
              :disabled="currentPage === totalPages"
              class="px-3 py-1 text-xs border border-line rounded-md bg-transparent text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              @click="nextPage"
            >
              {{ t('common.nextPage') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
