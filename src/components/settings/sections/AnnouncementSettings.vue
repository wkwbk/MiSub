<script setup lang="ts">
import { computed } from 'vue';
import type { AnnouncementConfig } from '@misub/core/types.js';
import { Megaphone } from '@lucide/vue';
import DOMPurify from 'dompurify';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import { useI18n } from '@/i18n/index.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const defaultAnnouncement: AnnouncementConfig = {
  enabled: false,
  title: '',
  content: '',
  type: 'info',
  dismissible: true,
  updatedAt: null,
};

const announcement = computed<AnnouncementConfig>(() => ({
  ...defaultAnnouncement,
  ...props.settings?.announcement,
}));

const updateAnnouncement = (patch: Partial<AnnouncementConfig>): void => {
  emit('update:settings', {
    ...props.settings,
    announcement: {
      ...announcement.value,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  });
};

const allowedContentTags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li'];
const allowedContentAttrs = ['href', 'target', 'rel'];

const sanitizedContent = computed(() => {
  const rawContent = announcement.value.content?.trim()
    ? announcement.value.content
    : t('common.announcementFallbackContent');
  return DOMPurify.sanitize(rawContent, {
    ALLOWED_TAGS: allowedContentTags,
    ALLOWED_ATTR: allowedContentAttrs,
  });
});
</script>

<template>
  <!-- 头部说明 & 开关 -->
  <SettingCard
    :description="t('settings.announcementDesc')"
    :no-margin="!announcement.enabled"
    :title="t('settings.announcementTitle')"
  >
    <template #icon>
      <Megaphone class="h-4 w-4" />
    </template>
    <template #actions>
      <Switch
        :model-value="Boolean(announcement.enabled)"
        @update:model-value="updateAnnouncement({ enabled: Boolean($event) })"
      />
    </template>

    <!-- 内容编辑 -->
    <div v-if="announcement.enabled" class="space-y-6 animate-fade-in-down">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- 标题 -->
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
            t('settings.announcementFieldTitle')
          }}</label>
          <input
            :placeholder="t('settings.announcementTitlePlaceholder')"
            :value="announcement.title"
            class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong sm:text-sm text-fg transition-colors"
            type="text"
            @input="updateAnnouncement({ title: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <!-- 类型 -->
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('settings.announcementType') }}</label>
          <Select
            :model-value="announcement.type"
            :options="[
              { value: 'info', label: t('settings.announcementInfo') },
              { value: 'success', label: t('settings.announcementSuccess') },
              { value: 'warning', label: t('settings.announcementWarning') },
              { value: 'error', label: t('settings.announcementError') },
            ]"
            @update:model-value="updateAnnouncement({ type: String($event) as AnnouncementConfig['type'] })"
          />
        </div>
      </div>

      <!-- 内容 -->
      <div>
        <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('settings.announcementContent') }}</label>
        <Textarea
          :model-value="announcement.content"
          :placeholder="t('settings.announcementContentPlaceholder')"
          class="px-3 py-2 sm:text-sm text-fg font-mono"
          rows="6"
          @update:model-value="updateAnnouncement({ content: String($event ?? '') })"
        >
          <template #overlay>
            <div class="pointer-events-none absolute bottom-2 right-2 text-xs text-fg-subtle font-mono">
              {{ t('settings.announcementHtmlSupported') }}
            </div>
          </template>
        </Textarea>
        <p class="mt-2 text-xs text-fg-muted leading-relaxed">
          {{ t('settings.announcementHtmlHint') }}
        </p>
      </div>

      <!-- 选项 -->
      <div class="setting-switch-card max-w-sm">
        <span class="text-xs font-medium text-fg-muted">{{ t('settings.announcementDismissible') }}</span>
        <Switch
          :model-value="Boolean(announcement.dismissible)"
          size="sm"
          @update:model-value="updateAnnouncement({ dismissible: Boolean($event) })"
        />
      </div>

      <!-- 预览区域 -->
      <div class="pt-6 border-t border-line">
        <h4 class="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
          {{ t('settings.announcementPreview') }}
        </h4>
        <div class="bg-canvas/85 rounded-md border border-line p-4">
          <div class="flex items-start gap-2.5">
            <span
              :class="{
                'bg-sky-500': announcement.type === 'info',
                'bg-emerald-500': announcement.type === 'success',
                'bg-amber-500': announcement.type === 'warning',
                'bg-red-500': announcement.type === 'error',
              }"
              class="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5"
            ></span>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-fg truncate">
                {{ announcement.title?.trim() || t('common.announcementFallbackTitle') }}
              </h3>
              <div
                class="text-xs text-fg-muted mt-1 prose prose-sm prose-invert max-w-none"
                v-html="sanitizedContent"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingCard>
</template>

<style scoped>
.animate-fade-in-down {
  animation: fadeInDown 0.3s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
