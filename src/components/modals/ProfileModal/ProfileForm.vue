<script setup>
    import { computed, ref, watch } from 'vue';
    import { ChevronDown } from 'lucide-vue-next';
    import TransformSelector from '../../forms/TransformSelector.vue';
    import Input from '../../ui/Input.vue';
    import Select from '../../ui/Select.vue';
    import Switch from '../../ui/Switch.vue';
    import OperatorChain from '../../features/Operators/OperatorChain.vue';
    import { getLocalizedTransformAssetByUrl } from '@/constants/transform-assets';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        localProfile: {
            type: Object,
            required: true,
        },
        showAdvanced: {
            type: Boolean,
            default: false,
        },
        uiText: {
            type: Object,
            required: true,
        },
        prefixToggleOptions: {
            type: Array,
            default: () => [],
        },
        groupPrefixToggleOptions: {
            type: Array,
            default: () => [],
        },
        globalSettings: {
            type: Object,
            default: () => ({}),
        },
    });

    const globalEngineLabel = computed(() => {
        const mode = props.globalSettings?.subconverter?.engineMode || 'builtin';
        return mode === 'external'
            ? t('profileModal.externalBackend')
            : t('profileModal.builtinEngine');
    });

    const globalConfigLabel = computed(() => {
        const mode = props.globalSettings?.transformConfigMode || 'builtin';
        if (mode === 'builtin') return t('profileModal.builtinAutoRoute');
        const url = props.globalSettings?.transformConfig || '';
        const asset = getLocalizedTransformAssetByUrl(url, t);
        return asset ? asset.name : url ? t('profileModal.customUrl') : t('profileModal.notSet');
    });

    const transformModeOptions = [
        { value: 'global', label: t('profileModal.followGlobalSettings') },
        { value: 'preset', label: t('profileModal.selectPreset') },
        { value: 'custom', label: t('profileModal.customTemplateUrl') },
        { value: 'custom_template', label: t('profileModal.customTemplate') },
    ];

    const engineOptions = [
        { value: 'builtin', label: t('profileModal.builtinScriptEngine') },
        { value: 'external', label: t('profileModal.externalBackendConvert') },
    ];

    const flagOptions = [
        { key: 'udp', label: t('profileModal.udpForward'), icon: '⚡️' },
        { key: 'emoji', label: t('profileModal.emojiSwitch'), icon: '🎨' },
        { key: 'scv', label: t('profileModal.skipCert'), icon: '🛡️' },
        { key: 'sort', label: t('profileModal.nodeSort'), icon: '🔢' },
        { key: 'tfo', label: 'TCP Fast Open', icon: '🚀' },
        { key: 'list', label: t('profileModal.outputList'), icon: '📋' },
    ];

    const selectedTransformAsset = ref(null);
    const emit = defineEmits(['toggle-advanced']);

    const isExternalEngine = computed(() => {
        const localMode = props.localProfile?.subconverter?.engineMode || '';
        if (localMode === 'external') return true;
        if (localMode === 'builtin') return false;
        return (props.globalSettings?.subconverter?.engineMode || 'builtin') === 'external';
    });

    const enforceExternalSchemeConstraints = () => {
        const enabled = isExternalEngine.value;
        if (!enabled) return;

        if (
            props.localProfile.transformConfigMode === 'builtin' ||
            props.localProfile.transformConfigMode === 'custom_template'
        ) {
            props.localProfile.transformConfigMode = 'preset';
        }

        if (/^(builtin|custom):/.test(String(props.localProfile.transformConfig || ''))) {
            props.localProfile.transformConfig = '';
            selectedTransformAsset.value = null;
        }
    };

    watch(
        () => [
            isExternalEngine.value,
            props.localProfile,
            props.localProfile?.transformConfigMode,
            props.localProfile?.transformConfig,
            props.localProfile?.subconverter?.engineMode,
        ],
        enforceExternalSchemeConstraints,
        { immediate: true }
    );
</script>

