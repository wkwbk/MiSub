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

    // 本地更新日志 (v2.8.3)
    const localChangelog = `✨ **节点详情与内核导航、正则置顶排序及中性色设计体系重构**
- **节点详情与公开页增强**：新增节点详情弹窗与客户端协议兼容性徽章；公开页新增代理内核分区与后台管理设置，客户端卡片支持展示版本发布日期。
- **排序与订阅生成修复**：新增正则置顶优先排序并优化排序项顺序；修复 \`addFlagEmoji\` 未透传至内置生成器导致的国旗前缀开关失效问题。
- **纯中性色 UI 重构与细节打磨**：全站迁移至纯中性语义化设计 Token，统一边框、阴影、聚焦态与滚动条样式，清理 \`main.css\` 冗余规则，修复多行输入框圆角滚动条裁切并统一中文路由规则术语。`;

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
