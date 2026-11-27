import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchGithubLatestRelease } from '@/lib/api.js';
import { QUERY_KEYS, resolvePiniaQueryClient } from '@/lib/query-client.js';
import { t } from '@/i18n/index.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { readPreference, readRawPreference, writePreference, writeRawPreference } from '@/utils/local-preference.js';
import packageJson from '../../package.json';

export interface GithubReleaseInfo {
  tag_name: string;
  html_url?: string;
  body?: string;
  name?: string;
  published_at?: string;
  [key: string]: unknown;
}

interface CachedReleaseEntry {
  checkedAt: number;
  release: GithubReleaseInfo;
}

const RELEASE_CACHE_KEY = 'misub_latest_release_cache';
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000;
const UPDATE_NOTICE_DISMISSED_KEY = 'misub_update_notice_dismissed_version';

export const useVersionStore = defineStore('version', () => {
  const currentVersion = ref(packageJson.version);
  const latestRelease = ref<GithubReleaseInfo | null>(null);
  const showModal = ref(false);
  const showUpdateNotice = ref(false);
  const upstreamRepo = 'wkwbk/MiSub';

  // 当前版本本地更新日志 (v2.9.1)
  const localChangelog = `🚀 **订阅防爬虫拦截、浏览器门户与 Mihomo 多端口 SOCKS5、细粒度持久化升级**
- **IM 与链接预览爬虫拦截防护**：新增 \`blockCrawlerSubAccess\`（默认开启），自动拦截微信、QQ、企业微信、钉钉、飞书、Telegram、WhatsApp、Discord 等聊天软件内置浏览与链接预览爬虫，静默返回伪装页且不触发日志/Telegram 通知；主流代理客户端白名单无条件放行。
- **订阅浏览器门户与 Mihomo 多端口 SOCKS5**：新增独立订阅详情门户页、自定义门户设计器与 Mihomo 多端口 SOCKS5 listeners 生成及端口映射表导出。
- **D1 细粒度持久化与并发加固**：迁移至细粒度资源 CRUD 与行级 \`config_version\` 乐观并发控制（OCC），改用 \`schema_versions\` 表追踪 D1 迁移并解耦维护任务。
- **体验与界面优化**：自定义公开页实时预览工作台、单节点二维码展示、设置页资源卡片默认折叠懒加载，以及删除二次确认、按钮高度与移动端标签换行等多项 UI 一致性修复。`;

  function normalizeVersion(version: string | number | null | undefined): string {
    return String(version || '')
      .trim()
      .replace(/^v/i, '');
  }

  function compareVersions(left: string | number | null | undefined, right: string | number | null | undefined): number {
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

  function getDismissKey(releaseTag: string): string {
    return `misub_release_notes_hidden:${normalizeVersion(currentVersion.value)}:${normalizeVersion(releaseTag)}`;
  }

  function readCachedRelease(now: number): GithubReleaseInfo | null {
    const cached = readPreference(
      RELEASE_CACHE_KEY,
      (value: unknown): CachedReleaseEntry | undefined => {
        if (!value || typeof value !== 'object') return undefined;
        const candidate = value as { checkedAt?: unknown; release?: unknown };
        if (typeof candidate.checkedAt !== 'number' || !Number.isFinite(candidate.checkedAt)) return undefined;
        if (!candidate.release || typeof candidate.release !== 'object') return undefined;
        const release = candidate.release as { tag_name?: unknown };
        if (typeof release.tag_name !== 'string' || !release.tag_name) return undefined;
        return {
          checkedAt: candidate.checkedAt,
          release: candidate.release as GithubReleaseInfo,
        };
      },
      null,
    ) as CachedReleaseEntry | null;
    if (!cached) return null;
    if (now - cached.checkedAt >= RELEASE_CACHE_TTL_MS) return null;
    return cached.release;
  }

  function applyReleaseState(release: GithubReleaseInfo | null | undefined, suppressModal: boolean): void {
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

  async function checkVersion(suppressModal = false, options: { force?: boolean } = {}): Promise<void> {
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
      const release = (await queryClient.fetchQuery({
        queryKey: QUERY_KEYS.githubRelease(upstreamRepo),
        staleTime: force ? 0 : RELEASE_CACHE_TTL_MS,
        queryFn: () => fetchGithubLatestRelease(upstreamRepo),
      })) as GithubReleaseInfo | null | undefined;

      if (release?.tag_name) {
        writePreference(RELEASE_CACHE_KEY, {
          checkedAt: now,
          release,
        });
        applyReleaseState(release, suppressModal);
      }
    } catch (error: unknown) {
      console.error('[VersionStore] Failed to check version:', error);
    }
  }

  function openModal(): void {
    showModal.value = true;
  }

  function closeModal(): void {
    showModal.value = false;
  }

  function dismissUpdateNotice(): void {
    showUpdateNotice.value = false;
    if (latestRelease.value?.tag_name) {
      const persisted = writeRawPreference(UPDATE_NOTICE_DISMISSED_KEY, normalizeVersion(latestRelease.value.tag_name));
      if (!persisted) useToastStore().showToast(t('errors.preferenceNotSaved'), 'error');
    }
  }

  function suppressUpdateModal(): void {
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
