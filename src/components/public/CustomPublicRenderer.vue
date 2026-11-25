<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ProfileConfig, SettingsConfig } from '@misub/core/types.js';
import { useRoute } from 'vue-router';
import { Moon, Sun } from '@lucide/vue';
import DOMPurify from 'dompurify';
import { useThemeStore } from '@/stores/useThemeStore.js';
import { parseCustomPageSource } from '@/utils/custom-page-source.js';
import { useI18n } from '@/i18n/index.js';
import packageJson from '../../../package.json';

type PublicProfile = ProfileConfig & { subscriptionCount?: number; manualNodeCount?: number };

const route = useRoute();
const themeStore = useThemeStore();
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    content?: string;
    css?: string;
    config?: SettingsConfig & Record<string, any>;
    profiles?: PublicProfile[];
  }>(),
  {
    content: '',
    css: '',
    config: () => ({}),
    profiles: () => [],
  },
);

const styleId = 'custom-public-page-styles';
const stylesheetDataAttr = 'data-custom-page-stylesheet';
const scriptDataAttr = 'data-custom-page-script';
const disableTeleport = ref(false);
const isReady = ref(false);

const removeStyles = () => {
  const styleEl = document.getElementById(styleId);
  if (styleEl) {
    styleEl.remove();
  }
};

const removeExternalStylesheets = () => {
  document.querySelectorAll(`[${stylesheetDataAttr}="true"]`).forEach((node) => node.remove());
};

const removeScripts = () => {
  document.querySelectorAll(`[${scriptDataAttr}="true"]`).forEach((node) => node.remove());
};

// 处理占位符
// 我们将 {{placeholder}} 替换为 <div data-slot="placeholder"></div>
// 然后在模板中使用 Teleport 将真正的组件传送到这些位置
const customPageConfig = computed(() => props.config?.customPage || {});
const customPageType = computed(() => customPageConfig.value.type || 'html');
const isIframeMode = computed(() => ['iframe-srcdoc', 'iframe-url'].includes(customPageType.value));
const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-slot', 'target'],
    FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'style'],
  });
const iframeSandbox = 'allow-forms allow-popups allow-popups-to-escape-sandbox';
const iframeSrcdoc = computed(() =>
  customPageType.value === 'iframe-srcdoc' ? sanitizeHtml(props.content || '') : undefined,
);
const safeIframeUrl = (value: unknown) => {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};
const iframeSrc = computed(() =>
  customPageType.value === 'iframe-url' ? safeIframeUrl(customPageConfig.value.iframeUrl) : undefined,
);
const iframeAllowFullscreen = computed(() =>
  customPageConfig.value.iframeAllowFullscreen === true ? true : undefined,
);
const iframeHostStyle = computed(() => ({
  paddingTop: customPageConfig.value.iframePaddingY || undefined,
  paddingBottom: customPageConfig.value.iframePaddingY || undefined,
  width: customPageConfig.value.iframeFullWidth === true ? '100%' : undefined,
}));
const iframeStyle = computed(() => ({
  width: '100%',
  height: customPageConfig.value.iframeHeight || undefined,
  borderRadius: customPageConfig.value.iframeRadius || undefined,
}));
const iframeUsesDefaultViewportHeight = computed(() => !customPageConfig.value.iframeHeight);

