<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';
import { computed } from 'vue';
import { ExternalLink } from '@lucide/vue';
import { useVersionStore, type GithubReleaseInfo } from '@/stores/useVersionStore.js';
import Modal from '@/components/ui/Modal.vue';
import { renderChangelogMarkdown } from '@/utils/changelog-markdown.js';

const { t } = useI18n();

const versionStore = useVersionStore();

const props = withDefaults(
  defineProps<{
    show?: boolean;
    release?: GithubReleaseInfo;
    currentVersion?: string;
  }>(),
  {
    show: false,
    release: () => ({ tag_name: '', name: '', body: '', html_url: '' }),
    currentVersion: '',
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  confirm: [];
  suppress: [];
}>();

const isLatest = computed(() => {
  if (!props.release?.tag_name) return true;
  return versionStore.compareVersions(props.release.tag_name, props.currentVersion) <= 0;
});

const renderedChangelogHtml = computed(() => {
  const content =
    isLatest.value && versionStore.localChangelog ? versionStore.localChangelog : props.release?.body || '';
  return renderChangelogMarkdown(content);
});
</script>

<template>
  <Modal :close-on-confirm="false" :show="show" size="lg" @update:show="emit('update:show', $event)">
    <template #title>
      <div class="flex items-center gap-3">
        <h3 class="text-base font-semibold text-fg">
          {{ t('changelog.title') }}
        </h3>
        <span
          v-if="isLatest"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-line text-xs font-medium bg-transparent text-fg-muted"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          {{ t('changelog.latestVersion') }}
        </span>
        <span
          v-else
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-line text-xs font-medium bg-transparent text-fg-muted"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
          {{ t('changelog.newVersionAvailable') }}
        </span>
      </div>
      <p class="mt-1 text-xs font-mono text-fg-subtle">
        <template v-if="isLatest">{{ t('changelog.upToDate', { version: currentVersion }) }}</template>
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
        <div class="rounded-md border border-line bg-transparent px-4 py-3 text-sm text-fg">
          <div class="font-semibold font-mono text-xs">
            {{
              isLatest
                ? t('changelog.highlightsTitle', { version: currentVersion })
                : release.name || release.tag_name || t('changelog.releaseNotes')
            }}
          </div>
          <div v-if="!isLatest && release.published_at" class="mt-1 text-xs font-mono text-fg-subtle">
            {{
              t('changelog.publishedAt', {
                date: new Date(release.published_at).toLocaleString(),
              })
            }}
          </div>
        </div>

        <div
          class="max-h-[420px] overflow-y-auto rounded-md border border-line bg-inset p-4 text-xs leading-6 text-fg-muted"
        >
          <div v-if="renderedChangelogHtml" v-html="renderedChangelogHtml"></div>
          <template v-else>{{ t('changelog.noDetails') }}</template>
        </div>

        <a
          v-if="release.html_url"
          :href="release.html_url"
          class="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-fg-subtle hover:text-fg underline underline-offset-4"
          rel="noopener noreferrer"
          target="_blank"
        >
          {{ t('changelog.viewReleasePage') }}
          <ExternalLink class="w-3.5 h-3.5" />
        </a>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          class="whitespace-nowrap rounded-md border border-line bg-transparent px-4 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover"
          @click="emit('suppress')"
        >
          {{ t('changelog.dontShowAgain') }}
        </button>
        <button
          class="whitespace-nowrap rounded-md border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
          @click="emit('confirm')"
        >
          {{ t('actions.confirm') }}
        </button>
      </div>
    </template>
  </Modal>
</template>
