import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchGithubLatestRelease } from '@/lib/api.js';
import { t } from '@/i18n/index.js';
import { useToastStore } from '@/stores/toast.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
import packageJson from '../../package.json';

export const useVersionStore = defineStore('version', () => {
    // --- State ---
    const currentVersion = ref(packageJson.version);
    const latestRelease = ref(null);
    const showModal = ref(false);
    const showUpdateNotice = ref(false);
    const upstreamRepo = 'wkwbk/MiSub';

    // 本地更新日志 (v2.8.2)
    const localChangelog = `🚀 **纯 D1 行级存储重构、多标签体系升级与设置页体验优化**
- **纯 D1 行级存储重构**：标准化为纯 D1 行级存储，拆分 \`nodes\`、\`guestbook\`、\`cache\`、\`access_logs\` 与 \`error_reports\` 独立数据表并采用纯 UUID，移除历史 KV 与迁移逻辑，优化索引与懒加载性能。
- **多标签管理与公开导航**：将原分组体系统一升级为多标签管理，覆盖机场订阅、手动节点与订阅组，新增公开链接导航、导入文本行号显示，并恢复节点 URL 中 \`@\` 前冒号编码。
- **设置页与 UI/移动端优化**：重构设置侧边栏导航、标签页持久化与规则模板弹窗，拆分转换引擎参数卡片，优化移动端底部导航布局、弹窗背景滚动锁定与路由加载指示。
- **GitHub 代理增强**：支持 \`GITHUB_TOKEN\` 配置，并在触发速率限制时自动重定向回退。`;

    // --- Getters ---
    const hasUpdate = computed(() => {
        if (!latestRelease.value?.tag_name) return false;
        return compareVersions(latestRelease.value.tag_name, currentVersion.value) > 0;
    });

    const isUpToDate = computed(() => {
        if (!latestRelease.value?.tag_name) return true;
        return compareVersions(latestRelease.value.tag_name, currentVersion.value) === 0;
    });

    // --- Helpers ---
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

    // --- Actions ---
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
            const persisted = writeRawPreference(
                getDismissKey(latestRelease.value.tag_name),
                'true'
            );
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
