<script setup>
    import { computed, ref } from 'vue';
    import { Clock, Copy } from '@lucide/vue';
    import SectionHeader from '@/components/settings/SectionHeader.vue';
    import { useI18n } from '@/i18n/index.js';

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
    <!-- {{ t('settings.cronTitle') }} -->
    <section class="rounded-lg border border-line bg-surface p-6">
        <SectionHeader :title="t('settings.cronTitle')" :description="t('settings.cronDesc')">
            <template #icon>
                <Clock class="h-4 w-4" />
            </template>
            <template #actions>
                <button
                    @click="showCronGuide = !showCronGuide"
                    class="shrink-0 text-fg-muted hover:text-fg text-xs font-medium border border-line bg-transparent hover:bg-hover px-3 py-1.5 rounded-md transition-colors"
                >
                    {{ showCronGuide ? t('settings.cronHideGuide') : t('settings.cronShowGuide') }}
                </button>
            </template>
        </SectionHeader>

        <div class="space-y-5">
            <!-- Cron Secret 输入框 -->
            <div class="max-w-xl">
                <label class="block text-xs font-medium text-fg-muted mb-1.5">Cron Secret</label>
                <input
                    type="text"
                    v-model="settings.cronSecret"
                    :placeholder="t('settings.cronSecretPlaceholder')"
                    class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-line-strong text-sm font-mono text-fg transition-colors"
                />
                <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
                    {{ t('settings.cronSecretHint') }}
                </p>
            </div>

            <!-- Cron 访问链接（自动生成） -->
            <div v-if="cronUrl" class="space-y-5">
                <div class="max-w-xl">
                    <label class="block text-xs font-medium text-fg-muted mb-1.5">
                        {{ t('settings.cronCompatibleUrl') }}
                    </label>
                    <div class="flex rounded-md shadow-none">
                        <input
                            type="text"
                            :value="cronUrl"
                            readonly
                            class="flex-1 block w-full px-3 py-2 bg-inset border border-line rounded-l-md text-fg font-mono text-xs"
                            :aria-label="t('settings.cronCompatibleUrl')"
                        />
                        <button
                            @click="copyCronUrl"
                            type="button"
                            class="inline-flex items-center px-3.5 py-2 border border-l-0 border-line rounded-r-md bg-transparent text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-hidden"
                            :aria-label="t('actions.copy')"
                        >
                            <Copy class="h-4 w-4" />
                        </button>
                    </div>
                    <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
                        {{ t('settings.cronCopyHint') }}
                    </p>
                </div>

                <div class="pl-4 border-l-2 border-line space-y-2.5 max-w-xl">
                    <div class="flex items-start gap-2">
                        <span
                            class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-[5px]"
                        ></span>
                        <div class="space-y-0.5">
                            <p class="text-xs font-medium text-fg">
                                {{ t('settings.cronRecommendedSecurity') }}
                            </p>
                            <p class="text-xs text-fg-muted leading-relaxed">
                                {{ t('settings.cronBearerHint') }}
                            </p>
                        </div>
                    </div>
                    <input
                        type="text"
                        :value="cronHeaderCommand"
                        readonly
                        class="block w-full px-3 py-2 bg-inset border border-line rounded-md text-xs font-mono text-fg-muted"
                        :aria-label="t('settings.cronCommandLabel')"
                    />
                </div>
            </div>
            <p v-else class="flex items-center gap-2 text-xs text-fg-subtle">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>{{ t('settings.cronEmptyHint') }}</span>
            </p>

            <div
                v-if="showCronGuide"
                class="text-xs text-fg-muted space-y-1.5 pl-4 border-l-2 border-line py-1 leading-relaxed"
            >
                <p>{{ t('settings.cronGuideExternal') }}</p>
                <p>{{ t('settings.cronGuideBearer') }}</p>
                <p class="text-fg-subtle">{{ t('settings.cronGuideFrequency') }}</p>
            </div>
        </div>
    </section>
</template>
