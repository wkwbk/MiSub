<script setup>
    import { computed, ref, watch } from 'vue';
    import { ChevronDown, FileText, Link2 } from 'lucide-vue-next';
    import TransformSelector from '@/components/forms/TransformSelector.vue';
    import Switch from '@/components/ui/Switch.vue';
    import SectionHeader from '../../SectionHeader.vue';
    import RuleTemplateManager from './RuleTemplateManager.vue';
    import {
        DEFAULT_SUBCONVERTER_BACKEND,
        SUBCONVERTER_BACKENDS,
    } from '@/constants/subconverter-backends.js';
    import { testSubconverterBackend } from '@/lib/api.js';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const modeOptions = computed(() => [
        { value: 'builtin', label: t('settings.transformBuiltinAuto') },
        { value: 'preset', label: t('settings.transformPreset') },
        { value: 'custom', label: t('settings.transformCustomUrl') },
        { value: 'custom_template', label: t('settings.transformCustomTemplate') },
    ]);

    const selectedAsset = ref(null);

    const flagOptions = computed(() => [
        { key: 'udp', label: t('settings.transformUdp'), icon: '⚡️' },
        { key: 'emoji', label: t('settings.transformEmoji'), icon: '🎨' },
        { key: 'scv', label: t('settings.transformSkipCert'), icon: '🛡️' },
        { key: 'sort', label: t('settings.transformSort'), icon: '🔢' },
        { key: 'tfo', label: 'TCP Fast Open', icon: '🚀' },
        { key: 'list', label: t('settings.transformList'), icon: '📋' },
    ]);

    if (!props.settings.subconverter) {
        props.settings.subconverter = {
            defaultBackend: DEFAULT_SUBCONVERTER_BACKEND,
            defaultOptions: {
                udp: true,
                emoji: true,
                scv: true,
                tfo: false,
                sort: false,
                list: false,
            },
        };
    } else if (!props.settings.subconverter.defaultOptions) {
        props.settings.subconverter.defaultOptions = {
            udp: true,
            emoji: true,
            scv: true,
            tfo: false,
            sort: false,
            list: false,
        };
    }

    const isBuiltinMode = computed(() => props.settings.transformConfigMode === 'builtin');

    const modeHint = computed(() => {
        if (isBuiltinMode.value) {
            return t('settings.transformBuiltinHint');
        }
        if (props.settings.transformConfigMode === 'preset') {
            return t('settings.transformPresetHint');
        }
        if (props.settings.transformConfigMode === 'custom_template') {
            return t('settings.transformCustomTemplateHint');
        }
        return t('settings.transformCustomHint');
    });

    const isBuiltinEngine = computed(
        () =>
            props.settings.subconverter.engineMode === 'builtin' ||
            props.settings.subconverter.engineMode === ''
    );
    const isExternalEngine = computed(() => props.settings.subconverter.engineMode === 'external');
    const backendTestStatus = ref(null);
    const isTestingBackend = ref(false);
    const previousEngineSettings = ref(null);
    const restoreEngineSnapshot = ref(null);
    const showEngineChangeWarning = ref(false);
    const engineChangeNoticeDismissed = ref(false);
    const backendTestToneClass = computed(() => {
        if (!backendTestStatus.value) return 'border-zinc-800 bg-transparent text-zinc-400';
        return backendTestStatus.value.success
            ? 'border-zinc-800 bg-transparent text-emerald-400'
            : 'border-zinc-800 bg-transparent text-red-400';
    });

    async function handleTestBackend() {
        if (isTestingBackend.value) return;
        isTestingBackend.value = true;
        backendTestStatus.value = null;
        const backend = props.settings.subconverter.defaultBackend;
        try {
            const result = await testSubconverterBackend(backend, 'clash');
            if (props.settings.subconverter.defaultBackend !== backend) return;
            backendTestStatus.value = {
                success: Boolean(result?.success || result?.available),
                message:
                    result?.message || result?.error || t('settings.transformBackendTestFailed'),
                endpoint: result?.endpoint || '',
                elapsedMs: result?.elapsedMs,
            };
        } catch (error) {
            if (props.settings.subconverter.defaultBackend === backend) {
                backendTestStatus.value = {
                    success: false,
                    message: error?.message || t('settings.transformBackendTestFailed'),
                    endpoint: '',
                };
            }
        } finally {
            isTestingBackend.value = false;
        }
    }

    function switchToBuiltinEngine() {
        props.settings.subconverter.engineMode = 'builtin';
        if (!restoreEngineSnapshot.value) return;
        Object.assign(props.settings, restoreEngineSnapshot.value);
        props.settings.subconverter.engineMode = 'builtin';
        selectedAsset.value = null;
        showEngineChangeWarning.value = false;
        previousEngineSettings.value = null;
        restoreEngineSnapshot.value = null;
    }

    function restorePreviousEngineSettings() {
        switchToBuiltinEngine();
    }

    watch(
        () => props.settings.subconverter.defaultBackend,
        () => {
            backendTestStatus.value = null;
        }
    );

    watch(
        isExternalEngine,
        (enabled, wasEnabled) => {
            if (enabled === wasEnabled) return;
            if (enabled) {
                previousEngineSettings.value = {
                    builtinSkipCertVerify: props.settings.builtinSkipCertVerify,
                    builtinEnableUdp: props.settings.builtinEnableUdp,
                    transformConfigMode: props.settings.transformConfigMode,
                    transformConfig: props.settings.transformConfig,
                };
                restoreEngineSnapshot.value = {
                    builtinSkipCertVerify: props.settings.builtinSkipCertVerify,
                    builtinEnableUdp: props.settings.builtinEnableUdp,
                    transformConfigMode: props.settings.transformConfigMode,
                    transformConfig: props.settings.transformConfig,
                };
                props.settings.builtinSkipCertVerify = false;
                props.settings.builtinEnableUdp = false;
                if (
                    props.settings.transformConfigMode === 'builtin' ||
                    props.settings.transformConfigMode === 'custom_template'
                ) {
                    props.settings.transformConfigMode = 'preset';
                }
                if (/^(builtin|custom):/.test(String(props.settings.transformConfig || ''))) {
                    props.settings.transformConfig = '';
                    selectedAsset.value = null;
                }
                showEngineChangeWarning.value = !engineChangeNoticeDismissed.value;
            }
        },
        { immediate: true }
    );
