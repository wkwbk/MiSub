<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { getActivePinia } from 'pinia';
import {
  Check,
  ChevronDown,
  Code2,
  Loader2,
  Maximize2,
  Minimize2,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from '@lucide/vue';
import type { CustomPageConfig } from '@misub/core/types.js';
import { CUSTOM_PAGE_TEMPLATES } from '@/constants/custom-page-templates.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { parseCustomPageSource } from '@/utils/custom-page-source.js';
import { buildCustomPageAiPrompt } from '@/utils/custom-page-ai-prompt.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { useScrollLock } from '@/composables/useScrollLock.js';
import { useI18n } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useThemeStore } from '@/stores/useThemeStore.js';
import Switch from '@/components/ui/Switch.vue';
import ConfirmPopover from '@/components/ui/ConfirmPopover.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import CustomPagePreviewPane from '@/components/settings/sections/CustomPagePreviewPane.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

type CustomPageTemplate = (typeof CUSTOM_PAGE_TEMPLATES)[number];
type CodeTab = 'html' | 'css';

const MAX_HTML_FILE_SIZE = 1.5 * 1024 * 1024;

const { t, locale } = useI18n();
const activePinia = getActivePinia();
const toastStore = activePinia ? useToastStore() : null;
const themeStore = activePinia ? useThemeStore() : null;

const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void => {
  toastStore?.showToast(message, type);
};

const props = withDefaults(
  defineProps<{
    settings: AppSettingsConfig;
    isSaving?: boolean;
    saveDisabled?: boolean;
    isActive?: boolean;
  }>(),
  {
    isSaving: false,
    saveDisabled: false,
    isActive: true,
  },
);

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
  save: [];
}>();

const rootRef = ref<HTMLDivElement | null>(null);
const htmlFileInputRef = ref<HTMLInputElement | null>(null);
const inlineHtmlTextareaRef = ref<HTMLTextAreaElement | null>(null);
const fullscreenHtmlTextareaRef = ref<HTMLTextAreaElement | null>(null);

const activeCodeTab = ref<CodeTab>('html');
const previewViewport = ref<'desktop' | 'mobile'>('desktop');
const previewTheme = ref<'light' | 'dark'>(
  themeStore?.theme === 'dark' ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
    ? 'dark'
    : 'light',
);
const isFullscreen = ref(false);
const showSecurityTooltip = ref(false);
const showFullscreenSecurityTooltip = ref(false);
const aiPromptCopied = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

useScrollLock(() => isFullscreen.value);

const customPage = computed<CustomPageConfig>(() => {
  const merged: CustomPageConfig = {
    ...DEFAULT_SETTINGS.customPage,
    ...props.settings?.customPage,
  };
  merged.type = 'html';
  merged.allowExternalStylesheets = false;
  merged.allowScripts = false;
  return merged;
});

const hasExistingCode = computed(() =>
  Boolean((customPage.value.content || '').trim() || (customPage.value.css || '').trim()),
);

function updateCustomPage(patch: Partial<CustomPageConfig>): void {
  emit('update:settings', {
    ...props.settings,
    customPage: {
      ...customPage.value,
      ...patch,
      type: 'html',
      allowExternalStylesheets: false,
      allowScripts: false,
    },
  });
}

const insertPlaceholder = (placeholder: string): void => {
  const token = `{{${placeholder}}}`;
  const current = customPage.value.content || '';
  const textarea = isFullscreen.value ? fullscreenHtmlTextareaRef.value : inlineHtmlTextareaRef.value;

  if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = current.slice(0, start) + token + current.slice(end);
    updateCustomPage({ content: nextValue });
    nextTick(() => {
      const activeEl = isFullscreen.value ? fullscreenHtmlTextareaRef.value : inlineHtmlTextareaRef.value;
      if (activeEl) {
        activeEl.focus();
        const cursor = start + token.length;
        activeEl.setSelectionRange(cursor, cursor);
      }
    });
    return;
  }

  updateCustomPage({ content: current + token });
};

const placeholderChips = [
  'profiles',
  'announcements',
  'hero',
  'guestbook',
  'theme_toggle',
  'node_count',
  'profile_count',
  'version',
];

