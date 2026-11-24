<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Eye, EyeOff, MessageSquare, RefreshCw, Reply, Trash2 } from '@lucide/vue';
import { useToastStore } from '@/stores/toast.js';
import { api } from '@/lib/http.js';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const { showToast } = useToastStore();
const { t } = useI18n();

const messages = ref([]);
const loading = ref(false);
const filterStatus = ref('all');
const replyingId = ref(null);
const replyContent = ref('');

const defaultGuestbookConfig = {
  enabled: false,
  allowAnonymous: true,
};

const ensureGuestbookConfig = () => {
  if (!props.settings.guestbook) {
    props.settings.guestbook = { ...defaultGuestbookConfig };
  }
};

ensureGuestbookConfig();

watch(
  () => props.settings.guestbook,
  (val) => {
    if (!val) ensureGuestbookConfig();
  },
);

// 确保 guestbook settings 存在
const guestbookConfig = computed(() => props.settings.guestbook || defaultGuestbookConfig);

const fetchMessages = async () => {
  loading.value = true;
  try {
    const data = await api.get('/api/guestbook/manage');
    if (data.success) {
      messages.value = data.data;
    } else {
      showToast(data.message || t('settings.guestbookFetchFailed'), 'error');
    }
  } catch (e) {
    showToast(t('settings.networkError'), 'error');
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const filteredMessages = computed(() => {
  if (filterStatus.value === 'all') return messages.value;
  return messages.value.filter((m) => {
    if (filterStatus.value === 'pending') return m.status === 'pending';
    if (filterStatus.value === 'approved') return m.status === 'approved';
    if (filterStatus.value === 'replied') return m.status === 'replied';
    return true;
  });
});

const handleAction = async (action, id, payload = {}) => {
  try {
    const data = await api.post('/api/guestbook/manage', { action, id, ...payload });

    if (data.success) {
      showToast(t('settings.guestbookActionSuccess'), 'success');
      if (action === 'delete') {
        messages.value = messages.value.filter((m) => m.id !== id);
      } else {
        const index = messages.value.findIndex((m) => m.id === id);
        if (index !== -1) {
          messages.value[index] = data.data;
        }
      }
      if (action === 'reply') {
        replyingId.value = null;
        replyContent.value = '';
      }
    } else {
      showToast(data.message || t('settings.guestbookActionFailed'), 'error');
    }
  } catch (e) {
    showToast(t('settings.networkError'), 'error');
    console.error(e);
  }
};

const startReply = (msg) => {
  replyingId.value = msg.id;
  replyContent.value = msg.reply || '';
};

const cancelReply = () => {
  replyingId.value = null;
  replyContent.value = '';
};

const submitReply = (id) => {
  if (!replyContent.value.trim()) return;
  handleAction('reply', id, { replyContent: replyContent.value });
};

const formatDate = (isoString) => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString();
};

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'pending':
      return 'border border-line bg-transparent text-amber-400 font-mono';
    case 'approved':
      return 'border border-line bg-transparent text-emerald-400 font-mono';
    case 'replied':
      return 'border border-line bg-transparent text-sky-400 font-mono';
    default:
      return 'border border-line bg-transparent text-fg-muted font-mono';
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'pending':
      return t('settings.guestbookPending');
    case 'approved':
      return t('settings.guestbookApproved');
    case 'replied':
      return t('settings.guestbookReplied');
    default:
      return status;
  }
};

const getTypeLabel = (type) => {
  switch (type) {
    case 'bug':
      return t('settings.guestbookBug');
    case 'feature':
      return t('settings.guestbookFeature');
    default:
      return t('settings.guestbookNormal');
  }
};

