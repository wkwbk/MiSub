<script setup>
    import { ref, computed } from 'vue';
    import { useI18n } from '../../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    // 折叠状态
    const showCronGuide = ref(false);

    // Cron URL
    const cronUrl = computed(() => {
        const secret = props.settings.cronSecret;
        if (!secret) {
            return '';
        }
        return `${window.location.origin}/cron?secret=${encodeURIComponent(secret)}`;
    });

    const cronHeaderCommand = computed(() => {
        const secret = props.settings.cronSecret;
        if (!secret) {
            return '';
        }
        return `curl -H "Authorization: Bearer ${secret.replace(/"/g, '\\"')}" ${window.location.origin}/cron`;
    });

    // 复制 Cron URL
    function copyCronUrl() {
        if (cronUrl.value) {
            navigator.clipboard.writeText(cronUrl.value);
        }
    }
</script>

<template>
    <!-- {{ t('settings.cronTitle') }} 卡片 -->
    <div
        class="bg-transparent rounded-md p-5 space-y-5 border border-zinc-800 shadow-none"
    >
        <div class="flex justify-between items-start">
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
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.cronTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.cronDesc') }}
                    </p>
                </div>
            </div>
            <button
                @click="showCronGuide = !showCronGuide"
                class="text-zinc-300 hover:text-zinc-100 text-xs font-medium border border-zinc-800 bg-transparent hover:bg-zinc-900 px-2.5 py-1 rounded-md transition-colors"
            >
                {{ showCronGuide ? t('settings.cronHideGuide') : t('settings.cronShowGuide') }}
            </button>
        </div>

        <!-- Cron Secret 输入框 -->
        <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5"
                >Cron Secret</label
            >
            <input
                type="text"
                v-model="settings.cronSecret"
                :placeholder="t('settings.cronSecretPlaceholder')"
                class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 sm:text-sm font-mono text-zinc-100 transition-colors"
            />
            <p class="mt-1 text-xs text-zinc-500">
                {{ t('settings.cronSecretHint') }}
            </p>
        </div>

        <!-- Cron 访问链接（自动生成） -->
        <div v-if="cronUrl" class="space-y-3">
            <div>
                <label class="block text-xs font-medium text-zinc-300 mb-1.5">
                    {{ t('settings.cronCompatibleUrl') }}
                </label>
                <div class="flex rounded-md shadow-none">
                    <input
                        type="text"
                        :value="cronUrl"
                        readonly
                        class="flex-1 block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-l-md text-zinc-200 font-mono text-xs"
                        :aria-label="t('settings.cronCompatibleUrl')"
                    />
                    <button
                        @click="copyCronUrl"
                        type="button"
                        class="inline-flex items-center px-3.5 py-2 border border-l-0 border-zinc-800 rounded-r-md bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-hidden"
                        :aria-label="t('actions.copy')"
                    >
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>
                </div>
                <p class="mt-1 text-xs text-zinc-500">
                    {{ t('settings.cronCopyHint') }}
                </p>
            </div>

            <div
                class="bg-transparent border border-zinc-800 rounded-md p-3 space-y-2"
            >
                <div class="flex items-start gap-2.5">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                    <div>
                        <p class="text-xs font-medium text-zinc-200">
                            {{ t('settings.cronRecommendedSecurity') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.cronBearerHint') }}
                        </p>
                    </div>
                </div>
                <input
                    type="text"
                    :value="cronHeaderCommand"
                    readonly
                    class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md text-xs font-mono text-zinc-300"
                    :aria-label="t('settings.cronCommandLabel')"
                />
            </div>
        </div>
        <div
            v-else
            class="flex items-center gap-2.5 bg-transparent border border-zinc-800 rounded-md p-3"
        >
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
            <p class="text-xs text-zinc-400">
                {{ t('settings.cronEmptyHint') }}
            </p>
        </div>

        <div v-if="showCronGuide" class="text-xs text-zinc-300 space-y-2 border-t border-zinc-800 pt-3">
            <p>{{ t('settings.cronGuideExternal') }}</p>
            <p>{{ t('settings.cronGuideBearer') }}</p>
            <p class="text-zinc-500">{{ t('settings.cronGuideFrequency') }}</p>
        </div>
    </div>
</template>
