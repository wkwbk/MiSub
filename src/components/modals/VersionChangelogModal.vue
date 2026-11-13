<script setup>
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();
    import { computed } from 'vue';
    import { ExternalLink } from 'lucide-vue-next';
    import { useVersionStore } from '../../stores/version';
    import Modal from '../forms/Modal.vue';

    const versionStore = useVersionStore();

    const props = defineProps({
        show: Boolean,
        release: {
            type: Object,
            default: () => ({ tag_name: '', name: '', body: '', html_url: '' }),
        },
        currentVersion: {
            type: String,
            default: '',
        },
    });

    const emit = defineEmits(['update:show', 'confirm', 'suppress']);

    const isLatest = computed(() => {
        if (!props.release?.tag_name) return true;
        return (
            props.currentVersion === props.release.tag_name ||
            props.currentVersion === props.release.tag_name.replace(/^v/, '')
        );
    });
</script>

<template>
    <Modal
        :show="show"
        @update:show="emit('update:show', $event)"
        size="lg"
        :close-on-confirm="false"
    >
        <template #title>
            <div class="flex items-center gap-3">
                <h3 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ t('changelog.title') }}
                </h3>
                <span
                    v-if="isLatest"
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium bg-transparent text-zinc-700 dark:text-zinc-300"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {{ t('changelog.latestVersion') }}
                </span>
                <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium bg-transparent text-zinc-700 dark:text-zinc-300"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                    {{ t('changelog.newVersionAvailable') }}
                </span>
            </div>
            <p class="mt-1 text-xs font-mono text-zinc-500">
                <template v-if="isLatest">{{
                    t('changelog.upToDate', { version: currentVersion })
                }}</template>
                <template v-else>
                    {{
                        t('changelog.newVersionDetected', {
                            latest: release.tag_name,
                            current: currentVersion,
                        })
                    }}
                </template>
            </p>
        </template>

        <template #body>
            <div class="space-y-4">
                <div
                    class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200"
                >
                    <div class="font-semibold font-mono text-xs">
                        {{
                            isLatest
                                ? t('changelog.highlightsTitle', { version: currentVersion })
                                : release.name || release.tag_name || t('changelog.releaseNotes')
                        }}
                    </div>
                    <div
                        v-if="!isLatest && release.published_at"
                        class="mt-1 text-xs font-mono text-zinc-500"
                    >
                        {{
                            t('changelog.publishedAt', {
                                date: new Date(release.published_at).toLocaleString(),
                            })
                        }}
                    </div>
                </div>

                <div
                    class="max-h-[420px] overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#131515] p-4 text-xs font-mono leading-6 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap"
                >
                    <template v-if="isLatest && versionStore.localChangelog">
                        {{ versionStore.localChangelog }}
                    </template>
                    <template v-else-if="release.body">
                        {{ release.body }}
                    </template>
                    <template v-else>{{ t('changelog.noDetails') }}</template>
                </div>

                <a
                    v-if="release.html_url"
                    :href="release.html_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 underline underline-offset-4"
                >
                    {{ t('changelog.viewReleasePage') }}
                    <ExternalLink class="w-3.5 h-3.5" />
                </a>
            </div>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <button
                    @click="emit('suppress')"
                    class="rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-4 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                    {{ t('changelog.dontShowAgain') }}
                </button>
                <button
                    @click="emit('confirm')"
                    class="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                    {{ t('actions.confirm') }}
                </button>
            </div>
        </template>
    </Modal>
</template>
