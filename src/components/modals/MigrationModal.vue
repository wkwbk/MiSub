<script setup>
    import { ref, computed } from 'vue';
    import { ClipboardCopy } from 'lucide-vue-next';
    import Modal from '../forms/Modal.vue';
    import { migrateToD1 } from '../../lib/api.js';
    import { useToastStore } from '../../stores/toast.js';
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        show: Boolean,
    });

    const emit = defineEmits(['update:show', 'success']);
    const { showToast } = useToastStore();
    const { t } = useI18n();

    const isMigrating = ref(false);
    const logs = ref([]);
    const step = ref('check'); // check, migrating, done, error

    const addLog = (message, type = 'info') => {
        const time = new Date().toLocaleTimeString();
        logs.value.unshift({ time, message, type });
    };

    const handleMigrate = async () => {
        step.value = 'migrating';
        isMigrating.value = true;
        logs.value = [];

        addLog(t('d1Migration.logStart'));
        addLog(t('d1Migration.logConnecting'));

        try {
            const result = await migrateToD1();

            if (result.success) {
                addLog(t('d1Migration.logConnected'), 'success');

                if (result.details) {
                    if (result.details.subscriptions)
                        addLog(t('d1Migration.logSubscriptionsOk'), 'success');
                    else addLog(t('d1Migration.logSubscriptionsSkipped'), 'warning');

                    if (result.details.profiles) addLog(t('d1Migration.logProfilesOk'), 'success');
                    else addLog(t('d1Migration.logProfilesSkipped'), 'warning');

                    if (result.details.settings) addLog(t('d1Migration.logSettingsOk'), 'success');
                    else addLog(t('d1Migration.logSettingsSkipped'), 'warning');
                }

                addLog(t('d1Migration.logAllDone'), 'success');
                step.value = 'done';
                emit('success');
            } else {
                addLog(t('d1Migration.logMigrateFailed', { message: result.message }), 'error');
                if (result.details && Array.isArray(result.details)) {
                    result.details.forEach((err) =>
                        addLog(t('d1Migration.logErrorDetail', { detail: err }), 'error')
                    );
                }
                throw new Error(result.message || t('d1Migration.migrateFailed'));
            }
        } catch (err) {
            step.value = 'error';
            addLog(t('d1Migration.logException', { message: err.message }), 'error');
            addLog(t('d1Migration.hintCheckSchema'), 'warning');
            addLog(t('d1Migration.hintRunSchema'), 'warning');
            addLog(t('d1Migration.hintCheckBinding'), 'warning');
            showToast(t('d1Migration.toastMigrateFailed', { message: err.message }), 'error');
        } finally {
            isMigrating.value = false;
            addLog(t('d1Migration.logFinished'), 'info');
        }
    };

    const handleClose = () => {
        emit('update:show', false);
        // Reset state after close
        setTimeout(() => {
            step.value = 'check';
            logs.value = [];
            isMigrating.value = false;
        }, 300);
    };

    const confirmText = computed(() => {
        if (step.value === 'check') return t('systemSettings.startMigration');
        if (step.value === 'migrating') return t('d1Migration.migrating');
        return t('d1Migration.done');
    });

    const handleConfirm = () => {
        if (step.value === 'check') {
            handleMigrate();
        } else if (step.value === 'done' || step.value === 'error') {
            handleClose();
        }
    };

    const getLogClass = (type) => {
        switch (type) {
            case 'success':
                return 'text-emerald-400';
            case 'error':
                return 'text-red-400';
            case 'warning':
                return 'text-amber-400';
            default:
                return 'text-zinc-500';
        }
    };

    const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);`;

    const copySchema = async () => {
        try {
            await navigator.clipboard.writeText(SCHEMA_SQL);
            showToast(t('systemSettings.schemaCopied'), 'success');
        } catch (err) {
            showToast(t('d1Migration.copyFailed'), 'error');
        }
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
                    t('d1Migration.title')
                }}</span>
                <span
                    v-if="step === 'migrating'"
                    class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"
                ></span>
            </div>
        </template>

        <template #body>
            <div class="h-[400px] flex flex-col">
                <!-- Step 1: Checklist -->
                <div v-if="step === 'check'" class="flex-1 space-y-4">
                    <div
                        class="bg-transparent p-4 rounded-md border border-zinc-200 dark:border-zinc-800"
                    >
                        <h4
                            class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-2"
                        >
                            <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                            {{ t('d1Migration.precheckHeading') }}
                        </h4>
                        <p class="text-xs text-zinc-500 mb-4 leading-relaxed">
                            {{ t('d1Migration.introText') }}<br />
                            {{ t('d1Migration.confirmChecklist') }}
                        </p>
                        <ul class="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
                            <li class="flex items-start gap-2">
                                <input
                                    type="checkbox"
                                    checked
                                    disabled
                                    class="mt-0.5 h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100 rounded-sm border-zinc-300 dark:border-zinc-700"
                                    aria-hidden="true"
                                />
                                <span>{{ t('d1Migration.stepCreateDb') }}</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <input
                                    type="checkbox"
                                    checked
                                    disabled
                                    class="mt-0.5 h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100 rounded-sm border-zinc-300 dark:border-zinc-700"
                                    aria-hidden="true"
                                />
                                <span
                                    >{{ t('d1Migration.stepBindDbPrefix') }}
                                    <code class="font-mono text-zinc-900 dark:text-zinc-100"
                                        >MISUB_DB</code
                                    >
                                    {{ t('d1Migration.stepBindDbSuffix') }}</span
                                >
                            </li>
                            <li class="flex items-start gap-2">
                                <input
                                    type="checkbox"
                                    class="mt-0.5 h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100 rounded-sm border-zinc-300 dark:border-zinc-700 focus:ring-0"
                                    aria-hidden="true"
                                />
                                <div class="flex flex-col gap-1">
                                    <span class="font-medium text-zinc-900 dark:text-zinc-100">{{
                                        t('d1Migration.stepRunSchema')
                                    }}</span>
                                    <button
                                        @click="copySchema"
                                        class="text-xs flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 transition-colors w-fit"
                                    >
                                        <ClipboardCopy class="w-3 h-3" />
                                        {{ t('d1Migration.copySchemaButton') }}
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div class="text-xs text-zinc-500 text-center">
                        {{ t('d1Migration.confirmNotice') }}
                    </div>
                </div>

                <!-- Step 2 & 3: Logs -->
                <div v-else class="flex-1 flex flex-col min-h-0">
                    <div
                        class="bg-[#131515] rounded-md p-4 font-mono text-xs overflow-y-auto flex-1 shadow-none border border-zinc-800"
                    >
                        <div v-if="logs.length === 0" class="text-zinc-500 text-center mt-10">
                            {{ t('d1Migration.waiting') }}
                        </div>
                        <div v-for="(log, idx) in logs" :key="idx" class="mb-1.5 break-all">
                            <span class="text-zinc-500 mr-2">[{{ log.time }}]</span>
                            <span :class="getLogClass(log.type)">{{ log.message }}</span>
                        </div>
                    </div>

                    <div
                        v-if="step === 'done'"
                        class="mt-4 p-3 bg-transparent text-zinc-700 dark:text-zinc-300 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs flex items-center gap-2"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>{{ t('d1Migration.successNotice') }}</span>
                    </div>

                    <div
                        v-if="step === 'error'"
                        class="mt-4 p-3 bg-transparent text-red-500 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs flex items-center gap-2"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
                        <span>{{ t('d1Migration.errorNotice') }}</span>
                    </div>
                </div>
            </div>
        </template>
    </Modal>
</template>
