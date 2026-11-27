<script setup lang="ts">
import { computed, type ComponentPublicInstance } from 'vue';
import type { ProfileConfig } from '@misub/core/types.js';
import { Download, Eye, Link2, QrCode } from '@lucide/vue';
import QRCodeOverlay from '@/components/public/QRCodeOverlay.vue';
import { getItemTags } from '@/utils/tags.js';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    profile: ProfileConfig;
    isQrExpanded?: boolean;
  }>(),
  {
    isQrExpanded: false,
  },
);

const profileTags = computed(() => getItemTags(props.profile));

const emit = defineEmits<{
  'quick-import': [profile: ProfileConfig];
  'toggle-qr': [profile: ProfileConfig];
  preview: [profile: ProfileConfig];
  'copy-link': [profile: ProfileConfig];
  'copy-short-link': [profile: ProfileConfig];
  'download-qr': [profile: ProfileConfig];
  'register-canvas': [id: string, el: Element | ComponentPublicInstance | null];
}>();
</script>

<template>
  <div
    class="group relative flex h-full flex-col rounded-md border border-line bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:z-10"
  >
    <div class="flex items-start justify-between mb-3">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
        <h3 :title="profile.name" class="text-base font-semibold text-fg line-clamp-1">
          {{ profile.name }}
        </h3>
      </div>

      <button
        :aria-label="t('actions.showQrCode')"
        :class="{
          'bg-accent text-accent-fg border-accent': isQrExpanded,
        }"
        :title="t('actions.showQrCode')"
        class="rounded-md border border-line p-1.5 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        @click.stop="emit('toggle-qr', profile)"
      >
        <QrCode class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="profileTags.length > 0"
      class="mb-2.5 flex flex-wrap items-center gap-1.5"
      data-testid="public-profile-card-tags"
    >
      <span
        v-for="tag in profileTags"
        :key="tag"
        :title="tag"
        class="max-w-[140px] truncate rounded-md border border-line bg-elevated-card px-1.5 py-0.5 text-xs font-medium text-fg-muted"
      >
        {{ tag }}
      </span>
    </div>

    <div class="flex-1 mb-5">
      <p class="text-fg-subtle text-xs leading-relaxed line-clamp-3">
        {{ profile.description || t('public.noDescription') }}
      </p>
    </div>

    <div class="mt-auto pt-4 border-t border-line flex items-center gap-2">
      <button
        :aria-label="t('public.quickImportSubscription')"
        class="flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent hover:opacity-90 px-3.5 text-xs font-medium text-accent-fg transition-colors shadow-none"
        @click="emit('quick-import', profile)"
      >
        <Download class="w-3.5 h-3.5 shrink-0" />
        {{ t('public.quickImport') }}
      </button>

      <button
        :aria-label="t('public.previewNodes')"
        :title="t('public.previewNodes')"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        @click="emit('preview', profile)"
      >
        <Eye class="w-4 h-4" />
      </button>

      <button
        :aria-label="profile.shortLink ? t('public.copyShortLink') : t('public.copySubscriptionLink')"
        :title="profile.shortLink ? `${t('public.copyShortLink')}: ${profile.shortLink}` : t('actions.copyLink')"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        @click="profile.shortLink ? emit('copy-short-link', profile) : emit('copy-link', profile)"
      >
        <Link2 class="w-4 h-4" />
      </button>
    </div>

    <QRCodeOverlay
      :is-expanded="isQrExpanded"
      :profile="profile"
      @close="emit('toggle-qr', profile)"
      @download="emit('download-qr', profile)"
      @register-canvas="(id, el) => emit('register-canvas', id, el)"
    />
  </div>
</template>