const layoutSwitchRows = [
  {
    key: 'useDefaultLayout',
    titleKey: 'settings.customPageUseDefaultLayout',
    descKey: 'settings.customPageUseDefaultLayoutDesc',
  },
  { key: 'hideBranding', titleKey: 'settings.customPageHideBranding', descKey: 'settings.customPageHideBrandingDesc' },
  { key: 'hideHeader', titleKey: 'settings.customPageHideHeader', descKey: 'settings.customPageHideHeaderDesc' },
  { key: 'hideFooter', titleKey: 'settings.customPageHideFooter', descKey: 'settings.customPageHideFooterDesc' },
] as const;

const fixedDisabledRows = [
  { titleKey: 'settings.customPageExternalStylesDisabled', descKey: 'settings.customPageExternalStylesDisabledDesc' },
  { titleKey: 'settings.customPageScriptsDisabled', descKey: 'settings.customPageScriptsDisabledDesc' },
];

const placeholderDocGroups = [
  {
    titleKey: 'settings.customPageComponentPlaceholders',
    items: [
      { key: 'profiles', hintKey: 'settings.customPageProfilesHint' },
      { key: 'announcements', hintKey: 'settings.customPageAnnouncementsHint' },
      { key: 'hero', hintKey: 'settings.customPageHeroHint' },
      { key: 'guestbook', hintKey: 'settings.customPageGuestbookHint' },
    ],
  },
  {
    titleKey: 'settings.customPageDataPlaceholders',
    items: [
      { key: 'version', hintKey: 'settings.customPageVersionHint' },
      { key: 'node_count', hintKey: 'settings.customPageNodeCountHint' },
      { key: 'profile_count', hintKey: 'settings.customPageProfileCountHint' },
      { key: 'title', hintKey: 'settings.customPageTitleHint' },
      { key: 'description', hintKey: 'settings.customPageDescriptionHint' },
    ],
  },
];

const templates = CUSTOM_PAGE_TEMPLATES;

const commitApplyTemplate = (tpl: CustomPageTemplate): void => {
  const parsed = parseCustomPageSource(tpl.content, tpl.css || '');
  updateCustomPage({
    content: parsed.html,
    css: parsed.css,
    useDefaultLayout: tpl.layoutPreset.useDefaultLayout,
    hideHeader: tpl.layoutPreset.hideHeader,
    hideFooter: tpl.layoutPreset.hideFooter,
    hideBranding: tpl.layoutPreset.hideBranding,
  });
  showToast(t('settings.customPageTemplateApplied', { name: t(tpl.nameKey) }), 'success');
};

const handleTemplateClick = (tpl: CustomPageTemplate, togglePopover: () => void): void => {
  if (!hasExistingCode.value) {
    commitApplyTemplate(tpl);
    return;
  }
  togglePopover();
};

const normalizeFullPageSource = (): void => {
  const parsed = parseCustomPageSource(customPage.value.content, customPage.value.css);
  updateCustomPage({
    content: parsed.html,
    css: parsed.css,
  });
  showToast(t('settings.customPageNormalizeApplied'), 'success');
};

const triggerHtmlImport = (): void => {
  htmlFileInputRef.value?.click();
};

const readSelectedHtmlFile = async (file: File): Promise<string> => {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(t('settings.customPageImportHtmlFailed')));
    reader.readAsText(file);
  });
};

const handleHtmlFileChange = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    if (typeof file.size === 'number' && file.size > MAX_HTML_FILE_SIZE) {
      const limitMb = (MAX_HTML_FILE_SIZE / 1024 / 1024).toFixed(1);
      showToast(
        t('fileImport.tooLarge', {
          size: (file.size / 1024 / 1024).toFixed(1),
          limit: limitMb,
        }),
        'warning',
      );
      return;
    }

    const rawText = await readSelectedHtmlFile(file);
    if (!rawText.trim()) {
      showToast(t('settings.customPageImportHtmlEmpty'), 'warning');
      return;
    }

    const parsed = parseCustomPageSource(rawText, '');
    updateCustomPage({
      content: parsed.html,
      css: parsed.css,
    });

    const hasStripped = parsed.strippedScripts || parsed.stylesheets.length > 0;
    showToast(
      t(hasStripped ? 'settings.customPageImportHtmlStripped' : 'settings.customPageImportHtmlSuccess', {
        name: file.name,
      }),
      'success',
    );
  } catch {
    showToast(t('settings.customPageImportHtmlFailed'), 'error');
  } finally {
    input.value = '';
  }
};

