import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchGithubLatestRelease } from '@/lib/api.js';
import { QUERY_KEYS, resolvePiniaQueryClient } from '@/lib/query-client.js';
import { t } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { readPreference, readRawPreference, writePreference, writeRawPreference } from '@/utils/local-preference.js';
import packageJson from '../../package.json';

const RELEASE_CACHE_KEY = 'misub_latest_release_cache';
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000;
const UPDATE_NOTICE_DISMISSED_KEY = 'misub_update_notice_dismissed_version';

export const useVersionStore = defineStore('version', () => {
  const currentVersion = ref(packageJson.version);
  const latestRelease = ref(
    /** @type {{ tag_name: string; html_url?: string; body?: string; name?: string; published_at?: string } | null} */ (
      null
    ),
  );
  const showModal = ref(false);
  const showUpdateNotice = ref(false);
  const upstreamRepo = 'wkwbk/MiSub';

  const localChangelog = `✨ **内置转换路由升级、防刷与短链接入及版本更新体验优化**
- **转换与路由设置升级**：拆分独立的「转换与路由」设置页，新增可视化规则集选择、自定义规则与基础配置覆盖；支持 ECH 解析并完善 Sing-Box / Clash / Surge 生成器协议兼容。
- **防刷保护与 Sink 短链**：新增服务端最小拉取间隔与边缘缓存防刷保护（支持温和缓存与严格 429 模式）；接入自建 Sink 短链服务，支持随机/自定义后缀与公开页只读展示。
- **版本更新与自动发版**：优化新版本提示（按版本持久化忽略、延迟检查、1 小时客户端缓存与页脚红点），修复本地版本高于上游时的误报；新增版本号同步与 Tag 自动发布 GitHub Release 流程。
- **架构与界面细节修复**：拆分 \`public_cores\` 与 \`public_links\` 独立存储键，统一明暗语义色板与表单样式，修复节点重命名地区重算、Surge 分组渲染及菜单动画等细节问题。`;

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

  const hasUpdate = computed(() => {
    if (!latestRelease.value?.tag_name) return false;
    return compareVersions(latestRelease.value.tag_name, currentVersion.value) > 0;
  });

  function getDismissKey(releaseTag) {
    return `misub_release_notes_hidden:${normalizeVersion(currentVersion.value)}:${normalizeVersion(releaseTag)}`;
  }

  function readCachedRelease(now) {
    const cached = readPreference(
      RELEASE_CACHE_KEY,
      (value) => {
        if (!value || typeof value !== 'object') return undefined;
        if (typeof value.checkedAt !== 'number' || !Number.isFinite(value.checkedAt)) return undefined;
        if (!value.release || typeof value.release !== 'object' || !value.release.tag_name) return undefined;
        return value;
      },
      null,
    );
    if (!cached) return null;
    if (now - cached.checkedAt >= RELEASE_CACHE_TTL_MS) return null;
    return cached.release;
  }

  function applyReleaseState(release, suppressModal) {
    if (!release?.tag_name) return;
    latestRelease.value = release;
    const comparison = compareVersions(release.tag_name, currentVersion.value);

    if (comparison > 0) {
      const dismissedVersion = readRawPreference(UPDATE_NOTICE_DISMISSED_KEY);
      if (dismissedVersion !== normalizeVersion(release.tag_name)) {
        showUpdateNotice.value = true;
      }
    } else if (comparison === 0 && !suppressModal) {
      const dismissKey = getDismissKey(release.tag_name);
      if (readRawPreference(dismissKey) !== 'true') {
        showModal.value = true;
      }
    }
  }

  async function checkVersion(suppressModal = false, options = {}) {
    const force = options?.force === true;
    try {
      const now = Date.now();
      if (!force) {
        const cachedRelease = readCachedRelease(now);
        if (cachedRelease) {
          applyReleaseState(cachedRelease, suppressModal);
          return;
        }
      }

      const queryClient = resolvePiniaQueryClient();
      if (force) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.githubRelease(upstreamRepo) });
      }
      const release = await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.githubRelease(upstreamRepo),
        staleTime: force ? 0 : RELEASE_CACHE_TTL_MS,
        queryFn: () => fetchGithubLatestRelease(upstreamRepo),
      });

      if (release?.tag_name) {
        writePreference(RELEASE_CACHE_KEY, {
          checkedAt: now,
          release,
        });
        applyReleaseState(release, suppressModal);
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

  function dismissUpdateNotice() {
    showUpdateNotice.value = false;
    if (latestRelease.value?.tag_name) {
      const persisted = writeRawPreference(UPDATE_NOTICE_DISMISSED_KEY, normalizeVersion(latestRelease.value.tag_name));
      if (!persisted) useToastStore().showToast(t('errors.preferenceNotSaved'), 'error');
    }
  }

  function suppressUpdateModal() {
    if (latestRelease.value?.tag_name) {
      const persisted = writeRawPreference(getDismissKey(latestRelease.value.tag_name), 'true');
      if (!persisted) useToastStore().showToast(t('errors.preferenceNotSaved'), 'error');
    }
    showModal.value = false;
  }

  return {
    currentVersion,
    latestRelease,
    localChangelog,
    hasUpdate,
    showModal,
    showUpdateNotice,
    compareVersions,
    checkVersion,
    openModal,
    closeModal,
    dismissUpdateNotice,
    suppressUpdateModal,
  };
});