onMounted(() => {
  fetchMessages();
});
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <!-- 头部说明 & 开关 -->
    <SectionHeader
      :description="t('settings.guestbookEnableDesc')"
      :no-margin="!guestbookConfig.enabled"
      :title="t('settings.guestbookTitle')"
    >
      <template #icon>
        <MessageSquare class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch v-model="guestbookConfig.enabled" />
      </template>
    </SectionHeader>

    <!-- {{ t('settings.guestbookTitle') }}区域 -->
    <div v-if="guestbookConfig.enabled" class="pt-6 border-t border-line">
      <div class="pb-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-fg">
            {{ t('settings.guestbookList') }}
          </h3>
          <span class="px-2 py-0.5 rounded-md border border-line bg-transparent font-mono text-xs text-fg-muted">{{
            messages.length
          }}</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="w-full sm:w-36">
            <Select
              v-model="filterStatus"
              :options="[
                { value: 'all', label: t('settings.guestbookAllStatus') },
                { value: 'pending', label: t('settings.guestbookPending') },
                { value: 'approved', label: t('settings.guestbookApproved') },
                { value: 'replied', label: t('settings.guestbookReplied') },
              ]"
              size="sm"
            />
          </div>
          <button
            :aria-label="t('actions.refresh')"
            class="p-1.5 rounded-md border border-line text-fg-muted hover:bg-hover hover:text-fg"
            @click="fetchMessages"
          >
            <RefreshCw class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="divide-y divide-line-subtle">
        <div v-if="loading" class="py-8 text-center text-xs text-fg-muted">
          {{ t('settings.guestbookLoading') }}
        </div>
        <div v-else-if="filteredMessages.length === 0" class="py-8 text-center text-xs text-fg-muted">
          {{ t('settings.guestbookEmpty') }}
        </div>

        <div v-for="msg in filteredMessages" :key="msg.id" class="py-5 first:pt-4 last:pb-0 transition-colors">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2.5">
              <span class="text-sm font-medium text-fg">{{ msg.nickname || t('settings.guestbookAnonymous') }}</span>
              <span class="text-xs font-mono px-2 py-0.5 rounded-md border border-line bg-transparent text-fg-muted">
                {{ getTypeLabel(msg.type) }}
              </span>
              <span :class="['text-xs px-2 py-0.5 rounded-md', getStatusBadgeClass(msg.status)]">
                {{ getStatusLabel(msg.status) }}
              </span>
            </div>
            <span class="text-xs font-mono text-fg-subtle">{{ formatDate(msg.createdAt) }}</span>
          </div>

          <div class="mb-3 text-sm text-fg-muted break-words leading-relaxed">
            {{ msg.content }}
          </div>

          <div v-if="msg.reply && replyingId !== msg.id" class="mb-3 pl-4 border-l-2 border-line py-1">
            <div class="text-xs text-fg-muted font-medium mb-0.5 flex justify-between">
              <span>{{ t('settings.guestbookAdminReply') }}</span>
              <span class="text-fg-subtle font-mono font-normal">{{ formatDate(msg.replyAt) }}</span>
            </div>
            <div class="text-xs text-fg-muted leading-relaxed">{{ msg.reply }}</div>
          </div>

          <div v-if="replyingId === msg.id" class="mb-3 pl-4 border-l-2 border-line">
            <Textarea
              v-model="replyContent"
              :placeholder="t('settings.guestbookReplyPlaceholder')"
              class="sm:text-sm px-3 py-2"
              rows="3"
            />
            <div class="mt-2.5 flex justify-end gap-2">
              <button
                class="px-3 py-1.5 text-xs font-medium text-fg-muted border border-line bg-transparent hover:bg-hover rounded-md"
                @click="cancelReply"
              >
                {{ t('actions.cancel') }}
              </button>
              <button
                class="px-3 py-1.5 text-xs font-semibold text-accent-fg bg-accent border border-accent hover:opacity-90 rounded-md shadow-none"
                @click="submitReply(msg.id)"
              >
                {{ t('settings.guestbookSendReply') }}
              </button>
            </div>
          </div>

          <div class="flex items-center gap-4 text-xs">
            <button
              v-if="!msg.isVisible"
              class="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
              @click="handleAction('toggle', msg.id)"
            >
              <Eye class="w-3.5 h-3.5" />
              {{ t('settings.guestbookApproveShow') }}
            </button>
            <button
              v-else
              class="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
              @click="handleAction('toggle', msg.id)"
            >
              <EyeOff class="w-3.5 h-3.5" />
              {{ t('settings.guestbookHide') }}
            </button>

            <button class="text-fg-muted hover:text-fg font-medium flex items-center gap-1" @click="startReply(msg)">
              <Reply class="w-3.5 h-3.5" />
              {{ t('settings.guestbookReply') }}
            </button>

            <button
              class="text-red-400 hover:text-red-300 font-medium flex items-center gap-1 ml-auto"
              @click="handleAction('delete', msg.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
              {{ t('actions.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
