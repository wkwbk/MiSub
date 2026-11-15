import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fetchGithubLatestRelease } from '../lib/api.js';
import { t } from '../i18n/index.js';
import { useToastStore } from './toast.js';
import { readRawPreference, writeRawPreference } from '../utils/local-preference.js';
import packageJson from '../../package.json';

export const useVersionStore = defineStore('version', () => {
    // --- State ---
    const currentVersion = ref(packageJson.version);
    const latestRelease = ref(null);
    const showModal = ref(false);
    const showUpdateNotice = ref(false);
    const upstreamRepo = 'wkwbk/MiSub';

    // 本地更新日志 (v2.8.0)
    const localChangelog = `✨ **全新极简网格 UI 重构、分组交互升级与安全增强**
- **Exposed Hairline Grid 视觉重构**：统一深浅色主题配色与高对比度悬停反馈，引入 \`lucide-vue-next\` 图标库与自定义 \`Select\` 组件，优化顶部导航栏与双栏吸顶滚动体验。
- **订阅与分组体验升级**：支持机场订阅专用批量导入与单条选组、标签筛选分组、按分组单元无限加载，以及组内与组间两级拖拽排序。
- **订阅组与弹窗优化**：支持订阅组拖拽排序、加宽订阅组弹窗、对齐资源列表并补充订阅分组筛选，优化节点预览与批量去重交互。
- **认证与安全加固**：防止已初始化实例回退默认管理员密码，稳定 Cookie Secret 回退逻辑，优化登录页自动聚焦与重定向体验。`;

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
