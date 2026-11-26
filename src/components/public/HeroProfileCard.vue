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
  preview: [profile: ProfileConfig];
  'copy-link': [profile: ProfileConfig];
  'copy-short-link': [profile: ProfileConfig];
  'toggle-qr': [profile: ProfileConfig];
  'download-qr': [profile: ProfileConfig];
  'register-canvas': [id: string, el: Element | ComponentPublicInstance | null];
}>();
</script>

<template>
  <div class="relative w-full">
    <div class="relative bg-surface rounded-md p-6 lg:p-8 border border-line">
      <div class="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
        <div class="flex-shrink-0 flex flex-col items-center lg:items-start text-center lg:text-left space-y-2.5">
          <div
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-transparent px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-fg-muted"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>{{ t('public.featured') }}</span>
          </div>

          <div>
            <h3 class="text-xl md:text-2xl font-bold text-fg leading-tight">
              {{ profile.name }}
            </h3>
            <div
              v-if="profileTags.length > 0"
              class="mt-2 flex flex-wrap items-center justify-center lg:justify-start gap-1.5"
              data-testid="public-hero-profile-tags"
            >
              <span
                v-for="tag in profileTags"
                :key="tag"
                :title="tag"
                class="max-w-[140px] truncate rounded-md border border-line bg-elevated-card px-2 py-0.5 text-xs font-medium text-fg-muted"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <div
          class="flex-1 border-t lg:border-t-0 lg:border-l border-line pt-5 lg:pt-0 lg:pl-10 w-full lg:w-auto text-center lg:text-left"
        >
          <p class="text-fg-muted text-sm leading-relaxed max-w-2xl mx-auto lg:mx-0">
            {{ profile.description || t('public.heroDescription') }}
          </p>
        </div>

        <div class="flex-shrink-0 w-full lg:w-auto flex flex-col gap-2.5 min-w-[200px]">
          <button
            class="group flex w-full items-center justify-center rounded-md bg-accent hover:opacity-90 px-5 py-2.5 text-xs font-medium text-accent-fg transition-colors shadow-none"
            @click="emit('quick-import', profile)"
          >
            <Download class="mr-2 w-4 h-4" />
            {{ t('public.quickImport') }}
          </button>

          <div class="grid grid-cols-2 gap-2">
            <button
              class="flex items-center justify-center rounded-md border border-line bg-transparent px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-hover"
              @click="emit('preview', profile)"
            >
              <Eye class="w-3.5 h-3.5 mr-1.5" />
              {{ t('public.preview') }}
            </button>
            <button
              :aria-label="profile.shortLink ? t('public.copyShortLink') : t('public.copySubscriptionLink')"
              :title="profile.shortLink ? `${t('public.copyShortLink')}: ${profile.shortLink}` : t('actions.copyLink')"
              class="flex items-center justify-center rounded-md border border-line bg-transparent px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-hover"
              @click="profile.shortLink ? emit('copy-short-link', profile) : emit('copy-link', profile)"
            >
              <Link2 class="w-3.5 h-3.5 mr-1.5" />
              {{ t('actions.copy') }}
            </button>
          </div>

          <button
            class="mt-1 flex items-center justify-center gap-1.5 cursor-pointer text-xs text-fg-subtle hover:text-fg transition-colors w-full bg-transparent border-0"
            @click="emit('toggle-qr', profile)"
          >
            <QrCode class="w-3.5 h-3.5" />
            <span>{{ isQrExpanded ? t('actions.hideQrCode') : t('actions.showQrCode') }}</span>
          </button>
        </div>
      </div>

      <QRCodeOverlay
        :is-expanded="isQrExpanded"
        :profile="profile"
        @close="emit('toggle-qr', profile)"
        @download="emit('download-qr', profile)"
        @register-canvas="(id, el) => emit('register-canvas', id, el)"
      />
    </div>
  </div>
</template>
