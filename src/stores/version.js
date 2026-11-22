import { defineStore } from 'pinia';
import { ref } from 'vue';
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

  // 本地更新日志 (v2.8.5)
  const localChangelog = `✨ **定时任务分业务重构、配置键标准化与恢复出厂设置修复**
- **定时任务按业务拆分**：将定时任务拆分为订阅更新（\`/cron/subscriptions\`）、WebDAV 备份（\`/cron/backup\`）与存储维护（\`/cron/maintenance\`）三个独立入口，同时支持 Cloudflare Worker 原生多 Cron 独立调度，无需依赖外部定时服务。
- **配置存储与命名标准化**：统一 D1 \`settings\` 表键名注册表（\`main\` / \`rule_templates\` / \`clients\`），将远程转换模板缓存归位至 \`cache\` 表，并全站统一设置字段为 \`camelCase\`，移除历史兼容包袱。
- **恢复出厂设置与交互修复**：修复连续二次确认弹窗自动取消的竞态缺陷；恢复出厂设置现在会完整清空全部设置键、节点缓存与本机界面偏好，并优化 WebDAV 自动备份相关提示文案。`;

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
    checkVersion,
    openModal,
    closeModal,
    suppressUpdateModal,
  };
});