const parsedSource = computed(() => parseCustomPageSource(props.content, props.css));
const escapeHtml = (value: unknown) => {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const renderedHtml = computed(() => {
  let html = parsedSource.value.html || '';

  // 1. 文本占位符替换
  const nodeCount = props.profiles.reduce((sum, p) => sum + (p.subscriptionCount || 0) + (p.manualNodeCount || 0), 0);
  const textVars = {
    version: packageJson.version,
    title: props.config?.hero?.title1 || '',
    description: props.config?.hero?.description || '',
    profile_count: props.profiles.length,
    node_count: nodeCount,
  };

  for (const [key, val] of Object.entries(textVars)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    html = html.replace(regex, escapeHtml(val));
  }

  // 2. 组件占位符替换 (转换为 data-slot div)
  const placeholders = ['profiles', 'announcement', 'announcements', 'hero', 'guestbook', 'theme_toggle'];
  placeholders.forEach((p) => {
    // 使用 gi 确保不区分大小写，announcement 与 announcements 统一映射到 announcements 插槽
    const slotName = p === 'announcement' ? 'announcements' : p;
    const regex = new RegExp(`{{\\s*${p}\\s*}}`, 'gi');
    html = html.replace(regex, `<div data-slot="${slotName}"></div>`);
  });

  return sanitizeHtml(html);
});

// 用于检测占位符是否在 HTML 中的辅助函数
const hasSlot = (name: string) => {
  return renderedHtml.value.includes(`data-slot="${name}"`);
};

// 监听内容变化，确保 DOM 更新后才开启 Teleport
watch(
  renderedHtml,
  async () => {
    isReady.value = false;
    await nextTick();
    isReady.value = true;
  },
  { immediate: true },
);

const injectStyles = () => {
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = parsedSource.value.css;
};

const injectExternalStylesheets = () => {
  removeExternalStylesheets();

  // 第二批安全加固后，公开页不再动态加载用户提供的外部资源，避免
  // 测试/生产环境发起非预期请求，也降低公开页被用作追踪或内容注入的风险。
};

const executeScripts = async () => {
  removeScripts();
  // 安全加固：自定义公开页脚本不再在主页面同源上下文执行。
  // 需要完整第三方页面能力时，应使用已 sandbox 的 iframe 模式。
};

onMounted(injectStyles);
watch(parsedSource, injectStyles, { deep: true });
onMounted(injectExternalStylesheets);
watch(parsedSource, injectExternalStylesheets, { deep: true });
onMounted(() => {
  executeScripts();
});
watch(
  parsedSource,
  () => {
    executeScripts();
  },
  { deep: true },
);
onUnmounted(() => {
  removeStyles();
  removeExternalStylesheets();
  removeScripts();
});

// 监听路由变化，在切走前提前关闭 Teleport，防止 Vue 在销毁 DOM 时因找不到目标节点而报错
watch(
  () => route.path,
  (newPath, oldPath) => {
    if (oldPath && newPath !== oldPath) {
      isReady.value = false;
      disableTeleport.value = true;
    }
  },
);
</script>

<template>
  <div class="custom-public-renderer">
    <div v-if="isIframeMode" :style="iframeHostStyle" class="iframe-host">
      <iframe
        v-if="customPageType === 'iframe-srcdoc'"
        :allowfullscreen="iframeAllowFullscreen"
        :class="{
          'iframe-shadow': customPageConfig.iframeShadow === true,
          'iframe-immersive-default': iframeUsesDefaultViewportHeight,
        }"
        :sandbox="iframeSandbox"
        :srcdoc="iframeSrcdoc"
        :style="iframeStyle"
        class="custom-page-iframe"
      ></iframe>
      <iframe
        v-else
        :allowfullscreen="iframeAllowFullscreen"
        :class="{
          'iframe-shadow': customPageConfig.iframeShadow === true,
          'iframe-immersive-default': iframeUsesDefaultViewportHeight,
        }"
        :sandbox="iframeSandbox"
        :src="iframeSrc"
        :style="iframeStyle"
        class="custom-page-iframe"
      ></iframe>
    </div>

    <template v-else>
      <!-- 渲染用户 HTML -->
      <div class="custom-html-container" v-html="renderedHtml"></div>

      <!-- 使用 Teleport 将原始组件插槽传送到对应的占位符 div 中 -->
      <!-- 仅在 isReady 为 true 时挂载，确保 data-slot 节点已存在于 DOM -->
      <template v-if="isReady">
        <Teleport v-if="hasSlot('profiles')" :disabled="disableTeleport" to='[data-slot="profiles"]'>
          <slot name="profiles"></slot>
        </Teleport>

        <Teleport v-if="hasSlot('announcements')" :disabled="disableTeleport" to='[data-slot="announcements"]'>
          <slot name="announcements"></slot>
        </Teleport>

        <Teleport v-if="hasSlot('hero')" :disabled="disableTeleport" to='[data-slot="hero"]'>
          <slot name="hero"></slot>
        </Teleport>

        <Teleport v-if="hasSlot('guestbook')" :disabled="disableTeleport" to='[data-slot="guestbook"]'>
          <slot name="guestbook"></slot>
        </Teleport>

        <Teleport v-if="hasSlot('theme_toggle')" :disabled="disableTeleport" to='[data-slot="theme_toggle"]'>
          <button
            :aria-label="themeStore.theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
            :title="themeStore.theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
            class="theme-toggle-btn p-2 rounded-md border border-line bg-surface shadow-none transition-colors hover:bg-hover text-fg"
            @click="themeStore.toggleTheme"
          >
            <Sun v-if="themeStore.theme === 'dark'" class="w-4 h-4" />
            <Moon v-else class="w-4 h-4" />
          </button>
        </Teleport>
      </template>
    </template>
  </div>
</template>

<style>
/* 允许用户的 HTML 撑开容器 */
.custom-public-renderer {
  width: 100%;
  min-height: 100dvh;
}

.custom-html-container {
  min-height: inherit;
}

.custom-html-container,
.iframe-host {
  width: 100%;
}

.custom-page-iframe {
  display: block;
  border: 0;
}

.custom-page-iframe.iframe-immersive-default {
  height: 100dvh;
}

.iframe-shadow {
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.16);
}

/* 空插槽不占高度，避免禁用公告或留言板时留出空白间距 */
[data-slot]:empty {
  min-height: 0;
}
</style>
