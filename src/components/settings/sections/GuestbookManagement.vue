<script setup>
    import { ref, computed, onMounted, watch } from 'vue';
    import { Eye, EyeOff, MessageSquare, RefreshCw, Reply, Trash2 } from 'lucide-vue-next';
    import { useToastStore } from '../../../stores/toast.js';
    import { api } from '../../../lib/http.js';
    import Select from '../../ui/Select.vue';
    import Switch from '../../ui/Switch.vue';
    import SectionHeader from '../SectionHeader.vue';
    import { useI18n } from '../../../i18n/index.js';

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
    const filterStatus = ref('all'); // all, pending, approved, replied
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
        }
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
                // Update local state
                if (action === 'delete') {
                    messages.value = messages.value.filter((m) => m.id !== id);
                } else {
                    const index = messages.value.findIndex((m) => m.id === id);
                    if (index !== -1) {
                        messages.value[index] = data.data;
                    }
                }
                // Clear reply state if replying
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
                return 'border border-zinc-800 bg-transparent text-amber-400 font-mono';
            case 'approved':
                return 'border border-zinc-800 bg-transparent text-emerald-400 font-mono';
            case 'replied':
                return 'border border-zinc-800 bg-transparent text-sky-400 font-mono';
            default:
                return 'border border-zinc-800 bg-transparent text-zinc-400 font-mono';
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
    <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
        <!-- 头部说明 & 开关 -->
        <SectionHeader
            :title="t('settings.guestbookTitle')"
            :description="t('settings.guestbookEnableDesc')"
            :no-margin="!guestbookConfig.enabled"
        >
            <template #icon>
                <MessageSquare class="h-4 w-4" />
            </template>
            <template #actions>
                <Switch v-model="guestbookConfig.enabled" />
            </template>
        </SectionHeader>

        <!-- {{ t('settings.guestbookTitle') }}区域 -->
        <div
            v-if="guestbookConfig.enabled"
            class="pt-6 border-t border-zinc-800/60"
        >
            <!-- Toolbar -->
            <div
                class="pb-4 border-b border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div class="flex items-center gap-2">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.guestbookList') }}
                    </h3>
                    <span
                        class="px-2 py-0.5 rounded-md border border-zinc-800 bg-transparent font-mono text-xs text-zinc-400"
                        >{{ messages.length }}</span
                    >
                </div>

                <div class="flex items-center gap-2">
                    <div class="w-full sm:w-36">
                        <Select
                            v-model="filterStatus"
                            size="sm"
                            :options="[
                                { value: 'all', label: t('settings.guestbookAllStatus') },
                                { value: 'pending', label: t('settings.guestbookPending') },
                                { value: 'approved', label: t('settings.guestbookApproved') },
                                { value: 'replied', label: t('settings.guestbookReplied') },
                            ]"
                        />
                    </div>
                    <button
                        @click="fetchMessages"
                        class="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                        :aria-label="t('actions.refresh')"
                    >
                        <RefreshCw class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <!-- List -->
            <div class="divide-y divide-zinc-800/60">
                <div v-if="loading" class="py-8 text-center text-xs text-zinc-500">
                    {{ t('settings.guestbookLoading') }}
                </div>
                <div
                    v-else-if="filteredMessages.length === 0"
                    class="py-8 text-center text-xs text-zinc-500"
                >
                    {{ t('settings.guestbookEmpty') }}
                </div>

                <div
                    v-for="msg in filteredMessages"
                    :key="msg.id"
                    class="py-5 first:pt-4 last:pb-0 transition-colors"
                >
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-2.5">
                            <span class="text-sm font-medium text-zinc-100">{{
                                msg.nickname || t('settings.guestbookAnonymous')
                            }}</span>
                            <span
                                class="text-[11px] font-mono px-2 py-0.5 rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                            >
                                {{ getTypeLabel(msg.type) }}
                            </span>
                            <span
                                :class="[
                                    'text-[11px] px-2 py-0.5 rounded-md',
                                    getStatusBadgeClass(msg.status),
                                ]"
                            >
                                {{ getStatusLabel(msg.status) }}
                            </span>
                        </div>
                        <span class="text-xs font-mono text-zinc-500">{{
                            formatDate(msg.createdAt)
                        }}</span>
                    </div>

                    <div class="mb-3 text-sm text-zinc-300 break-words leading-relaxed">
                        {{ msg.content }}
                    </div>

                    <!-- Reply Display -->
                    <div
                        v-if="msg.reply && replyingId !== msg.id"
                        class="mb-3 pl-4 border-l-2 border-zinc-800 py-1"
                    >
                        <div class="text-xs text-zinc-300 font-medium mb-0.5 flex justify-between">
                            <span>{{ t('settings.guestbookAdminReply') }}</span>
                            <span class="text-zinc-500 font-mono font-normal">{{
                                formatDate(msg.replyAt)
                            }}</span>
                        </div>
                        <div class="text-xs text-zinc-400 leading-relaxed">{{ msg.reply }}</div>
                    </div>

                    <!-- Reply Input -->
                    <div v-if="replyingId === msg.id" class="mb-3 pl-4 border-l-2 border-zinc-800">
                        <textarea
                            v-model="replyContent"
                            rows="3"
                            class="block w-full rounded-md border border-zinc-800 shadow-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 bg-[#131515] text-zinc-100 sm:text-sm px-3 py-2"
                            :placeholder="t('settings.guestbookReplyPlaceholder')"
                        ></textarea>
                        <div class="mt-2.5 flex justify-end gap-2">
                            <button
                                @click="cancelReply"
                                class="px-3 py-1.5 text-xs font-medium text-zinc-300 border border-zinc-800 bg-transparent hover:bg-zinc-900 rounded-md"
                            >
                                {{ t('actions.cancel') }}
                            </button>
                            <button
                                @click="submitReply(msg.id)"
                                class="px-3 py-1.5 text-xs font-semibold text-zinc-900 bg-zinc-100 border border-zinc-100 hover:bg-white rounded-md shadow-none"
                            >
                                {{ t('settings.guestbookSendReply') }}
                            </button>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-4 text-xs">
                        <button
                            v-if="!msg.isVisible"
                            @click="handleAction('toggle', msg.id)"
                            class="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                        >
                            <Eye class="w-3.5 h-3.5" />
                            {{ t('settings.guestbookApproveShow') }}
                        </button>
                        <button
                            v-else
                            @click="handleAction('toggle', msg.id)"
                            class="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                        >
                            <EyeOff class="w-3.5 h-3.5" />
                            {{ t('settings.guestbookHide') }}
                        </button>

                        <button
                            @click="startReply(msg)"
                            class="text-zinc-300 hover:text-zinc-100 font-medium flex items-center gap-1"
                        >
                            <Reply class="w-3.5 h-3.5" />
                            {{ t('settings.guestbookReply') }}
                        </button>

                        <button
                            @click="handleAction('delete', msg.id)"
                            class="text-red-400 hover:text-red-300 font-medium flex items-center gap-1 ml-auto"
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

<style scoped></style>
