import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchGithubLatestRelease } from '@/lib/api.js';
import { t } from '@/i18n/index.js';
import { useToastStore } from '@/stores/toast.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import packageJson from '../../package.json';

export const useVersionStore = defineStore('version', () => {
  const currentVersion = ref(packageJson.version);
  const latestRelease = ref(null);
  const showModal = ref(false);
  const showUpdateNotice = ref(false);
  const upstreamRepo = 'wkwbk/MiSub';

  // 本地更新日志 (v2.8.4)
  const localChangelog = `✨ **全站代码质量优化、目录架构重组与 UI/性能改进**
- **UI 与交互优化**：优化仪表盘布局与移动端视图，统一手动节点卡片视图及节点/订阅/订阅组的分页控件；修复导航与按钮连点问题并预取懒加载弹窗，优化公开页图片与静态资源加载。
- **兼容性清理与工具统一**：移除过时的 \`document.execCommand('copy')\` 与 \`escape/unescape\` Base64 兼容代码，统一为现代 Clipboard API 与 \`TextEncoder/TextDecoder\` UTF-8 Base64 工具；清理全局与组件死 CSS 及孤立模块。
- **架构与代码规范升级**：重组前后端模块目录（收拢 \`external-api/\`、\`handlers/\`、\`subscription/generators/\`，拍平前端组件目录并统一 \`kebab-case\` 命名），引入 \`oxlint\` 并将全仓库静态检查警告清零。`;

  const hasUpdate = computed(() => {
    if (!latestRelease.value?.tag_name) return false;
    return compareVersions(latestRelease.value.tag_name, currentVersion.value) > 0;
  });

  const isUpToDate = computed(() => {
    if (!latestRelease.value?.tag_name) return true;
    return compareVersions(latestRelease.value.tag_name, currentVersion.value) === 0;
  });

  function normalizeVersion(version) {
    return String(version || '')
      .trim()
      .replace(/^v/i, '');
  }

  function compareVersions(left, right) {
    const a = normalizeVersion(left)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
    const b = normalizeVersion(right)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i += 1) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function getDismissKey(releaseTag) {
    return `misub_release_notes_hidden:${normalizeVersion(currentVersion.value)}:${normalizeVersion(releaseTag)}`;
  }

  async function checkVersion(suppressModal = false) {
    try {
      const release = await fetchGithubLatestRelease(upstreamRepo);
      if (release?.tag_name) {
        latestRelease.value = release;
        const comparison = compareVersions(release.tag_name, currentVersion.value);

        if (comparison > 0) {
          showUpdateNotice.value = true;
        } else if (comparison === 0 && !suppressModal) {
          // 如果已是最新且未被禁止，则尝试显示更新日志
          const dismissKey = getDismissKey(release.tag_name);
          if (readRawPreference(dismissKey) !== 'true') {
            showModal.value = true;
          }
        }
      }
    } catch (error) {
      console.error('[VersionStore] Failed to check version:', error);
    }
  }

  function openModal() {
    showModal.value = true;
  }

  function closeModal() {
    showModal.value = false;
  }

  function suppressUpdateModal() {
    if (latestRelease.value?.tag_name) {
      // 写失败时必须告知用户：否则下次启动更新提示又会冒出来。
      const persisted = writeRawPreference(getDismissKey(latestRelease.value.tag_name), 'true');
      if (!persisted) useToastStore().showToast(t('errors.preferenceNotSaved'), 'error');
    }
    showModal.value = false;
  }

  return {
    currentVersion,
    latestRelease,
    localChangelog,
    showModal,
    showUpdateNotice,
    hasUpdate,
    isUpToDate,
    checkVersion,
    openModal,
    closeModal,
    suppressUpdateModal,
  };
});
