<script setup>
import { computed, ref } from 'vue';
import { Clock, Copy } from '@lucide/vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/toast.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const { t } = useI18n();
const { showToast } = useToastStore();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const showCronGuide = ref(false);

const cronTasks = computed(() => {
  const secret = props.settings.cronSecret;
  if (!secret) return [];

  const encoded = encodeURIComponent(secret);
  const escaped = secret.replace(/"/g, '\\"');
  const origin = window.location.origin;

  return [
    {
      key: 'subscriptions',
      title: t('settings.cronTaskSubscriptionsTitle'),
      desc: t('settings.cronTaskSubscriptionsDesc'),
      url: `${origin}/cron/subscriptions?secret=${encoded}`,
      command: `curl -H "Authorization: Bearer ${escaped}" ${origin}/cron/subscriptions`,
    },
    {
      key: 'backup',
      title: t('settings.cronTaskBackupTitle'),
      desc: t('settings.cronTaskBackupDesc'),
      url: `${origin}/cron/backup?secret=${encoded}`,
      command: `curl -H "Authorization: Bearer ${escaped}" ${origin}/cron/backup`,
    },
    {
      key: 'maintenance',
      title: t('settings.cronTaskMaintenanceTitle'),
      desc: t('settings.cronTaskMaintenanceDesc'),
      url: `${origin}/cron/maintenance?secret=${encoded}`,
      command: `curl -H "Authorization: Bearer ${escaped}" ${origin}/cron/maintenance`,
    },
  ];
});

async function copyText(value) {
  if (!value) return;
  const ok = await copyTextToClipboard(value);
  showToast(ok ? t('common.copied') : t('common.copyFailed'), ok ? 'success' : 'error');
}
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <SectionHeader :description="t('settings.cronDesc')" :title="t('settings.cronTitle')">
      <template #icon>
        <Clock class="h-4 w-4" />
      </template>
      <template #actions>
        <button
          class="shrink-0 text-fg-muted hover:text-fg text-xs font-medium border border-line bg-transparent hover:bg-hover px-3 py-1.5 rounded-md transition-colors"
          @click="showCronGuide = !showCronGuide"
        >
          {{ showCronGuide ? t('settings.cronHideGuide') : t('settings.cronShowGuide') }}
        </button>
      </template>
    </SectionHeader>

    <div class="space-y-5">
      <!-- Cron Secret 输入框 -->
      <div>
        <label class="block text-xs font-medium text-fg-muted mb-1.5">Cron Secret</label>
        <input
          v-model="settings.cronSecret"
          :placeholder="t('settings.cronSecretPlaceholder')"
          class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
          type="text"
        />
        <p class="mt-1.5 text-xs text-fg-muted leading-relaxed">
          {{ t('settings.cronSecretHint') }}
        </p>
      </div>

      <!-- 按业务拆分的 Cron 任务链接（自动生成） -->
      <div v-if="cronTasks.length > 0" class="space-y-4">
        <div
          v-for="task in cronTasks"
          :key="task.key"
          class="rounded-md border border-line bg-inset/40 p-4 space-y-3"
        >
          <div class="space-y-0.5">
            <h4 class="text-xs font-semibold text-fg">{{ task.title }}</h4>
            <p class="text-xs text-fg-muted leading-relaxed">{{ task.desc }}</p>
          </div>

          <div class="flex rounded-md shadow-none">
            <input
              :aria-label="`${task.title} URL`"
              :value="task.url"
              class="flex-1 min-w-0 block w-full px-3 py-2 bg-inset border border-line rounded-l-md rounded-r-none text-fg font-mono text-xs"
              readonly
              type="text"
            />
            <button
              :aria-label="t('actions.copy')"
              class="inline-flex shrink-0 items-center px-3.5 py-2 border border-l-0 border-line rounded-r-md rounded-l-none bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors focus-visible:outline-hidden"
              type="button"
              @click="copyText(task.url)"
            >
              <Copy class="h-4 w-4" />
            </button>
          </div>

          <div class="flex rounded-md shadow-none">
            <input
              :aria-label="`${task.title} ${t('settings.cronCommandLabel')}`"
              :value="task.command"
              class="flex-1 min-w-0 block w-full px-3 py-2 bg-inset border border-line rounded-l-md rounded-r-none text-xs font-mono text-fg-muted"
              readonly
              type="text"
            />
            <button
              :aria-label="t('actions.copy')"
              class="inline-flex shrink-0 items-center px-3.5 py-2 border border-l-0 border-line rounded-r-md rounded-l-none bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors focus-visible:outline-hidden"
              type="button"
              @click="copyText(task.command)"
            >
              <Copy class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 space-y-0.5">
          <p class="text-xs font-medium text-emerald-400">
            {{ t('settings.cronRecommendedSecurity') }}
          </p>
          <p class="text-xs text-fg-muted leading-relaxed">
            {{ t('settings.cronBearerHint') }}
          </p>
        </div>
      </div>
      <p
        v-else
        class="rounded-md border border-amber-500/20 bg-amber-500/5 px-3.5 py-2 text-xs leading-relaxed text-amber-300/90"
      >
        {{ t('settings.cronEmptyHint') }}
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