<template>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
            <Input
                id="profile-name"
                v-model="localProfile.name"
                :label="t('profiles.nameLabel')"
                :placeholder="t('profiles.namePlaceholder')"
            />
        </div>
        <div>
            <Input
                id="profile-custom-id"
                v-model="localProfile.customId"
                :label="t('profiles.customIdLabel')"
                :placeholder="t('profiles.customIdPlaceholder')"
            />
            <p class="text-xs text-zinc-500 mt-1">
                {{ t('profiles.customIdHint') }}
            </p>
        </div>
    </div>

    <!-- Public Display & Description -->
    <div class="bg-transparent rounded-md p-4 border border-zinc-800 mt-4">
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center">
                <input
                    type="checkbox"
                    id="profile-is-public"
                    v-model="localProfile.isPublic"
                    class="h-4 w-4 rounded-sm border-zinc-700 bg-[#131515] text-zinc-100 focus:ring-0"
                />
                <label for="profile-is-public" class="ml-2 block text-xs font-medium text-zinc-200">
                    {{ t('profiles.publicDisplay') }}
                </label>
            </div>
            <span
                class="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 border border-zinc-800 bg-transparent px-2 py-0.5 rounded-md"
                v-if="localProfile.isPublic"
            >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>{{ t('profiles.publicVisible') }}</span>
            </span>
        </div>

        <div v-if="localProfile.isPublic" class="animate-fade-in-down">
            <textarea
                id="profile-description"
                v-model="localProfile.description"
                rows="2"
                :placeholder="t('profiles.descriptionPlaceholder')"
                class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus:border-zinc-600 text-xs text-zinc-100 placeholder-zinc-600"
            ></textarea>
        </div>
        <div v-else class="text-xs text-zinc-500">
            {{ t('profiles.publicDisplayHint') }}
        </div>
    </div>

    <!-- Advanced Settings Toggle -->
    <div class="border-t border-zinc-800 pt-4 mt-6">
        <button
            type="button"
            @click="emit('toggle-advanced')"
            class="flex items-center text-xs font-semibold text-zinc-200 hover:text-white focus-visible:outline-hidden"
        >
            <span>{{ t('profiles.advancedTitle') }}</span>
            <ChevronDown
                :class="{ 'rotate-180': showAdvanced }"
                class="w-4 h-4 ml-1 transition-transform"
            />
        </button>

        <div v-show="showAdvanced" class="mt-4 space-y-6 animate-fade-in-down">
            <!-- === 区块 A：渲染核心配置 (Core Logic) === -->
            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                        {{ t('profileModal.coreConfig') }}
                    </h3>
                    <span class="text-[11px] text-zinc-500">{{
                        t('profileModal.coreConfigDesc')
                    }}</span>
                </div>

                <div
                    class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-transparent p-4 border border-zinc-800 rounded-md shadow-none"
                >
                    <!-- 引擎选择 -->
                    <div class="space-y-1.5">
                        <label class="block text-xs font-medium text-zinc-400">{{
                            t('profileModal.engineLabel')
                        }}</label>
                        <Select
                            v-model="localProfile.subconverter.engineMode"
                            size="sm"
                            :options="[
                                { value: '', label: t('profileModal.followGlobalConfig') },
                                ...engineOptions,
                            ]"
                        />
                        <div
                            v-if="localProfile.subconverter.engineMode === ''"
                            class="flex items-center gap-1.5 mt-1.5"
                        >
                            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            <span
                                class="font-mono text-[10px] text-zinc-400 uppercase tracking-tight"
                            >
                                {{ t('profileModal.currentGlobal', { value: globalEngineLabel }) }}
                            </span>
                        </div>
                    </div>

                    <!-- 方案选择 -->
                    <div class="space-y-1.5">
                        <label class="block text-xs font-medium text-zinc-400">{{
                            t('profileModal.schemeLabel')
                        }}</label>
                        <Select
                            v-model="localProfile.transformConfigMode"
                            size="sm"
                            :options="[
                                { value: 'global', label: t('profileModal.followGlobalScheme') },
                                {
                                    value: 'builtin',
                                    label: t('profileModal.builtinAutoRoute'),
                                    disabled: isExternalEngine,
                                },
                                ...transformModeOptions.slice(1).map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                    disabled:
                                        option.value === 'custom_template' && isExternalEngine,
                                })),
                            ]"
                        />
                        <p
                            v-if="isExternalEngine"
                            class="mt-1 text-[10px] leading-relaxed text-zinc-400"
                        >
                            {{ t('profileModal.externalEngineHint') }}
                        </p>
                        <div
                            v-if="localProfile.transformConfigMode === 'global'"
                            class="flex items-center gap-1.5 mt-1.5"
                        >
                            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            <span
                                class="font-mono text-[10px] text-zinc-400 uppercase tracking-tight"
                            >
                                {{ t('profileModal.currentGlobal', { value: globalConfigLabel }) }}
                            </span>
                        </div>
                    </div>

                    <!-- 引擎为第三方时的 URL 输入 -->
                    <div
                        v-if="isExternalEngine"
                        class="sm:col-span-2 animate-fade-in-down border-t border-zinc-800 pt-3"
                    >
                        <label class="block text-xs font-medium text-zinc-400 mb-1.5">{{
                            t('profileModal.backendOverride')
                        }}</label>
                        <input
                            type="text"
                            v-model="localProfile.subconverter.backend"
                            :placeholder="t('profileModal.backendPlaceholder')"
                            class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus-visible:outline-hidden"
                        />
                        <p class="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                            {{ t('profileModal.backendHint') }}
                        </p>
                        <div
                            v-if="!localProfile.subconverter.backend"
                            class="flex items-center gap-1.5 mt-1.5"
                        >
                            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            <span
                                class="font-mono text-[10px] text-zinc-400 uppercase tracking-tight"
                            >
                                {{
                                    t('profileModal.currentGlobal', {
                                        value:
                                            globalSettings?.subconverter?.defaultBackend ||
                                            t('profileModal.notSet'),
                                    })
                                }}
                            </span>
                        </div>
                    </div>

                    <!-- 规则配置选择器 -->
                    <div
                        v-if="
                            localProfile.transformConfigMode !== 'global' &&
                            localProfile.transformConfigMode !== 'builtin'
                        "
                        class="sm:col-span-2 animate-fade-in-down border-t border-zinc-800 pt-3"
                    >
                        <label class="block text-xs font-medium text-zinc-400 mb-1.5">{{
                            t('profileModal.templateLabel')
                        }}</label>
                        <TransformSelector
                            v-model="localProfile.transformConfig"
                            @select-asset="selectedTransformAsset = $event"
                            type="config"
                            :placeholder="t('profileModal.presetPlaceholder')"
                            :custom-placeholder="t('profileModal.remoteTemplatePlaceholder')"
                            :force-custom="localProfile.transformConfigMode === 'custom'"
                            :custom-templates-only="
                                localProfile.transformConfigMode === 'custom_template'
                            "
                            :allowEmpty="false"
                            :exclude-builtin-assets="isExternalEngine"
                        />
                        <div
                            v-if="localProfile.transformConfigMode === 'custom_template'"
                            class="mt-2 flex items-center gap-2 rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-[11px] leading-relaxed text-zinc-400"
                        >
                            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
                            <span>{{ t('profileModal.customTemplateHint') }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- === 区块 B：参数微调与后处理 (Parameter Tuning) === -->
            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                        {{ t('profileModal.tuningTitle') }}
                    </h3>
                    <span class="text-[11px] text-zinc-500">{{
                        t('profileModal.tuningDesc')
                    }}</span>
                </div>

                <div
                    class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-transparent p-4 border border-zinc-800 rounded-md shadow-none"
                >
                    <!-- 到期时间 -->
                    <div>
                        <label class="block text-xs font-medium text-zinc-400 mb-1.5">{{
                            t('profileModal.expiresLabel')
                        }}</label>
                        <input
                            type="date"
                            v-model="localProfile.expiresAt"
                            class="block w-full px-3 py-2 bg-[#131515] border border-zinc-800 rounded-md font-mono text-xs text-zinc-100 focus:border-zinc-600 focus-visible:outline-hidden"
                        />
                    </div>

                    <!-- 内置规则等级 (当切换到内置引擎，或切换到第三方引擎但使用内置分流方案时显示) -->
                    <div v-if="!isExternalEngine">
                        <label class="block text-xs font-medium text-zinc-400 mb-1.5">{{
                            t('profileModal.ruleLevelLabel')
                        }}</label>
                        <Select
                            v-model="localProfile.ruleLevel"
                            size="sm"
                            :disabled="
                                localProfile.transformConfigMode !== 'builtin' &&
                                localProfile.transformConfigMode !== 'global'
                            "
                            :options="[
                                { value: '', label: t('profileModal.followGlobalLevel') },
                                { value: 'base', label: t('profileModal.ruleBase') },
                                { value: 'std', label: t('profileModal.ruleStandard') },
                                { value: 'full', label: t('profileModal.ruleFull') },
                                { value: 'relay', label: t('profileModal.ruleRelay') },
                            ]"
                        />
                    </div>

                    <!-- 节点前缀设置 (合并) -->
                    <div class="sm:col-span-2 space-y-3 pt-3 border-t border-zinc-800">
                        <label
                            class="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider"
                            >{{ t('profileModal.nodeNameVisibility') }}</label
                        >
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- 手动节点文本前缀 -->
                            <Input
                                v-model="localProfile.prefixSettings.manualNodePrefix"
                                :label="t('profileModal.manualPrefixText')"
                                :placeholder="t('profileModal.followGlobalEmpty')"
                                size="sm"
                            />

                            <!-- {{ t('profileModal.manualNodeDisplay') }}开关 -->
                            <div class="space-y-1">
                                <label class="block text-xs font-medium text-zinc-400">{{
                                    t('profileModal.manualNodeDisplay')
                                }}</label>
                                <Select
                                    v-model="localProfile.prefixSettings.enableManualNodes"
                                    size="sm"
                                    :options="prefixToggleOptions"
                                />
                            </div>

                            <!-- 机场订阅展示开关 (自动机场名) -->
                            <div class="space-y-1">
                                <label class="block text-xs font-medium text-zinc-400">{{
                                    t('profileModal.subscriptionPrefix')
                                }}</label>
                                <Select
                                    v-model="localProfile.prefixSettings.enableSubscriptions"
                                    size="sm"
                                    :options="prefixToggleOptions"
                                />
                            </div>

                            <!-- 组名前缀开关 -->
                            <div class="space-y-1">
                                <label class="block text-xs font-medium text-zinc-400">{{
                                    t('profileModal.groupPrefix')
                                }}</label>
                                <Select
                                    v-model="localProfile.prefixSettings.prependGroupName"
                                    size="sm"
                                    :options="groupPrefixToggleOptions"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- 第三方开关 (仅第三方引擎显示) -->
                    <div v-if="isExternalEngine" class="sm:col-span-2 animate-fade-in-down mt-2">
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div
                                v-for="flag in flagOptions"
                                :key="flag.key"
                                class="flex flex-col gap-1.5 p-2 bg-transparent rounded-md border border-zinc-800"
                            >
                                <div class="flex items-center gap-1.5">
                                    <span
                                        class="text-[10px] font-semibold text-zinc-400 uppercase"
                                        >{{ flag.label }}</span
                                    >
                                </div>
                                <Select
                                    v-model="localProfile.subconverter.options[flag.key]"
                                    size="xs"
                                    :options="[
                                        { value: null, label: t('profileModal.followGlobal') },
                                        { value: true, label: t('profileModal.on') },
                                        { value: false, label: t('profileModal.off') },
                                    ]"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- === 区块 C：处理管道 (Process Workflow) === -->
            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                        {{ t('profileModal.pipelineTitle') }}
                    </h3>
                    <span class="text-[11px] text-zinc-500">{{
                        t('profileModal.pipelineDesc')
                    }}</span>
                </div>

                <OperatorChain v-model="localProfile.operators" />
            </div>
        </div>
    </div>
</template>
