<script setup>
    import { watch } from 'vue';
    import { Info, List, Map, SlidersHorizontal } from 'lucide-vue-next';
    import OperatorChain from '../../features/Operators/OperatorChain.vue';
    import Input from '../../ui/Input.vue';
    import Select from '../../ui/Select.vue';
    import SectionHeader from '../SectionHeader.vue';
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const prefixToggleOptions = [
        { labelKey: 'profiles.optionEnabled', value: true },
        { labelKey: 'profiles.optionDisabled', value: false },
    ];

    const buildDefaultPrefixSettings = () => ({
        enableManualNodes: true,
        enableSubscriptions: true,
        manualNodePrefix: 'Manual Node',
        prependGroupName: false,
    });

    function ensureDefaults() {
        if (!props.settings) return;

        if (!props.settings.defaultPrefixSettings) {
            props.settings.defaultPrefixSettings = buildDefaultPrefixSettings();
        }

        if (!Array.isArray(props.settings.defaultOperators)) {
            props.settings.defaultOperators = [];
        }

        if (!Array.isArray(props.settings.regionOverrides)) {
            props.settings.regionOverrides = [];
        }
    }

    function addRegionOverride() {
        ensureDefaults();
        props.settings.regionOverrides.push({ pattern: '', region: '美国', flags: 'i' });
    }

    function removeRegionOverride(index) {
        ensureDefaults();
        props.settings.regionOverrides.splice(index, 1);
    }

    watch(() => props.settings, ensureDefaults, { immediate: true });
</script>

<template>
    <div class="space-y-6">
        <!-- Announcement & Info Section -->
        <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
            <SectionHeader
                :title="t('settings.globalInfoTitle')"
                :description="t('settings.globalInfoBody')"
                tone="indigo"
                no-margin
            >
                <template #icon>
                    <Info class="h-4 w-4" />
                </template>
            </SectionHeader>
        </section>

        <!-- Node Prefix Settings -->
        <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
            <SectionHeader
                :title="t('settings.globalNodeSettingsTitle')"
                :description="t('settings.globalNodeSettingsDesc')"
                tone="blue"
            >
                <template #icon>
                    <List class="h-4 w-4" />
                </template>
            </SectionHeader>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <!-- 第一排：手动节点文本前缀 与 开关 -->
                <div>
                    <Input
                        v-model="settings.defaultPrefixSettings.manualNodePrefix"
                        :label="t('settings.globalManualNodePrefix')"
                    />
                </div>

                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                        t('settings.globalManualNodePrefixSwitch')
                    }}</label>
                    <Select
                        v-model="settings.defaultPrefixSettings.enableManualNodes"
                        :options="
                            prefixToggleOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))
                        "
                    />
                </div>

                <!-- 第二排：机场订阅前缀 与 节点国旗 EMOJI -->
                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                        t('settings.globalSubscriptionPrefixSwitch')
                    }}</label>
                    <Select
                        v-model="settings.defaultPrefixSettings.enableSubscriptions"
                        :options="
                            prefixToggleOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))
                        "
                    />
                </div>

                <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">{{
                        t('settings.globalFlagEmojiSwitch')
                    }}</label>
                    <Select
                        v-model="settings.enableFlagEmoji"
                        :options="
                            prefixToggleOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))
                        "
                    />
                </div>
            </div>
        </section>

        <!-- Region Overrides -->
        <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
            <SectionHeader
                :title="t('settings.regionOverridesTitle')"
                :description="t('settings.regionOverridesDesc')"
                tone="purple"
            >
                <template #icon>
                    <Map class="h-4 w-4" />
                </template>
                <template #actions>
                    <button
                        type="button"
                        @click="addRegionOverride"
                        class="shrink-0 whitespace-nowrap rounded-md border border-zinc-100 bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold leading-5 text-zinc-900 transition-colors hover:bg-white"
                    >
                        {{ t('settings.regionOverrideAdd') }}
                    </button>
                </template>
            </SectionHeader>

            <p
                v-if="!settings.regionOverrides.length"
                class="text-xs text-zinc-500"
            >
                {{ t('settings.regionOverridesEmpty') }}
            </p>

            <div v-else class="divide-y divide-zinc-800/60">
                <div
                    v-for="(rule, index) in settings.regionOverrides"
                    :key="index"
                    class="grid grid-cols-1 gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_160px_96px_auto]"
                >
                    <Input
                        v-model="rule.pattern"
                        :label="t('settings.regionOverridePattern')"
                        :placeholder="t('settings.regionOverridePatternPlaceholder')"
                    />
                    <Input
                        v-model="rule.region"
                        :label="t('settings.regionOverrideRegion')"
                        :placeholder="t('settings.regionOverrideRegionPlaceholder')"
                    />
                    <Input
                        v-model="rule.flags"
                        :label="t('settings.regionOverrideFlags')"
                        placeholder="i"
                    />
                    <div class="flex items-end">
                        <button
                            type="button"
                            @click="removeRegionOverride(index)"
                            class="w-full rounded-md border border-red-900/60 bg-transparent px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-950/40"
                        >
                            {{ t('actions.delete') }}
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Unified Operator Chain -->
        <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
            <SectionHeader
                :title="t('settings.globalDefaultOperatorsTitle')"
                :description="t('settings.globalDefaultOperatorsDesc')"
                tone="green"
            >
                <template #icon>
                    <SlidersHorizontal class="h-4 w-4" />
                </template>
                <template #actions>
                    <span
                        class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400"
                        >{{ t('settings.globalDefaultBadge') }}</span
                    >
                </template>
            </SectionHeader>

            <OperatorChain
                v-model="settings.defaultOperators"
                :legacy-data="settings.defaultNodeTransform"
            />
        </section>
    </div>
</template>
