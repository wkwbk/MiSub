<script setup>
    import { computed } from 'vue';
    import { Loader2 } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';
    import SettingsLayout from '../layout/SettingsLayout.vue';
    import SettingsSidebar from './SettingsSidebar.vue';
    import BasicSettings from './sections/BasicSettings.vue';
    import HomeSettings from './sections/HomeSettings.vue';
    import GlobalSettings from './sections/GlobalSettings.vue';
    import ServiceSettings from './sections/ServiceSettings.vue';
    import ClientSettings from './sections/ClientSettings.vue';
    import CustomPageSettings from './sections/CustomPageSettings.vue';
    import WebdavBackupSettings from './sections/WebdavBackupSettings.vue';
    import SystemSettings from './sections/SystemSettings.vue';

    /**
     * 设置界面的共享内容区。
     *
     * 此前 SettingsView.vue（独立页面）与 SettingsPanel.vue（弹窗）各自实现了一份，
     * 约 90% 逐行相同，导致「弹窗漏渲染 custom-page」「弹窗漏传 handleReset」两个缺陷
     * —— 改了一边忘了另一边。现在两者的 section 列表、头部信息卡、加载态与保存按钮
     * 都收敛到这里，各自只保留外壳差异。
     *
     * 注意：useSettingsLogic() 是工厂函数（每次调用创建独立的 ref 状态），
     * 所以数据一律由父组件通过 props 传入，本组件不再自行调用，避免出现两份状态。
     */
    const { t } = useI18n();

    const props = defineProps({
        activeTab: {
            type: String,
            required: true,
        },
        settings: {
            type: Object,
            required: true,
        },
        disguiseConfig: {
            type: Object,
            default: () => ({}),
        },
        isLoading: {
            type: Boolean,
            default: false,
        },
        isSaving: {
            type: Boolean,
            default: false,
        },
        restartCountdown: {
            type: Number,
            default: null,
        },
        hasWhitespace: {
            type: Boolean,
            default: false,
        },
        isStorageTypeValid: {
            type: Boolean,
            default: true,
        },
        /** 独立页面用 ?focus= 深链定位字段时高亮；弹窗不使用 */
        highlightedFocusId: {
            type: String,
            default: '',
        },
        /** 弹窗内空间有限、没有页面级标题，头部信息卡需要常显；独立页面在移动端隐藏它 */
        alwaysShowHeader: {
            type: Boolean,
            default: false,
        },
        layoutClass: {
            type: String,
            default: 'h-full',
        },
        exportBackup: {
            type: Function,
            default: null,
        },
        importBackup: {
            type: Function,
            default: null,
        },
        handleReset: {
            type: Function,
            default: null,
        },
    });

    const emit = defineEmits(['update:activeTab', 'save', 'migrate', 'reload-now']);

    const activeTabModel = computed({
        get: () => props.activeTab,
        set: (value) => emit('update:activeTab', value),
    });

    const currentTabLabel = computed(() => {
        switch (props.activeTab) {
            case 'basic':
                return t('settings.tabs.basic');
            case 'home':
                return t('settings.tabs.home');
            case 'global':
                return t('settings.tabs.global');
            case 'service':
                return t('settings.tabs.service');
            case 'client':
                return t('settings.tabs.client');
            case 'custom-page':
                return t('settings.tabs.customPage');
            case 'system':
                return t('settings.tabs.system');
            default:
                return t('settings.title');
        }
    });

    const saveDisabled = computed(
        () => props.isSaving || props.hasWhitespace || !props.isStorageTypeValid
    );
</script>

<template>
    <SettingsLayout :class="layoutClass">
        <template #sidebar>
            <SettingsSidebar v-model:activeTab="activeTabModel" />
        </template>

        <div v-if="isLoading" class="text-center p-12">
            <Loader2 class="animate-spin h-6 w-6 text-zinc-400 mx-auto mb-3" />
            <p class="text-xs text-zinc-500">{{ t('settings.loading') }}</p>
        </div>

        <div v-else class="space-y-6 max-w-5xl w-full mx-auto">
            <div
                class="flex-wrap items-baseline justify-between gap-2 pb-5 border-b border-zinc-800/80"
                :class="alwaysShowHeader ? 'flex' : 'hidden md:flex'"
            >
                <h2 class="text-base font-semibold text-zinc-100">
                    {{ currentTabLabel }}
                </h2>
                <p class="text-xs text-zinc-500">
                    {{ t('settings.saveHint') }}
                </p>
            </div>

            <div
                v-if="restartCountdown !== null"
                class="flex items-center justify-between gap-3 rounded-md bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
                role="status"
                aria-live="polite"
            >
                <span class="flex items-center gap-2 font-mono">
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    {{ t('settings.reloadCountdown', { seconds: restartCountdown }) }}
                </span>
                <button
                    type="button"
                    class="shrink-0 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    @click="$emit('reload-now')"
                >
                    {{ t('settings.reloadNow') }}
                </button>
            </div>

            <BasicSettings
                v-show="activeTab === 'basic'"
                :settings="settings"
                :disguiseConfig="disguiseConfig"
                :highlighted-focus-id="highlightedFocusId"
            />
            <HomeSettings v-show="activeTab === 'home'" :settings="settings" />
            <GlobalSettings v-show="activeTab === 'global'" :settings="settings" />
            <ServiceSettings v-show="activeTab === 'service'" :settings="settings" />
            <ClientSettings v-show="activeTab === 'client'" />
            <CustomPageSettings v-show="activeTab === 'custom-page'" :settings="settings" />
            <div v-show="activeTab === 'system'" class="space-y-6">
                <WebdavBackupSettings :settings="settings" />
                <SystemSettings
                    :settings="settings"
                    :exportBackup="exportBackup"
                    :importBackup="importBackup"
                    :handleReset="handleReset"
                    @migrate="emit('migrate')"
                />
            </div>
        </div>

        <template #footer>
            <button
                @click="emit('save')"
                :disabled="saveDisabled"
                class="px-5 py-2 rounded-md text-xs font-semibold shadow-none transition-colors flex items-center gap-2 border"
                :class="
                    isSaving
                        ? 'bg-zinc-800 border-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-100 border-zinc-100 text-zinc-900 hover:bg-white'
                "
            >
                <Loader2
                    v-if="isSaving"
                    class="animate-spin h-4 w-4 text-zinc-500"
                />
                <span>{{ isSaving ? t('settings.saving') : t('settings.saveChanges') }}</span>
            </button>
        </template>
    </SettingsLayout>
</template>
