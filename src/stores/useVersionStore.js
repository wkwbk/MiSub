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

  // 当前版本本地更新日志 (v2.8.7)
  const localChangelog = `🚀 **核心架构升级、订阅协议扩展、安全加固与代码瘦身**
- **核心架构与性能**：升级 \`@misub/core\` 工作区架构、Hono 路由与多级缓存，新增乐观并发保存锁（\`baseRevision\`）、增量缓存失效与虚拟化节点预览。
- **订阅协议与规则**：新增原生 Shadowrocket \`.conf\` 生成器与 \`v2rayn://\` 协议转换，支持域名嗅探、安全 DoH 与国内直连分流；支持按订阅暂停自动更新、订阅组 \`linkId\` 解耦与 Token 自动轮换。
- **安全加固与公开页**：接入 Cloudflare Turnstile 登录与留言板人机验证，强化鉴权速率限制、敏感凭据脱敏与 SSRF/ReDoS 防护；新增自定义公开页预设模板。
- **全仓瘦身与类型统一**：清理孤立死代码与冗余导出，抽取 \`client-shared\` 合并多客户端生成器与渲染器重复逻辑，统一 Zod 到 JSDoc 类型推导并收敛设置页公共组件。`;

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
