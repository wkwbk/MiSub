<script setup>
import { computed, watch } from 'vue';
import { Megaphone } from '@lucide/vue';
import DOMPurify from 'dompurify';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const defaultAnnouncement = {
  enabled: false,
  title: '',
  content: '',
  type: 'info',
  dismissible: true,
  updatedAt: null,
};

const ensureAnnouncement = () => {
  if (!props.settings.announcement) {
    props.settings.announcement = { ...defaultAnnouncement };
  }
};

ensureAnnouncement();

watch(
  () => props.settings.announcement,
  (val) => {
    if (!val) ensureAnnouncement();
  },
);

// 确保 announcement 对象存在
const announcement = computed(() => props.settings.announcement || defaultAnnouncement);

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

const handleContentUpdate = () => {
  announcement.value.updatedAt = new Date().toISOString();
};
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <!-- 头部说明 & 开关 -->
    <SectionHeader
      :description="t('settings.announcementDesc')"
      :no-margin="!announcement.enabled"
      :title="t('settings.announcementTitle')"
    >
      <template #icon>
        <Megaphone class="h-4 w-4" />
      </template>
      <template #actions>
        <Switch v-model="announcement.enabled" @change="handleContentUpdate" />
      </template>
    </SectionHeader>

    <!-- 内容编辑 -->
    <div v-if="announcement.enabled" class="space-y-6 animate-fade-in-down">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- 标题 -->
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
            t('settings.announcementFieldTitle')
          }}</label>
          <input
            v-model="announcement.title"
            :placeholder="t('settings.announcementTitlePlaceholder')"
            class="block w-full px-3 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong sm:text-sm text-fg transition-colors"
            type="text"
            @input="handleContentUpdate"
          />
        </div>

        <!-- 类型 -->
        <div>
          <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('settings.announcementType') }}</label>
          <Select
            v-model="announcement.type"
            :options="[
              { value: 'info', label: t('settings.announcementInfo') },
              { value: 'success', label: t('settings.announcementSuccess') },
              { value: 'warning', label: t('settings.announcementWarning') },
              { value: 'error', label: t('settings.announcementError') },
            ]"
            @change="handleContentUpdate"
          />
        </div>
      </div>

      <!-- 内容 -->
      <div>
        <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('settings.announcementContent') }}</label>
        <Textarea
          v-model="announcement.content"
          :placeholder="t('settings.announcementContentPlaceholder')"
          class="px-3 py-2 sm:text-sm text-fg font-mono"
          rows="6"
          @input="handleContentUpdate"
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
        <Switch v-model="announcement.dismissible" size="sm" @change="handleContentUpdate" />
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
  </section>
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
