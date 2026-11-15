<script setup>
    import { ref, watch } from 'vue';
    import { Check, RefreshCw } from 'lucide-vue-next';
    import { api } from '../../lib/http.js';
    import Modal from '../forms/Modal.vue';
    import Select from '../ui/Select.vue';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        show: {
            type: Boolean,
            default: false,
        },
        config: {
            type: Object,
            default: () => ({ enabled: false }),
        },
    });

    const emit = defineEmits(['close']);

    const form = ref({
        nickname: '',
        content: '',
        type: 'general', // general, feature, bug
        captcha: '',
    });

    const captcha = ref({
        num1: 0,
        num2: 0,
        operator: '+',
        answer: 0,
    });

    const submitting = ref(false);
    const showSuccess = ref(false);
    const errorMsg = ref('');

    const generateCaptcha = () => {
        const operators = ['+', '-'];
        const operator = operators[Math.floor(Math.random() * operators.length)];
        let num1 = Math.floor(Math.random() * 20) + 1;
        let num2 = Math.floor(Math.random() * 20) + 1;

        // Ensure positive result for subtraction
        if (operator === '-' && num1 < num2) {
            [num1, num2] = [num2, num1];
        }

        captcha.value = {
            num1,
            num2,
            operator,
            answer: operator === '+' ? num1 + num2 : num1 - num2,
        };
        form.value.captcha = '';
    };

    // Reset form when modal opens
    const resetForm = () => {
        form.value = { nickname: '', content: '', type: 'general', captcha: '' };
        showSuccess.value = false;
        errorMsg.value = '';
        generateCaptcha();
    };

    watch(
        () => props.show,
        (newVal) => {
            if (newVal) {
                resetForm();
            }
        }
    );

    const closeModal = () => {
        emit('close');
    };

    const submitMessage = async () => {
        errorMsg.value = '';

        if (!form.value.content || !form.value.content.trim()) {
            errorMsg.value = t('guestbook.contentRequired');
            return;
        }

        if (parseInt(form.value.captcha) !== captcha.value.answer) {
            errorMsg.value = t('guestbook.captchaError');
            generateCaptcha();
            return;
        }

        submitting.value = true;
        try {
            const data = await api.post('/api/public/guestbook', {
                nickname: form.value.nickname,
                content: form.value.content,
                type: form.value.type,
            });

            if (data.success) {
                showSuccess.value = true;
            } else {
                errorMsg.value = data.message || t('guestbook.submitFailed');
                generateCaptcha();
            }
        } catch (e) {
            console.error('Submit guestbook error', e);
            errorMsg.value = t('guestbook.networkError');
        } finally {
            submitting.value = false;
        }
    };
</script>

<template>
    <Modal :show="show" size="lg" @update:show="(value) => !value && closeModal()">
        <template #title>
            <div class="pr-10">
                <h3 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ showSuccess ? t('guestbook.submitSuccess') : t('guestbook.submitFeedback') }}
                </h3>
                <p class="mt-0.5 text-xs text-zinc-500">
                    {{ showSuccess ? t('guestbook.thanksShort') : t('guestbook.feedbackNote') }}
                </p>
            </div>
        </template>

        <template #body>
            <div
                v-if="showSuccess"
                class="flex flex-col items-center justify-center py-8 text-center animate-fade-in"
            >
                <div
                    class="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent"
                >
                    <Check class="w-6 h-6 text-emerald-500" />
                </div>
                <p class="max-w-xs text-xs text-zinc-500">
                    {{ t('guestbook.thanksMessage') }}
                </p>
            </div>

            <div v-else class="space-y-4">
                <div>
                    <label
                        class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                        >{{ t('guestbook.feedbackType') }}</label
                    >
                    <Select
                        v-model="form.type"
                        :options="[
                            { value: 'general', label: t('guestbook.typeGeneral') },
                            { value: 'feature', label: t('guestbook.typeFeature') },
                            { value: 'bug', label: t('guestbook.typeBug') },
                        ]"
                    />
                </div>

                <div>
                    <label
                        class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                        >{{ t('guestbook.nicknameOptional') }}</label
                    >
                    <input
                        type="text"
                        v-model="form.nickname"
                        :placeholder="t('guestbook.nicknamePlaceholder')"
                        class="block w-full rounded-md border border-zinc-300 dark:border-zinc-800 shadow-none focus:border-zinc-500 focus:outline-hidden bg-white dark:bg-[#131515] text-zinc-900 dark:text-zinc-100 py-2 px-3 text-sm"
                        :aria-label="t('settings.guestbookNickname')"
                    />
                </div>

                <div>
                    <label
                        class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                        >{{ t('guestbook.contentLabel') }}</label
                    >
                    <textarea
                        v-model="form.content"
                        rows="4"
                        :placeholder="t('guestbook.contentPlaceholder')"
                        class="block w-full rounded-md border border-zinc-300 dark:border-zinc-800 shadow-none focus:border-zinc-500 focus:outline-hidden bg-white dark:bg-[#131515] text-zinc-900 dark:text-zinc-100 py-2 px-3 text-sm resize-none"
                    ></textarea>
                </div>

                <div>
                    <label
                        class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                        >{{ t('guestbook.captchaLabel') }}</label
                    >
                    <div class="flex items-center gap-3">
                        <div
                            class="min-w-[80px] select-none rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#131515] px-3 py-2 text-center font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                        >
                            {{ captcha.num1 }} {{ captcha.operator }} {{ captcha.num2 }} = ?
                        </div>
                        <input
                            type="number"
                            v-model="form.captcha"
                            :placeholder="t('guestbook.captchaPlaceholder')"
                            class="block w-24 rounded-md border border-zinc-300 dark:border-zinc-800 shadow-none focus:border-zinc-500 focus:outline-hidden bg-white dark:bg-[#131515] text-zinc-900 dark:text-zinc-100 font-mono py-2 px-3 text-sm"
                            @keydown.enter="submitMessage"
                            :aria-label="t('settings.guestbookCaptchaAnswer')"
                        />
                        <button
                            type="button"
                            @click="generateCaptcha"
                            class="p-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100 touch-target"
                            :title="t('common.refreshCaptcha')"
                            :aria-label="t('common.refreshCaptcha')"
                        >
                            <RefreshCw class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div v-if="errorMsg" class="flex items-center gap-1.5 text-xs text-red-500">
                    <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
                    {{ errorMsg }}
                </div>
            </div>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <button
                    @click="closeModal"
                    class="px-4 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-transparent border border-zinc-300 dark:border-zinc-800 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                    {{ showSuccess ? t('common.close') : t('actions.cancel') }}
                </button>
                <button
                    v-if="!showSuccess"
                    @click="submitMessage"
                    :disabled="submitting || !form.content"
                    class="px-4 py-1.5 text-xs font-medium text-zinc-100 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-none"
                >
                    {{ submitting ? t('guestbook.submitting') : t('guestbook.submitFeedback') }}
                </button>
            </div>
        </template>
    </Modal>
</template>

<style scoped>
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
