<script setup>
import { computed } from 'vue';
import { CUSTOM_PAGE_TEMPLATES } from '@/constants/custom-page-templates.js';
import { parseCustomPageSource } from '@/utils/custom-page-source.js';
import { useI18n } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import SettingCard from '@/components/settings/SettingCard.vue';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

if (!props.settings.customPage) {
  props.settings.customPage = {
    enabled: false,
    type: 'html',
    content: '',
    css: '',
    useDefaultLayout: true,
    allowExternalStylesheets: false,
    allowScripts: false,
    hideBranding: false,
    hideHeader: false,
    hideFooter: false,
  };
}

if (props.settings.customPage.type !== 'html') {
  props.settings.customPage.type = 'html';
}

const cp = props.settings.customPage;
if (typeof cp.allowExternalStylesheets !== 'boolean') cp.allowExternalStylesheets = false;
if (typeof cp.allowScripts !== 'boolean') cp.allowScripts = false;
if (typeof cp.hideBranding !== 'boolean') cp.hideBranding = false;
if (typeof cp.hideHeader !== 'boolean') cp.hideHeader = false;
if (typeof cp.hideFooter !== 'boolean') cp.hideFooter = false;

const customPage = computed(() => props.settings.customPage);

const insertPlaceholder = (placeholder) => {
  props.settings.customPage.content = (customPage.value.content || '') + `{{${placeholder}}}`;
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
];

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

const applyTemplate = async (tpl) => {
  const confirmed = await confirmAction({
    message: t('settings.customPageApplyConfirm', { name: t(tpl.nameKey) }),
  });
  if (confirmed) {
    const parsed = parseCustomPageSource(tpl.content, tpl.css || '');
    props.settings.customPage.type = 'html';
    props.settings.customPage.content = parsed.html;
    props.settings.customPage.css = parsed.css;

    if (tpl.layoutPreset) {
      props.settings.customPage.useDefaultLayout = tpl.layoutPreset.useDefaultLayout;
      props.settings.customPage.hideHeader = tpl.layoutPreset.hideHeader;
      props.settings.customPage.hideFooter = tpl.layoutPreset.hideFooter;
      props.settings.customPage.hideBranding = tpl.layoutPreset.hideBranding;
    }

    props.settings.customPage.allowExternalStylesheets = false;
    props.settings.customPage.allowScripts = false;
  }
};

const normalizeFullPageSource = () => {
  const parsed = parseCustomPageSource(props.settings.customPage.content, props.settings.customPage.css);
  props.settings.customPage.content = parsed.html;
  props.settings.customPage.css = parsed.css;
};
</script>