</script>

<template>
    <div class="space-y-6">
        <div
            class="flex flex-col items-center justify-between gap-4 rounded-md border border-zinc-800 bg-[#171717] p-5 shadow-none sm:flex-row"
        >
            <div class="flex items-center gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <Link2 class="h-4 w-4" />
                </div>
                <div>
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.transformEngineTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.transformEngineDesc') }}
                    </p>
                </div>
            </div>

            <div class="flex rounded-md border border-zinc-800 bg-[#131515] p-0.5">
                <button
                    @click="switchToBuiltinEngine"
                    :class="
                        isBuiltinEngine
                            ? 'bg-zinc-100 text-zinc-900 shadow-none'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                    "
                    class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors"
                >
                    {{ t('settings.transformBuiltinEngine') }}
                </button>
                <button
                    @click="settings.subconverter.engineMode = 'external'"
                    :class="
                        isExternalEngine
                            ? 'bg-zinc-100 text-zinc-900 shadow-none'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                    "
                    class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors"
                >
                    {{ t('settings.transformExternalEngine') }}
                </button>
            </div>
        </div>

        <div
            v-if="showEngineChangeWarning"
            data-testid="engine-change-notice"
            class="flex flex-col gap-3 rounded-md border border-zinc-800 bg-[#171717] p-3 text-xs text-zinc-200 sm:flex-row sm:items-center sm:justify-between"
        >
            <div class="flex min-w-0 flex-1 items-start gap-2.5">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
                <div class="flex flex-col gap-1">
                    <p class="font-medium">{{ t('settings.transformEngineChangeNotice') }}</p>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.transformExternalWarning') }}
                    </p>
                </div>
            </div>
            <button
                type="button"
                data-testid="dismiss-engine-change-notice"
                class="shrink-0 self-start rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                :aria-label="t('actions.dismiss')"
                @click="
                    engineChangeNoticeDismissed = true;
                    showEngineChangeWarning = false;
                "
            >
                ×
            </button>
            <button
                type="button"
                class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
                @click="
                    restorePreviousEngineSettings();
                    engineChangeNoticeDismissed = true;
                "
            >
                {{ t('settings.transformRestoreEngineSettings') }}
            </button>
        </div>

        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <SectionHeader
                :title="t('settings.transformRulesTitle')"
                :description="t('settings.transformRulesDesc')"
                tone="purple"
            >
                <template #icon>
                    <FileText class="h-4 w-4" />
                </template>
            </SectionHeader>

            <div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div class="space-y-5">
                    <div>
                        <label
                            class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-400"
                        >
                            {{ t('settings.transformRuleSource') }}
                        </label>
                        <div class="relative">
                            <select
                                v-model="settings.transformConfigMode"
                                class="block w-full appearance-none rounded-md border border-zinc-800 bg-[#131515] pl-3 pr-9 py-2 text-sm text-zinc-100 shadow-none transition-colors focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:outline-none"
                            >
                                <option
                                    v-for="option in modeOptions"
                                    :key="option.value"
                                    :value="option.value"
                                    :disabled="
                                        (option.value === 'builtin' ||
                                            option.value === 'custom_template') &&
                                        isExternalEngine
                                    "
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                            <div
                                class="absolute inset-y-0 right-px flex items-center px-3 pointer-events-none text-zinc-500"
                            >
                                <ChevronDown class="w-3.5 h-3.5" />
                            </div>
                        </div>
                        <p class="mt-2 text-xs leading-relaxed text-zinc-400">
                            {{ modeHint }}
                        </p>
                        <p
                            v-if="isExternalEngine"
                            class="mt-1 text-xs leading-relaxed text-amber-400"
                        >
                            {{ t('settings.transformExternalWarning') }}
                        </p>
                    </div>

                    <div
                        :class="
                            isBuiltinEngine
                                ? 'border-zinc-800'
                                : 'opacity-40 grayscale pointer-events-none select-none'
                        "
                        class="rounded-md border border-zinc-800 bg-transparent p-4 transition-all duration-300"
                    >
                        <div class="mb-4 flex items-center justify-between">
                            <h4 class="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                                <span
                                    v-if="isBuiltinEngine"
                                    class="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                ></span>
                                {{ t('settings.transformBuiltinParams') }}
                            </h4>
                            <span class="text-[10px] font-mono text-zinc-500">builtin-core</span>
                        </div>

                        <div class="space-y-4">
                            <div
                                :class="{ 'opacity-60': !isBuiltinMode }"
                                class="transition-opacity"
                            >
                                <label class="mb-1.5 block text-xs font-medium text-zinc-400">{{
                                    t('settings.transformRuleLevel')
                                }}</label>
                                <div class="relative">
                                    <select
                                        v-model="settings.ruleLevel"
                                        :disabled="!isBuiltinMode || isExternalEngine"
                                        class="block w-full appearance-none rounded-md border border-zinc-800 bg-[#131515] pl-3 pr-9 py-2 text-xs text-zinc-100 transition-colors focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:outline-none"
                                    >
                                        <option value="base">
                                            {{ t('settings.transformRuleBase') }}
                                        </option>
                                        <option value="std">
                                            {{ t('settings.transformRuleStd') }}
                                        </option>
                                        <option value="full">
                                            {{ t('settings.transformRuleFull') }}
                                        </option>
                                        <option value="relay">
                                            {{ t('settings.transformRuleRelay') }}
                                        </option>
                                    </select>
                                    <div
                                        class="absolute inset-y-0 right-px flex items-center px-3 pointer-events-none text-zinc-500"
                                    >
                                        <ChevronDown class="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 gap-2.5">
                                <div
                                    class="flex items-center justify-between rounded-md border border-zinc-800 bg-transparent p-2.5"
                                >
                                    <span class="text-xs font-medium text-zinc-300">{{
                                        t('settings.transformBuiltinSkipCert')
                                    }}</span>
                                    <Switch v-model="settings.builtinSkipCertVerify" size="sm" />
                                </div>
                                <div
                                    class="flex items-center justify-between rounded-md border border-zinc-800 bg-transparent p-2.5"
                                >
                                    <span class="text-xs font-medium text-zinc-300">{{
                                        t('settings.transformBuiltinUdp')
                                    }}</span>
                                    <Switch v-model="settings.builtinEnableUdp" size="sm" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    :class="{ 'opacity-50 pointer-events-none': isBuiltinMode }"
                    class="transition-all"
                >
                    <label
                        class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-400"
                    >
                        {{ t('settings.transformTemplateConfig') }}
                    </label>
                    <TransformSelector
                        v-model="settings.transformConfig"
                        @select-asset="selectedAsset = $event"
                        type="config"
                        :force-custom="settings.transformConfigMode === 'custom'"
                        :custom-templates-only="settings.transformConfigMode === 'custom_template'"
                        :placeholder="t('settings.transformPresetPlaceholder')"
                        :custom-placeholder="t('settings.transformRemotePlaceholder')"
                        :allowEmpty="settings.transformConfigMode === 'builtin'"
                        :exclude-builtin-assets="isExternalEngine"
                    />
                    <p
                        v-if="settings.transformConfigMode === 'custom_template'"
                        class="mt-2 rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-xs leading-relaxed text-zinc-400"
                    >
                        {{ t('settings.transformCustomTemplateSelectHint') }}
                    </p>
                </div>
            </div>
        </div>

        <div
            :class="
                isExternalEngine
                    ? 'border-zinc-800'
                    : 'opacity-40 grayscale pointer-events-none select-none'
            "
            class="rounded-md border border-zinc-800 bg-transparent p-5 transition-all duration-300"
        >
            <div class="mb-4 flex items-center justify-between">
                <h4 class="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                    <span
                        v-if="isExternalEngine"
                        class="h-1.5 w-1.5 rounded-full bg-amber-500"
                    ></span>
                    {{ t('settings.transformExternalParams') }}
                </h4>
                <span class="text-[10px] font-mono text-zinc-500">subconverter</span>
            </div>

            <div class="space-y-4">
                <div>
                    <label class="mb-1.5 block text-xs font-medium text-zinc-400">{{
                        t('settings.transformBackend')
                    }}</label>
                    <div class="relative mb-2">
                        <select
                            v-model="settings.subconverter.defaultBackend"
                            class="block w-full appearance-none rounded-md border border-zinc-800 bg-[#131515] pl-3 pr-9 py-2 text-xs font-mono text-zinc-100 transition-colors focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:outline-none"
                        >
                            <option
                                v-for="backend in SUBCONVERTER_BACKENDS"
                                :key="backend.value"
                                :value="backend.value"
                            >
                                {{ t(backend.labelKey) }} · {{ backend.description }}
                            </option>
                        </select>
                        <div
                            class="absolute inset-y-0 right-px flex items-center px-3 pointer-events-none text-zinc-500"
                        >
                            <ChevronDown class="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <input
                        type="text"
                        v-model="settings.subconverter.defaultBackend"
                        placeholder="subapi.cmliussss.net"
                        class="block w-full rounded-md border border-zinc-800 bg-[#131515] px-3 py-2 text-xs font-mono text-zinc-100 focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500"
                        :aria-label="t('settings.transformCustomBackend')"
                    />
                    <p class="mt-1.5 text-xs leading-relaxed text-zinc-400">
                        {{ t('settings.transformBackendHint') }}
                    </p>
                    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            data-testid="test-subconverter-backend"
                            @click="handleTestBackend"
                            :disabled="!isExternalEngine || isTestingBackend"
                            :aria-busy="String(isTestingBackend)"
                            class="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {{
                                isTestingBackend
                                    ? t('settings.transformTesting')
                                    : t('settings.transformTestBackend')
                            }}
                        </button>
                        <p class="text-xs leading-relaxed text-zinc-500">
                            {{ t('settings.transformTestBackendHint') }}
                        </p>
                    </div>
                    <div
                        v-if="backendTestStatus"
                        data-testid="subconverter-backend-test-result"
                        :class="backendTestToneClass"
                        class="mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed"
                    >
                        <div class="font-medium flex items-center gap-2">
                            <span
                                class="h-1.5 w-1.5 rounded-full shrink-0"
                                :class="backendTestStatus.success ? 'bg-emerald-500' : 'bg-red-500'"
                            ></span>
                            {{ backendTestStatus.message }}
                        </div>
                        <div v-if="backendTestStatus.endpoint" class="mt-1 font-mono text-zinc-500">
                            {{
                                t('settings.transformProbeEndpoint', {
                                    endpoint: backendTestStatus.endpoint,
                                })
                            }}<span v-if="backendTestStatus.elapsedMs">
                                · {{ backendTestStatus.elapsedMs }}ms</span
                            >
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div
                        v-for="flag in flagOptions"
                        :key="flag.key"
                        class="flex items-center justify-between rounded-md border border-zinc-800 bg-transparent p-2"
                    >
                        <span class="truncate text-xs text-zinc-300" :title="flag.label">{{
                            flag.label
                        }}</span>
                        <Switch
                            v-model="settings.subconverter.defaultOptions[flag.key]"
                            size="xs"
                        />
                    </div>
                </div>
            </div>
        </div>
        <RuleTemplateManager />
    </div>
</template>