const copyAiPrompt = async (): Promise<void> => {
  const prompt = buildCustomPageAiPrompt(locale.value);
  const copied = await copyTextToClipboard(prompt);
  if (!copied) {
    showToast(t('settings.customPageAiPromptCopyFailed'), 'error');
    return;
  }

  aiPromptCopied.value = true;
  if (copyResetTimer !== null) {
    clearTimeout(copyResetTimer);
  }
  copyResetTimer = setTimeout(() => {
    aiPromptCopied.value = false;
    copyResetTimer = null;
  }, 2000);

  showToast(t('settings.customPageAiPromptCopiedToast'), 'success');
};

const handleFullscreenSave = (): void => {
  if (props.saveDisabled || props.isSaving) return;
  emit('save');
};

const handleGlobalKeydown = (event: KeyboardEvent): void => {
  if (isFullscreen.value && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    isFullscreen.value = false;
    return;
  }

  if (customPage.value.enabled && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isInsideRoot = Boolean(rootRef.value && activeEl && rootRef.value.contains(activeEl));
    if (!isFullscreen.value && !(props.isActive && isInsideRoot)) {
      return;
    }

    event.preventDefault();
    handleFullscreenSave();
  }
};

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleGlobalKeydown);
  }
  if (copyResetTimer !== null) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }
});
</script>

