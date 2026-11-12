<script setup>
    import { ref, computed, onMounted, watch } from 'vue';
    import { useToastStore } from '../../../stores/toast.js';
    import { api } from '../../../lib/http.js';
    import Switch from '../../ui/Switch.vue';
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
    <div class="space-y-6">
        <!-- 头部说明 -->
        <div
            class="bg-transparent rounded-md p-5 space-y-5 border border-zinc-800 shadow-none overflow-hidden"
        >
            <div class="flex items-start gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                    </svg>
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.guestbookTitle') }}
                    </h3>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    class="flex items-center justify-between p-4 bg-transparent border border-zinc-800 rounded-md"
                >
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.guestbookEnable') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.guestbookEnableDesc') }}
                        </p>
                    </div>
                    <Switch v-model="guestbookConfig.enabled" />
                </div>
            </div>
        </div>

        <!-- {{ t('settings.guestbookTitle') }}区域 -->
        <div
            v-if="guestbookConfig.enabled"
            class="bg-transparent rounded-md border border-zinc-800 shadow-none overflow-hidden"
        >
            <!-- Toolbar -->
            <div
                class="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                    <select
                        v-model="filterStatus"
                        class="block w-full sm:w-auto pl-3 pr-8 py-1.5 text-xs border border-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 rounded-md bg-[#131515] text-zinc-100"
                    >
                        <option value="all">{{ t('settings.guestbookAllStatus') }}</option>
                        <option value="pending">{{ t('settings.guestbookPending') }}</option>
                        <option value="approved">{{ t('settings.guestbookApproved') }}</option>
                        <option value="replied">{{ t('settings.guestbookReplied') }}</option>
                    </select>
                    <button
                        @click="fetchMessages"
                        class="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                        :aria-label="t('actions.refresh')"
                    >
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.058M20.9 14.25A10.053 10.053 0 0021.1 12c0-5.523-4.477-10-10-10S1.1 6.477 1.1 12c0 4.456 2.934 8.216 7 9.542V21h3"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <!-- List -->
            <div class="divide-y divide-zinc-800">
                <div v-if="loading" class="p-8 text-center text-xs text-zinc-500">
                    {{ t('settings.guestbookLoading') }}
                </div>
                <div
                    v-else-if="filteredMessages.length === 0"
                    class="p-8 text-center text-xs text-zinc-500"
                >
                    {{ t('settings.guestbookEmpty') }}
                </div>

                <div
                    v-for="msg in filteredMessages"
                    :key="msg.id"
                    class="p-5 hover:bg-zinc-900/40 transition-colors"
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
                        <span class="text-xs font-mono text-zinc-500">{{ formatDate(msg.createdAt) }}</span>
                    </div>

                    <div class="mb-4 text-sm text-zinc-300 break-words">
                        {{ msg.content }}
                    </div>

                    <!-- Reply Display -->
                    <div
                        v-if="msg.reply && replyingId !== msg.id"
                        class="mb-4 ml-4 bg-[#131515] p-3 rounded-md border border-zinc-800"
                    >
                        <div
                            class="text-xs text-zinc-300 font-medium mb-1 flex justify-between"
                        >
                            <span>{{ t('settings.guestbookAdminReply') }}</span>
                            <span class="text-zinc-500 font-mono font-normal">{{
                                formatDate(msg.replyAt)
                            }}</span>
                        </div>
                        <div class="text-xs text-zinc-400">{{ msg.reply }}</div>
                    </div>

                    <!-- Reply Input -->
                    <div v-if="replyingId === msg.id" class="mb-4 ml-4">
                        <textarea
                            v-model="replyContent"
                            rows="3"
                            class="block w-full rounded-md border border-zinc-800 shadow-none focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 bg-[#131515] text-zinc-100 sm:text-sm px-3 py-2"
                            :placeholder="t('settings.guestbookReplyPlaceholder')"
                        ></textarea>
                        <div class="mt-2 flex justify-end gap-2">
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
                    <div class="flex items-center gap-3 text-xs">
                        <button
                            v-if="!msg.isVisible"
                            @click="handleAction('toggle', msg.id)"
                            class="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                            </svg>
                            {{ t('settings.guestbookApproveShow') }}
                        </button>
                        <button
                            v-else
                            @click="handleAction('toggle', msg.id)"
                            class="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                            </svg>
                            {{ t('settings.guestbookHide') }}
                        </button>

                        <button
                            @click="startReply(msg)"
                            class="text-zinc-300 hover:text-zinc-100 font-medium flex items-center gap-1"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                />
                            </svg>
                            {{ t('settings.guestbookReply') }}
                        </button>

                        <button
                            @click="handleAction('delete', msg.id)"
                            class="text-red-400 hover:text-red-300 font-medium flex items-center gap-1 ml-auto"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                            </svg>
                            {{ t('actions.delete') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