<template>
  <div class="space-y-4 animate-fade-in">
    <SettingCard
      :description="t('settings.customPageDesc')"
      :no-margin="!customPage.enabled"
      :title="t('settings.customPageTitle')"
    >
      <template #actions>
        <Switch v-model="props.settings.customPage.enabled" />
      </template>

      <div v-if="customPage.enabled" class="space-y-6">
        <div class="divide-y divide-line-subtle">
          <div class="py-5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <p class="text-sm font-medium text-fg">
                {{ t('settings.customPageRenderMode') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.customPageRenderDesc') }}
              </p>
            </div>
            <span
              class="self-start sm:self-center shrink-0 px-2.5 py-1 rounded-md bg-accent text-accent-fg border border-accent text-xs font-mono font-semibold"
              >{{ t('settings.customPageHtmlCssRender') }}</span
            >
          </div>

          <div
            v-for="row in layoutSwitchRows"
            :key="row.key"
            class="py-5 first:pt-0 last:pb-0 flex items-center justify-between gap-6"
          >
            <div class="space-y-1 flex-1">
              <p class="text-sm font-medium text-fg">
                {{ t(row.titleKey) }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t(row.descKey) }}
              </p>
            </div>
            <Switch v-model="props.settings.customPage[row.key]" />
          </div>

          <div
            v-for="row in fixedDisabledRows"
            :key="row.titleKey"
            class="py-5 first:pt-0 last:pb-0 flex items-center justify-between gap-6"
          >
            <div class="space-y-1 flex-1">
              <p class="text-sm font-medium text-fg">
                {{ t(row.titleKey) }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t(row.descKey) }}
              </p>
            </div>
            <span
              class="shrink-0 px-2 py-0.5 rounded-md border border-line bg-transparent text-fg-muted text-xs font-mono"
              >{{ t('settings.customPageFixedDisabled') }}</span
            >
          </div>
        </div>

        <hr class="border-line" />

        <div class="space-y-6">
          <div>
            <div class="flex items-center justify-between gap-3 mb-2">
              <label class="text-xs font-semibold text-fg-muted whitespace-nowrap shrink-0">
                {{ t('settings.customPageHtmlContent') }}
              </label>
              <button
                class="shrink-0 whitespace-nowrap text-xs font-mono px-2.5 py-1 bg-accent text-accent-fg rounded-md border border-accent hover:opacity-90 transition-colors font-medium"
                type="button"
                @click="normalizeFullPageSource"
              >
                {{ t('settings.customPageNormalizeSource') }}
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
              <button
                v-for="p in placeholderChips"
                :key="p"
                class="text-xs font-mono px-2 py-1 bg-transparent text-fg-muted rounded-md border border-line hover:bg-hover hover:text-fg transition-colors"
                type="button"
                @click="insertPlaceholder(p)"
              >
                {&#123;{{ p }}&#125;}
              </button>
            </div>
            <Textarea
              v-model="props.settings.customPage.content"
              :placeholder="
                t('settings.customPageSourcePlaceholder', {
                  action: t('settings.customPageNormalizeSource'),
                })
              "
              class="px-3 py-2.5 font-mono text-xs leading-relaxed"
              rows="12"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-fg-muted mb-2.5">{{ t('settings.customPageCss') }}</label>
            <Textarea
              v-model="props.settings.customPage.css"
              :placeholder="
                t('settings.customPageCssPlaceholder', {
                  name: t('settings.customPageCss'),
                })
              "
              class="px-3 py-2.5 font-mono text-xs leading-relaxed"
              rows="6"
            />
          </div>
        </div>

        <div class="pt-2">
          <h3 class="text-xs font-semibold text-fg-muted mb-3">
            {{ t('settings.customPageTemplatesTitle') }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              v-for="tpl in templates"
              :key="tpl.id"
              class="group text-left p-3.5 rounded-lg border border-line bg-inset/60 hover:bg-hover hover:border-line-strong transition-colors flex flex-col gap-3"
              data-testid="custom-page-template"
              type="button"
              @click="applyTemplate(tpl)"
            >
              <!-- 缩略布局示意 -->
              <div
                class="w-full h-20 rounded-md border border-line bg-canvas/90 p-2.5 overflow-hidden relative flex flex-col justify-between"
                aria-hidden="true"
              >
                <template v-if="tpl.id === 'minimal-nav'">
                  <div class="w-10 h-2 rounded-full bg-fg/20 mx-auto mt-1"></div>
                  <div class="w-3/4 h-2.5 rounded-full bg-fg/15 border border-line mx-auto"></div>
                  <div class="grid grid-cols-4 gap-1.5 w-full">
                    <div v-for="i in 4" :key="i" class="h-4 rounded bg-surface border border-line"></div>
                  </div>
                </template>
                <template v-else-if="tpl.id === 'personal-home'">
                  <div class="w-full h-2 rounded bg-surface border border-line"></div>
                  <div class="grid grid-cols-3 gap-1.5 flex-1 mt-1.5">
                    <div class="col-span-2 rounded bg-surface border border-line p-1.5 flex flex-col justify-end">
                      <div class="w-2/3 h-1.5 rounded bg-fg/20"></div>
                    </div>
                    <div class="flex flex-col gap-1">
                      <div class="flex-1 rounded bg-surface border border-line"></div>
                      <div class="flex-1 rounded bg-surface border border-line"></div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="flex flex-col items-center gap-1 pt-0.5">
                    <div class="w-12 h-1.5 rounded-full bg-primary-500/40"></div>
                    <div class="w-2/3 h-2 rounded bg-fg/20"></div>
                  </div>
                  <div class="grid grid-cols-3 gap-1 mt-1.5">
                    <div v-for="i in 3" :key="i" class="h-3 rounded bg-surface border border-line"></div>
                  </div>
                  <div class="w-full h-3.5 rounded bg-surface border border-line mt-1"></div>
                </template>
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
          </div>
        </div>

        <div class="rounded-md border border-line bg-inset/50 p-4 text-xs text-fg-muted leading-relaxed space-y-2">
          <p class="font-semibold text-fg">
            {{ t('settings.customPagePlaceholdersTitle') }}
          </p>
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
      </div>
    </SettingCard>
  </div>
</template>