<template>
  <div ref="rootRef" class="space-y-4 animate-fade-in">
    <input
      ref="htmlFileInputRef"
      accept=".html,.htm,text/html"
      class="hidden"
      data-testid="custom-page-html-file-input"
      type="file"
      @change="handleHtmlFileChange"
    />

    <SettingCard
      :description="t('settings.customPageDesc')"
      :no-margin="!customPage.enabled"
      :title="t('settings.customPageTitle')"
    >
      <template #actions>
        <Switch
          :model-value="Boolean(customPage.enabled)"
          @update:model-value="updateCustomPage({ enabled: Boolean($event) })"
        />
      </template>

      <div v-if="customPage.enabled" class="space-y-5">
        <!-- 1. 紧凑化顶部配置区：布局与显示选项横向开关组 -->
        <div class="rounded-lg border border-line bg-inset/40 p-3 space-y-2.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-fg-muted">{{ t('settings.customPageLayoutOptions') }}</span>
            <span
              :title="t('settings.customPageRenderDesc')"
              class="shrink-0 px-2 py-0.5 rounded bg-accent text-accent-fg text-[11px] font-mono font-semibold"
            >
              {{ t('settings.customPageHtmlCssRender') }}
            </span>
          </div>

          <div
            class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2"
            data-testid="custom-page-layout-options"
          >
            <div
              v-for="row in layoutSwitchRows"
              :key="row.key"
              :title="t(row.descKey)"
              class="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-line bg-surface/80"
            >
              <span class="text-xs font-medium text-fg truncate">{{ t(row.titleKey) }}</span>
              <Switch
                :model-value="Boolean(customPage[row.key])"
                @update:model-value="updateCustomPage({ [row.key]: Boolean($event) })"
              />
            </div>
          </div>
        </div>

        <!-- 2. 编辑器工具栏与分屏实时预览区 -->
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <!-- 左侧：HTML / CSS 切换 + 安全规则 Tooltip -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="inline-flex items-center rounded-md border border-line bg-inset p-0.5">
                <button
                  :aria-pressed="activeCodeTab === 'html'"
                  :class="
                    activeCodeTab === 'html'
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg-muted hover:text-fg hover:bg-hover'
                  "
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors"
                  data-testid="custom-page-tab-html"
                  type="button"
                  @click="activeCodeTab = 'html'"
                >
                  <Code2 class="w-3.5 h-3.5" />
                  <span>{{ t('settings.customPageTabHtml') }}</span>
                  <span
                    v-if="(customPage.content || '').trim()"
                    class="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    aria-hidden="true"
                  ></span>
                </button>
                <button
                  :aria-pressed="activeCodeTab === 'css'"
                  :class="
                    activeCodeTab === 'css'
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg-muted hover:text-fg hover:bg-hover'
                  "
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors"
                  data-testid="custom-page-tab-css"
                  type="button"
                  @click="activeCodeTab = 'css'"
                >
                  <span>{{ t('settings.customPageTabCss') }}</span>
                  <span
                    v-if="(customPage.css || '').trim()"
                    class="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    aria-hidden="true"
                  ></span>
                </button>
              </div>

              <!-- 安全规则 Tooltip -->
              <div class="relative group" @mouseleave="showSecurityTooltip = false">
                <button
                  :aria-expanded="showSecurityTooltip"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-transparent text-xs text-fg-muted hover:text-fg hover:bg-hover hover:border-line-strong transition-colors"
                  data-testid="custom-page-security-tooltip-trigger"
                  type="button"
                  @click="showSecurityTooltip = !showSecurityTooltip"
                >
                  <ShieldCheck class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{{ t('settings.customPageSecurityRules') }}</span>
                </button>

                <div
                  :class="
                    showSecurityTooltip
                      ? 'opacity-100 visible pointer-events-auto'
                      : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto'
                  "
                  class="popover-surface absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-lg p-3.5 text-xs z-30 transition-opacity duration-150 space-y-2.5"
                  data-testid="custom-page-security-tooltip"
                  role="tooltip"
                >
                  <p class="font-semibold text-fg">{{ t('settings.customPageSecurityRulesTitle') }}</p>
                  <div v-for="row in fixedDisabledRows" :key="row.titleKey" class="space-y-1 border-t border-line pt-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-medium text-fg">{{ t(row.titleKey) }}</span>
                      <span class="shrink-0 px-1.5 py-0.5 rounded border border-line text-[10px] font-mono text-fg-muted">
                        {{ t('settings.customPageFixedDisabled') }}
                      </span>
                    </div>
                    <p class="text-[11px] text-fg-muted leading-relaxed">{{ t(row.descKey) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：导入 .html、整理源码、复制 AI 提示词、全屏工作台 -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
                data-testid="custom-page-import-html-btn"
                type="button"
                @click="triggerHtmlImport"
              >
                <Upload class="w-3.5 h-3.5" />
                <span>{{ t('settings.customPageImportHtml') }}</span>
              </button>

              <button
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
                data-testid="custom-page-normalize-btn"
                type="button"
                @click="normalizeFullPageSource"
              >
                <Wand2 class="w-3.5 h-3.5" />
                <span>{{ t('settings.customPageNormalizeSource') }}</span>
              </button>

              <button
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
                data-testid="custom-page-copy-ai-prompt"
                type="button"
                @click="copyAiPrompt"
              >
                <Check v-if="aiPromptCopied" class="w-3.5 h-3.5 text-emerald-500" />
                <Sparkles v-else class="w-3.5 h-3.5" />
                <span>{{
                  aiPromptCopied ? t('settings.customPageAiPromptCopied') : t('settings.customPageCopyAiPrompt')
                }}</span>
              </button>

              <button
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent text-accent-fg border border-accent text-xs font-medium hover:opacity-90 transition-opacity"
                data-testid="custom-page-fullscreen-btn"
                type="button"
                @click="isFullscreen = true"
              >
                <Maximize2 class="w-3.5 h-3.5" />
                <span>{{ t('settings.customPageFullscreenOpen') }}</span>
              </button>
            </div>
          </div>

          <!-- 分屏编辑与实时预览 -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <!-- 左侧代码区 -->
            <div class="h-[500px] rounded-md border border-line bg-inset flex flex-col overflow-hidden">
              <div
                v-if="activeCodeTab === 'html'"
                class="flex items-center gap-1.5 px-2.5 py-2 border-b border-line bg-surface/60 overflow-x-auto no-scrollbar shrink-0"
              >
                <button
                  v-for="p in placeholderChips"
                  :key="p"
                  class="shrink-0 text-[11px] font-mono px-2 py-0.5 bg-transparent text-fg-muted rounded border border-line hover:bg-hover hover:text-fg transition-colors"
                  type="button"
                  @click="insertPlaceholder(p)"
                >
                  {&#123;{{ p }}&#125;}
                </button>
              </div>

              <textarea
                v-if="activeCodeTab === 'html'"
                ref="inlineHtmlTextareaRef"
                :aria-label="t('settings.customPageHtmlContent')"
                :placeholder="
                  t('settings.customPageSourcePlaceholder', {
                    action: t('settings.customPageNormalizeSource'),
                  })
                "
                :value="customPage.content"
                class="flex-1 w-full min-h-0 resize-none border-0 bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-subtle outline-none focus:outline-none"
                data-testid="custom-page-html-textarea"
                spellcheck="false"
                @input="updateCustomPage({ content: ($event.target as HTMLTextAreaElement).value })"
              ></textarea>

              <textarea
                v-else
                :aria-label="t('settings.customPageCss')"
                :placeholder="
                  t('settings.customPageCssPlaceholder', {
                    name: t('settings.customPageCss'),
                  })
                "
                :value="customPage.css"
                class="flex-1 w-full min-h-0 resize-none border-0 bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-subtle outline-none focus:outline-none"
                data-testid="custom-page-css-textarea"
                spellcheck="false"
                @input="updateCustomPage({ css: ($event.target as HTMLTextAreaElement).value })"
              ></textarea>
            </div>

            <!-- 右侧实时预览区 -->
            <CustomPagePreviewPane
              v-model:theme="previewTheme"
              v-model:viewport="previewViewport"
              :announcement="settings.announcement"
              :content="customPage.content"
              :css="customPage.css"
              :hero-title2="settings.hero?.title2"
              :hide-branding="Boolean(customPage.hideBranding)"
              :hide-footer="Boolean(customPage.hideFooter)"
              :hide-header="Boolean(customPage.hideHeader)"
              :site-description="settings.hero?.description"
              :site-title="settings.hero?.title1"
              :use-default-layout="customPage.useDefaultLayout !== false"
            />
          </div>
        </div>

        <!-- 3. 快速应用模板（带轻量覆盖确认） -->
        <div class="pt-1">
          <h3 class="text-xs font-semibold text-fg-muted mb-2.5">
            {{ t('settings.customPageTemplatesTitle') }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ConfirmPopover
              v-for="tpl in templates"
              :key="tpl.id"
              :confirm-text="t('settings.customPageOverwriteConfirm')"
              :description="t('settings.customPageApplyConfirm', { name: t(tpl.nameKey) })"
              :title="t('settings.customPageOverwriteTitle')"
              trigger-class="block w-full"
              variant="danger"
              @confirm="commitApplyTemplate(tpl)"
            >
              <template #trigger="{ toggle }">
                <button
                  class="group w-full text-left p-3.5 rounded-lg border border-line bg-inset/60 hover:bg-hover hover:border-line-strong transition-colors flex flex-col gap-3"
                  data-testid="custom-page-template"
                  type="button"
                  @click="handleTemplateClick(tpl, toggle)"
                >
                  <div
                    class="w-full h-20 rounded-md border border-line bg-canvas/90 p-2.5 overflow-hidden relative flex flex-col justify-between"
                    aria-hidden="true"
                  >
                    <div class="flex flex-col items-center gap-1 pt-0.5">
                      <div class="w-12 h-1.5 rounded-full bg-primary-500/40"></div>
                      <div class="w-2/3 h-2 rounded bg-fg/20"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-1 mt-1.5">
                      <div v-for="i in 3" :key="i" class="h-3 rounded bg-surface border border-line"></div>
                    </div>
                    <div class="w-full h-3.5 rounded bg-surface border border-line mt-1"></div>
                  </div>

                  <div class="space-y-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-semibold text-fg group-hover:text-fg">{{ t(tpl.nameKey) }}</span>
                      <span
                        class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border border-line bg-surface text-fg-muted"
                      >
                        {{ t(tpl.badgeKey) }}
                      </span>
                    </div>
                    <p class="text-[11px] leading-relaxed text-fg-muted">
                      {{ t(tpl.descKey) }}
                    </p>
                  </div>
                </button>
              </template>
            </ConfirmPopover>
          </div>
        </div>

        <!-- 4. 折叠式占位符参考说明 -->
        <details class="group rounded-md border border-line bg-inset/50 text-xs text-fg-muted leading-relaxed">
          <summary
            class="flex items-center justify-between gap-2 px-4 py-2.5 font-semibold text-fg select-none list-none cursor-pointer"
          >
            <span>{{ t('settings.customPagePlaceholdersTitle') }}</span>
            <ChevronDown class="w-4 h-4 text-fg-muted transition-transform group-open:rotate-180" />
          </summary>
          <div class="px-4 pb-3.5 pt-1 border-t border-line/60 space-y-2">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              <ul v-for="group in placeholderDocGroups" :key="group.titleKey" class="list-disc list-inside space-y-1">
                <li class="font-semibold text-fg">
                  {{ t(group.titleKey) }}
                </li>
                <li v-for="item in group.items" :key="item.key">
                  <strong class="font-mono text-fg-muted">{&#123;{{ item.key }}&#125;}</strong>:
                  {{ t(item.hintKey) }}
                </li>
              </ul>
            </div>
            <p class="text-fg-muted">{{ t('settings.customPageModeHint') }}</p>
          </div>
        </details>
      </div>
    </SettingCard>

    <!-- 5. 全屏编辑工作台 -->
    <Teleport to="body">
      <div
        v-if="isFullscreen && customPage.enabled"
        :aria-label="t('settings.customPageFullscreenTitle')"
        aria-modal="true"
        class="fixed inset-0 z-[var(--z-modal)] bg-canvas flex flex-col"
        data-testid="custom-page-fullscreen-workbench"
        role="dialog"
      >
        <header
          class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-line bg-surface shrink-0"
        >
          <div class="flex items-center gap-3 min-w-0 flex-wrap">
            <span class="text-sm font-semibold text-fg truncate">{{ t('settings.customPageFullscreenTitle') }}</span>

            <div class="hidden xl:flex items-center gap-1.5">
              <div
                v-for="row in layoutSwitchRows"
                :key="`fs-${row.key}`"
                :title="t(row.descKey)"
                class="flex items-center gap-2 px-2 py-1 rounded border border-line bg-inset/70"
              >
                <span class="text-[11px] font-medium text-fg-muted whitespace-nowrap">{{ t(row.titleKey) }}</span>
                <Switch
                  :model-value="Boolean(customPage[row.key])"
                  @update:model-value="updateCustomPage({ [row.key]: Boolean($event) })"
                />
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            <div class="relative group" @mouseleave="showFullscreenSecurityTooltip = false">
              <button
                :aria-expanded="showFullscreenSecurityTooltip"
                class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-transparent text-xs text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="showFullscreenSecurityTooltip = !showFullscreenSecurityTooltip"
              >
                <ShieldCheck class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span class="hidden sm:inline">{{ t('settings.customPageSecurityRules') }}</span>
              </button>

              <div
                :class="
                  showFullscreenSecurityTooltip
                    ? 'opacity-100 visible pointer-events-auto'
                    : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto'
                "
                class="popover-surface absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg p-3.5 text-xs z-30 transition-opacity duration-150 space-y-2.5"
                role="tooltip"
              >
                <p class="font-semibold text-fg">{{ t('settings.customPageSecurityRulesTitle') }}</p>
                <div v-for="row in fixedDisabledRows" :key="row.titleKey" class="space-y-1 border-t border-line pt-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-fg">{{ t(row.titleKey) }}</span>
                    <span class="shrink-0 px-1.5 py-0.5 rounded border border-line text-[10px] font-mono text-fg-muted">
                      {{ t('settings.customPageFixedDisabled') }}
                    </span>
                  </div>
                  <p class="text-[11px] text-fg-muted leading-relaxed">{{ t(row.descKey) }}</p>
                </div>
              </div>
            </div>

            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
              type="button"
              @click="triggerHtmlImport"
            >
              <Upload class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">{{ t('settings.customPageImportHtml') }}</span>
            </button>

            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
              type="button"
              @click="normalizeFullPageSource"
            >
              <Wand2 class="w-3.5 h-3.5" />
              <span class="hidden md:inline">{{ t('settings.customPageNormalizeSource') }}</span>
            </button>

            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
              type="button"
              @click="copyAiPrompt"
            >
              <Check v-if="aiPromptCopied" class="w-3.5 h-3.5 text-emerald-500" />
              <Sparkles v-else class="w-3.5 h-3.5" />
              <span class="hidden md:inline">{{
                aiPromptCopied ? t('settings.customPageAiPromptCopied') : t('settings.customPageCopyAiPrompt')
              }}</span>
            </button>

            <button
              :disabled="saveDisabled || isSaving"
              :title="t('settings.customPageSaveShortcutHint')"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-fg border border-accent text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              data-testid="custom-page-fullscreen-save"
              type="button"
              @click="handleFullscreenSave"
            >
              <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
              <Save v-else class="w-3.5 h-3.5" />
              <span>{{ isSaving ? t('settings.saving') : t('settings.saveChanges') }}</span>
              <kbd class="hidden sm:inline-block px-1 py-0.5 text-[10px] font-mono rounded bg-black/15 dark:bg-white/15">
                Ctrl+S
              </kbd>
            </button>

            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-transparent text-xs font-medium text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
              data-testid="custom-page-fullscreen-close"
              type="button"
              @click="isFullscreen = false"
            >
              <Minimize2 class="w-3.5 h-3.5" />
              <span>{{ t('settings.customPageFullscreenExit') }}</span>
            </button>
          </div>
        </header>

        <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
          <!-- 全屏左侧代码区 -->
          <div class="min-h-0 h-full flex flex-col bg-inset overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-surface/70 shrink-0">
              <div class="inline-flex items-center rounded-md border border-line bg-inset p-0.5">
                <button
                  :aria-pressed="activeCodeTab === 'html'"
                  :class="
                    activeCodeTab === 'html'
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg-muted hover:text-fg hover:bg-hover'
                  "
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors"
                  type="button"
                  @click="activeCodeTab = 'html'"
                >
                  <Code2 class="w-3.5 h-3.5" />
                  <span>{{ t('settings.customPageTabHtml') }}</span>
                </button>
                <button
                  :aria-pressed="activeCodeTab === 'css'"
                  :class="
                    activeCodeTab === 'css'
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg-muted hover:text-fg hover:bg-hover'
                  "
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors"
                  type="button"
                  @click="activeCodeTab = 'css'"
                >
                  <span>{{ t('settings.customPageTabCss') }}</span>
                </button>
              </div>

              <div
                v-if="activeCodeTab === 'html'"
                class="flex items-center gap-1 overflow-x-auto no-scrollbar"
              >
                <button
                  v-for="p in placeholderChips"
                  :key="`fs-chip-${p}`"
                  class="shrink-0 text-[11px] font-mono px-2 py-0.5 bg-transparent text-fg-muted rounded border border-line hover:bg-hover hover:text-fg transition-colors"
                  type="button"
                  @click="insertPlaceholder(p)"
                >
                  {&#123;{{ p }}&#125;}
                </button>
              </div>
            </div>

            <textarea
              v-if="activeCodeTab === 'html'"
              ref="fullscreenHtmlTextareaRef"
              :aria-label="t('settings.customPageHtmlContent')"
              :placeholder="
                t('settings.customPageSourcePlaceholder', {
                  action: t('settings.customPageNormalizeSource'),
                })
              "
              :value="customPage.content"
              class="flex-1 w-full min-h-0 resize-none border-0 bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-subtle outline-none focus:outline-none"
              spellcheck="false"
              @input="updateCustomPage({ content: ($event.target as HTMLTextAreaElement).value })"
            ></textarea>

            <textarea
              v-else
              :aria-label="t('settings.customPageCss')"
              :placeholder="
                t('settings.customPageCssPlaceholder', {
                  name: t('settings.customPageCss'),
                })
              "
              :value="customPage.css"
              class="flex-1 w-full min-h-0 resize-none border-0 bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-subtle outline-none focus:outline-none"
              spellcheck="false"
              @input="updateCustomPage({ css: ($event.target as HTMLTextAreaElement).value })"
            ></textarea>
          </div>

          <!-- 全屏右侧实时预览区 -->
          <div class="min-h-0 h-full overflow-hidden">
            <CustomPagePreviewPane
              v-model:theme="previewTheme"
              v-model:viewport="previewViewport"
              :announcement="settings.announcement"
              :content="customPage.content"
              :css="customPage.css"
              :hero-title2="settings.hero?.title2"
              :hide-branding="Boolean(customPage.hideBranding)"
              :hide-footer="Boolean(customPage.hideFooter)"
              :hide-header="Boolean(customPage.hideHeader)"
              :site-description="settings.hero?.description"
              :site-title="settings.hero?.title1"
              :use-default-layout="customPage.useDefaultLayout !== false"
              fullscreen
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
