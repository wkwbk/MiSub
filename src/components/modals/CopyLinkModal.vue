<script setup>
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();
    import { computed, markRaw } from 'vue';
    import { Box, Code2, Link2, Monitor, Send, Zap } from 'lucide-vue-next';
    import Modal from '../forms/Modal.vue';
    import { useToastStore } from '@/stores/toast';

    const props = defineProps({
        show: Boolean,
        profile: Object,
        token: String,
    });

    const emit = defineEmits(['update:show']);
    const { showToast } = useToastStore();

    const close = () => {
        emit('update:show', false);
    };

    const identifier = computed(() => {
        if (!props.profile) return '';
        return props.profile.customId || props.profile.id;
    });

    const baseUrl = computed(() => {
        if (!props.token || props.token === 'auto' || !props.token.trim()) return '';
        return `${window.location.origin}/${props.token}/${identifier.value}`;
    });

    const clients = computed(() => [
        {
            name: t('copyLink.autoDetect'),
            type: 'default',
            icon: markRaw(Link2),
            format: '',
        },
        {
            name: 'Clash',
            type: 'clash',
            icon: markRaw(Link2),
            format: '?clash',
        },
        {
            name: 'Sing-Box',
            type: 'singbox',
            icon: markRaw(Box),
            format: '?singbox',
        },
        { name: 'Surge', type: 'surge', icon: markRaw(Zap), format: '?surge' },
        { name: 'Loon', type: 'loon', icon: markRaw(Send), format: '?loon' },
        {
            name: 'V2Ray / Base64',
            type: 'base64',
            icon: markRaw(Code2),
            format: '?base64',
        },
        {
            name: 'Quantumult X',
            type: 'quanx',
            icon: markRaw(Monitor),
            format: '?quanx',
        },
    ]);

    const copyToClipboard = async (format) => {
        if (!baseUrl.value) {
            showToast(t('copyLink.tokenMissing'), 'error');
            return;
        }

        const link = `${baseUrl.value}${format}`;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(link);
                showToast(t('copyLink.copied'), 'success');
                close();
            } else {
                fallbackCopy(link);
            }
        } catch (err) {
            fallbackCopy(link);
        }
    };

    const fallbackCopy = (link) => {
        const textArea = document.createElement('textarea');
        textArea.value = link;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showToast(t('copyLink.copied'), 'success');
                close();
            } else {
                showToast(t('copyLink.copyFailed'), 'error');
            }
        } catch (err) {
            showToast(t('copyLink.copyFailed'), 'error');
        }
        document.body.removeChild(textArea);
    };
</script>

<template>
    <Modal :show="show" @update:show="close" :show-cancel="false" :show-confirm="false">
        <template #title>
            <h3 class="text-base font-semibold text-zinc-100">
                {{ t('copyLink.title') }}
            </h3>
        </template>

        <template #body>
            <div class="mt-2" v-if="!baseUrl">
                <div
                    class="flex items-center gap-2 text-red-400 text-xs bg-transparent p-3 rounded-md border border-zinc-800"
                >
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"></span>
                    <span>{{ t('copyLink.tokenMissingHint') }}</span>
                </div>
            </div>
            <div v-else class="space-y-2 mt-2">
                <p class="text-xs text-zinc-400 mb-3">
                    {{ t('copyLink.formatHint') }}
                </p>

                <div
                    v-for="client in clients"
                    :key="client.type"
                    @click="copyToClipboard(client.format)"
                    class="flex items-center justify-between p-2.5 border border-zinc-800 rounded-md hover:bg-zinc-900/60 hover:border-zinc-700 cursor-pointer transition-colors group"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-8 h-8 rounded-md border border-zinc-800 bg-transparent flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 transition-colors"
                        >
                            <component :is="client.icon" class="h-4 w-4" />
                        </div>
                        <div>
                            <p class="text-sm font-medium text-zinc-100">
                                {{ client.name }}
                            </p>
                        </div>
                    </div>

                    <button
                        class="px-2.5 py-1 text-xs font-medium text-zinc-900 bg-zinc-100 rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                    >
                        {{ t('actions.copy') }}
                    </button>
                </div>
            </div>
        </template>
    </Modal>
</template>
