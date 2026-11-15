<script setup>
    import { ref, computed } from 'vue';
    import Modal from '../forms/Modal.vue';
    import { migrateLegacyD1 } from '../../lib/api.js';
    import { useToastStore } from '../../stores/toast.js';
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        show: Boolean,
        details: {
            type: Object,
            default: () => ({ hasLegacySubscriptions: false, hasLegacyProfiles: false }),
        },
    });

    const emit = defineEmits(['update:show', 'success']);
    const { showToast } = useToastStore();
    const { t } = useI18n();

    const isMigrating = ref(false);
    const logs = ref([]);
    const step = ref('check');

    const addLog = (message, type = 'info') => {
        logs.value.unshift({ time: new Date().toLocaleTimeString(), message, type });
    };

    const confirmText = computed(() => {
        if (step.value === 'check') return t('d1Migration.startUpgrade');
        if (step.value === 'migrating') return t('d1Migration.upgrading');
        return t('d1Migration.finish');
    });

    const handleClose = () => {
        emit('update:show', false);
        setTimeout(() => {
            step.value = 'check';
            logs.value = [];
            isMigrating.value = false;
        }, 300);
    };

    const handleConfirm = async () => {
        if (step.value === 'done' || step.value === 'error') {
            handleClose();
            return;
        }

        step.value = 'migrating';
        isMigrating.value = true;
        logs.value = [];
        addLog(t('d1Migration.logLegacyDetected'));

        try {
            const result = await migrateLegacyD1();
            if (!result.success) {
                throw new Error(result.error || result.message || t('d1Migration.migrateFailed'));
            }

            addLog(
                t('d1Migration.logLegacySubscriptions', {
                    count: result.details?.subscriptions || 0,
                }),
                'success'
            );
            addLog(
                t('d1Migration.logLegacyProfiles', { count: result.details?.profiles || 0 }),
                'success'
            );
            addLog(t('d1Migration.logLegacyCompleted'), 'success');
            step.value = 'done';
            showToast(t('d1Migration.toastLegacySuccess'), 'success');
            emit('success');
        } catch (error) {
            step.value = 'error';
            addLog(t('d1Migration.logUpgradeFailed', { message: error.message }), 'error');
            showToast(t('d1Migration.toastLegacyFailed', { message: error.message }), 'error');
        } finally {
            isMigrating.value = false;
        }
    };

    const getLogClass = (type) => {
        if (type === 'success') return 'text-green-400';
        if (type === 'error') return 'text-red-400';
        return 'text-gray-500 dark:text-gray-400';
    };
</script>

<template>
    <Modal
        :show="show"
        @update:show="handleClose"
        @confirm="handleConfirm"
        size="2xl"
        :confirm-disabled="isMigrating"
        :confirm-text="confirmText"
        :cancel-text="t('common.close')"
    >
        <template #title>
            <div class="flex items-center gap-2">
                <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{
                    t('d1Migration.legacyTitle')
                }}</span>
            </div>
        </template>

        <template #body>
            <div class="h-[360px] flex flex-col">
                <div v-if="step === 'check'" class="flex-1 space-y-4">
                    <div
                        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent p-4 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2.5"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
                        <span>{{ t('d1Migration.legacyIntro') }}</span>
                    </div>
                    <ul class="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <li v-if="details.hasLegacySubscriptions">
                            • {{ t('d1Migration.legacyHasSubscriptions') }}
                        </li>
                        <li v-if="details.hasLegacyProfiles">
                            • {{ t('d1Migration.legacyHasProfiles') }}
                        </li>
                        <li>• {{ t('d1Migration.legacyNoDataChange') }}</li>
                    </ul>
                </div>

                <div v-else class="flex-1 flex flex-col min-h-0">
                    <div
                        class="flex-1 overflow-y-auto rounded-md border border-zinc-800 bg-[#131515] p-4 font-mono text-xs shadow-none"
                    >
                        <div v-for="(log, idx) in logs" :key="idx" class="mb-1.5 break-all">
                            <span class="mr-2 text-zinc-500">[{{ log.time }}]</span>
                            <span :class="getLogClass(log.type)">{{ log.message }}</span>
                        </div>
                    </div>
                    <div
                        v-if="step === 'done'"
                        class="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent p-3 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>{{ t('d1Migration.legacyDoneHint') }}</span>
                    </div>
                </div>
            </div>
        </template>
    </Modal>
</template>
