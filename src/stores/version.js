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

    // 本地更新日志 (v2.8.1)
    const localChangelog = `🔧 **工程化升级、依赖迁移与代码规范统一**
- **路径与工具链升级**：全仓前端/测试相对引用统一重构为 \`@/\` 别名并补充 \`jsconfig.json\`；包管理器迁移至 \`pnpm\`，升级 \`vite@8\`、\`vitest@5\`、\`vue-router@5\`、\`pinia@4\`、\`js-yaml@5\` 等核心依赖并完成适配。
- **图标库迁移与代码清理**：将图标库从已弃用的 \`lucide-vue-next\` 全面迁移至 \`@lucide/vue\`，清理全仓未使用的冗余导入并统一 Prettier 代码格式。
- **部署与测试稳定性修复**：精简 \`wrangler.toml\` 冗余配置并补全预览环境 KV/D1 绑定，修复部分历史回归测试断言，全量单元测试与生产构建均已通过。`;

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
