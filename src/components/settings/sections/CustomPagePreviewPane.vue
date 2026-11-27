<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { Eye, Monitor, Moon, Smartphone, Sun } from '@lucide/vue';
import type { AnnouncementConfig } from '@misub/core/types.js';
import { useI18n } from '@/i18n/index.js';
import { buildCustomPagePreviewSrcdoc } from '@/utils/custom-page-preview.js';
import packageJson from '../../../../package.json';

const props = withDefaults(
  defineProps<{
    content?: string;
    css?: string;
    useDefaultLayout?: boolean;
    hideBranding?: boolean;
    hideHeader?: boolean;
    hideFooter?: boolean;
    siteTitle?: string;
    siteDescription?: string;
    heroTitle2?: string;
    announcement?: Partial<AnnouncementConfig>;
    viewport?: 'desktop' | 'mobile';
    theme?: 'light' | 'dark';
    fullscreen?: boolean;
  }>(),
  {
    content: '',
    css: '',
    useDefaultLayout: true,
    hideBranding: false,
    hideHeader: false,
    hideFooter: false,
    siteTitle: '',
    siteDescription: '',
    heroTitle2: '',
    announcement: undefined,
    viewport: 'desktop',
    theme: 'light',
    fullscreen: false,
  },
);

const emit = defineEmits<{
  'update:viewport': [value: 'desktop' | 'mobile'];
  'update:theme': [value: 'light' | 'dark'];
}>();

const { t, locale } = useI18n();

const hasPreviewSource = computed(() => Boolean((props.content || '').trim() || (props.css || '').trim()));

const buildSrcdoc = (): string =>
  buildCustomPagePreviewSrcdoc({
    content: props.content || '',
    css: props.css || '',
    theme: props.theme,
    useDefaultLayout: props.useDefaultLayout,
    hideBranding: props.hideBranding,
    hideHeader: props.hideHeader,
    hideFooter: props.hideFooter,
    locale: locale.value,
    siteTitle: props.siteTitle,
    siteDescription: props.siteDescription,
    heroTitle2: props.heroTitle2,
    announcement: props.announcement,
    version: packageJson.version,
  });

const previewSrcdoc = ref<string>(buildSrcdoc());
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const clearDebounceTimer = (): void => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
};

watch(
  () => [props.content, props.css],
  () => {
    clearDebounceTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      previewSrcdoc.value = buildSrcdoc();
    }, 150);
  },
);

watch(
  () => [
    props.theme,
    props.useDefaultLayout,
    props.hideBranding,
    props.hideHeader,
    props.hideFooter,
    props.siteTitle,
    props.siteDescription,
    props.heroTitle2,
    props.announcement,
    locale.value,
  ],
  () => {
    clearDebounceTimer();
    previewSrcdoc.value = buildSrcdoc();
  },
  { deep: true },
);

const stageRef = ref<HTMLDivElement | null>(null);
const stageWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!stageRef.value) return;
  stageWidth.value = stageRef.value.clientWidth;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        stageWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(stageRef.value);
  }
});

onUnmounted(() => {
  clearDebounceTimer();
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const desktopScale = computed(() => {
  if (props.viewport !== 'desktop' || stageWidth.value <= 0 || stageWidth.value >= 1024) {
    return 1;
  }
  return stageWidth.value / 1280;
});

const desktopIframeStyle = computed<CSSProperties>(() => {
  const scale = desktopScale.value;
  if (scale >= 1) {
    return {
      width: '100%',
      height: '100%',
    };
  }
  return {
    width: '1280px',
    height: `${100 / scale}%`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  };
});
</script>

<template>
  <div
    :class="fullscreen ? 'h-full' : 'h-[500px] rounded-md border border-line'"
    class="flex flex-col overflow-hidden bg-inset"
  >
    <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-transparent shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
        <span class="text-xs font-semibold text-fg truncate">{{ t('settings.customPagePreviewTitle') }}</span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <div class="inline-flex items-center rounded-md border border-line bg-inset p-0.5">
          <button
            :aria-pressed="viewport === 'desktop'"
            :class="
              viewport === 'desktop'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-hover'
            "
            :title="t('settings.customPagePreviewDesktop')"
            class="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            data-testid="preview-viewport-desktop"
            type="button"
            @click="emit('update:viewport', 'desktop')"
          >
            <Monitor class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ t('settings.customPagePreviewDesktop') }}</span>
          </button>
          <button
            :aria-pressed="viewport === 'mobile'"
            :class="
              viewport === 'mobile'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-hover'
            "
            :title="t('settings.customPagePreviewMobile')"
            class="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            data-testid="preview-viewport-mobile"
            type="button"
            @click="emit('update:viewport', 'mobile')"
          >
            <Smartphone class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ t('settings.customPagePreviewMobile') }}</span>
          </button>
        </div>

        <div class="inline-flex items-center rounded-md border border-line bg-inset p-0.5">
          <button
            :aria-pressed="theme === 'light'"
            :class="
              theme === 'light'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-hover'
            "
            :title="t('settings.customPagePreviewLight')"
            class="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            data-testid="preview-theme-light"
            type="button"
            @click="emit('update:theme', 'light')"
          >
            <Sun class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ t('settings.customPagePreviewLight') }}</span>
          </button>
          <button
            :aria-pressed="theme === 'dark'"
            :class="
              theme === 'dark'
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg hover:bg-hover'
            "
            :title="t('settings.customPagePreviewDark')"
            class="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            data-testid="preview-theme-dark"
            type="button"
            @click="emit('update:theme', 'dark')"
          >
            <Moon class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ t('settings.customPagePreviewDark') }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      ref="stageRef"
      :class="viewport === 'mobile' ? 'p-3 bg-canvas/90' : 'bg-canvas/60'"
      class="relative flex-1 min-h-0 overflow-hidden"
    >
      <div
        v-if="!hasPreviewSource"
        class="h-full flex flex-col items-center justify-center gap-2.5 p-6 text-center"
        data-testid="custom-page-preview-empty"
      >
        <div class="w-10 h-10 rounded-full border border-line bg-inset flex items-center justify-center text-fg-subtle">
          <Eye class="w-4 h-4" />
        </div>
        <p class="text-xs font-semibold text-fg">{{ t('settings.customPagePreviewEmptyTitle') }}</p>
        <p class="text-xs text-fg-muted max-w-xs leading-relaxed">{{ t('settings.customPagePreviewEmptyDesc') }}</p>
      </div>

      <div
        v-else-if="viewport === 'mobile'"
        class="w-[390px] max-w-full h-full mx-auto rounded-lg border border-line overflow-hidden bg-canvas"
      >
        <iframe
          :srcdoc="previewSrcdoc"
          :title="t('settings.customPagePreviewTitle')"
          class="w-full h-full border-0 block"
          data-testid="custom-page-preview-iframe"
          referrerpolicy="no-referrer"
          sandbox=""
        ></iframe>
      </div>

      <div v-else class="w-full h-full overflow-hidden">
        <iframe
          :srcdoc="previewSrcdoc"
          :style="desktopIframeStyle"
          :title="t('settings.customPagePreviewTitle')"
          class="border-0 block"
          data-testid="custom-page-preview-iframe"
          referrerpolicy="no-referrer"
          sandbox=""
        ></iframe>
      </div>
    </div>
  </div>
</template>
