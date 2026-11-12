<script setup>
    import { computed } from 'vue';
    import { useI18n } from '../../../../i18n/index.js';

    const props = defineProps({
        modelValue: {
            type: Object,
            default: () => ({}),
        },
    });

    const emit = defineEmits(['update:modelValue']);
    const { t } = useI18n();

    const updateParam = (key, value) => {
        const newParams = { ...props.modelValue };
        newParams[key] = { ...newParams[key], ...value };
        emit('update:modelValue', newParams);
    };

    const updateTemplate = (updates) => {
        const current = props.modelValue.template || { enabled: false, template: '', offset: 1 };
        updateParam('template', { ...current, ...updates });
    };

    const addRule = () => {
        const current = { ...(props.modelValue.regex || { enabled: true, rules: [] }) };
        current.rules = [...(current.rules || []), { pattern: '', replacement: '', flags: 'g' }];
        updateParam('regex', current);
    };

    const normalizeRuleFlags = (index) => {
        const current = { ...(props.modelValue.regex || { rules: [] }) };
        current.rules = [...(current.rules || [])];
        const rule = current.rules[index];
        if (!rule) return;
        current.rules[index] = { ...rule, flags: 'gi' };
        updateParam('regex', current);
    };

    const removeRule = (index) => {
        const current = { ...(props.modelValue.regex || { rules: [] }) };
        current.rules = [...current.rules];
        current.rules.splice(index, 1);
        updateParam('regex', current);
    };

    // 预设模板
    const presetTemplates = [
        {
            nameKey: 'operators.templatePresetStandard',
            template: '{emoji}{region}-{protocol}-{index:2}',
        },
        { nameKey: 'operators.templatePresetRegex', template: '{emoji}{g1}-{g2}-{index:2}' },
        { nameKey: 'operators.templatePresetSimple', template: '{emoji}{regionZh} {index:2}' },
        { nameKey: 'operators.templatePresetName', template: '{name}' },
    ];

    const applyPresetTemplate = (tpl) => {
        updateTemplate({ enabled: true, template: tpl });
    };

    // 预设正则
    const presetRegexRules = [
        {
            nameKey: 'operators.regexPresetRegionProviderLine',
            pattern: '\\[(.*?)\\]-(.*?)-(.*)$',
            replacement: '',
        },
        {
            nameKey: 'operators.regexPresetExtractSuffix',
            pattern: '(.*?) -(.*?)$',
            replacement: '$1',
        },
    ];

    const statusLabel = (enabled) => t(enabled ? 'operators.statusOn' : 'operators.statusOff');

    const applyPresetRegex = (rule) => {
        const current = { ...(props.modelValue.regex || { enabled: true, rules: [] }) };
        current.enabled = true;
        current.rules = [...(current.rules || []), { ...rule, flags: 'gi' }];
        updateParam('regex', current);
    };
</script>

<template>
    <div class="space-y-6">
        <!-- Regex Rename -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <label
                    class="text-[11px] font-semibold text-zinc-400 uppercase tracking-tight"
                    >{{ t('operators.regexReplace') }}</label
                >
                <div class="flex items-center gap-2">
                    <div class="relative group/presets">
                        <button
                            class="text-[10px] text-zinc-400 font-medium hover:text-zinc-100 transition-colors flex items-center gap-0.5"
                        >
                            {{ t('operators.commonRegex') }}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-2.5 w-2.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>
                        <div
                            class="absolute right-0 top-full mt-1 w-40 bg-[#171717] border border-zinc-800 rounded-md shadow-none opacity-0 invisible group-hover/presets:opacity-100 group-hover/presets:visible transition-all z-10 py-1"
                        >
                            <button
                                v-for="rule in presetRegexRules"
                                :key="rule.nameKey"
                                @click="applyPresetRegex(rule)"
                                class="w-full text-left px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ t(rule.nameKey) }}
                            </button>
                        </div>
                    </div>
                    <button
                        v-if="props.modelValue.regex?.enabled"
                        @click="addRule"
                        class="text-[10px] text-zinc-200 font-semibold ml-1 hover:text-white"
                    >
                        + {{ t('operators.addItem') }}
                    </button>
                    <button
                        @click="
                            updateParam('regex', {
                                ...props.modelValue.regex,
                                enabled: !props.modelValue.regex?.enabled,
                            })
                        "
                        :class="[
                            'text-[10px] font-medium transition-colors ml-2',
                            props.modelValue.regex?.enabled
                                ? 'text-zinc-100'
                                : 'text-zinc-500',
                        ]"
                    >
                        {{ statusLabel(props.modelValue.regex?.enabled) }}
                    </button>
                </div>
            </div>

            <div v-if="props.modelValue.regex?.enabled" class="space-y-2">
                <div
                    v-for="(rule, idx) in props.modelValue.regex.rules"
                    :key="idx"
                    class="flex flex-col gap-2 p-3 bg-transparent rounded-md border border-zinc-800 relative group transition-all"
                >
                    <button
                        @click="removeRule(idx)"
                        class="absolute top-2 right-2 p-1 text-zinc-500 hover:text-red-400 transition-colors touch-target"
                        :aria-label="t('operators.removeRule')"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                        <div class="space-y-1">
                            <input
                                :value="rule.pattern"
                                @input="
                                    (e) => {
                                        rule.pattern = e.target.value;
                                        updateParam('regex', props.modelValue.regex);
                                    }
                                "
                                @change="normalizeRuleFlags(idx)"
                                :placeholder="t('operators.regexFindPlaceholder')"
                                class="w-full px-2 py-1.5 font-mono text-[11px] rounded-md bg-[#131515] border border-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
                                :aria-label="t('operators.regexFindPlaceholder')"
                            />
                        </div>
                        <div class="space-y-1">
                            <input
                                :value="rule.replacement"
                                @input="
                                    (e) => {
                                        rule.replacement = e.target.value;
                                        updateParam('regex', props.modelValue.regex);
                                    }
                                "
                                @change="normalizeRuleFlags(idx)"
                                :placeholder="t('operators.regexReplacePlaceholder')"
                                class="w-full px-2 py-1.5 font-mono text-[11px] rounded-md bg-[#131515] border border-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
                                :aria-label="t('operators.regexReplacePlaceholder')"
                            />
                        </div>
                    </div>
                </div>
                <p class="px-1 text-[10px] text-zinc-500">
                    {{ t('operators.regexReplaceHint') }}
                </p>
                <div
                    v-if="!props.modelValue.regex.rules?.length"
                    class="text-center py-2 text-[10px] text-zinc-500 italic"
                >
                    {{ t('operators.renameEmptyRules') }}
                </div>
            </div>
        </div>

        <!-- Template Rename -->
        <div class="space-y-3 pt-4 border-t border-zinc-800">
            <div class="flex items-center justify-between">
                <label
                    class="text-[11px] font-semibold text-zinc-400 uppercase tracking-tight"
                    >{{ t('operators.templateRewrite') }}</label
                >
                <button
                    @click="updateTemplate({ enabled: !props.modelValue.template?.enabled })"
                    :class="[
                        'text-[10px] font-medium transition-colors',
                        props.modelValue.template?.enabled
                            ? 'text-zinc-100'
                            : 'text-zinc-500',
                    ]"
                >
                    {{ statusLabel(props.modelValue.template?.enabled) }}
                </button>
            </div>

            <div v-if="props.modelValue.template?.enabled" class="space-y-3">
                <div
                    class="p-3 bg-transparent rounded-md border border-zinc-800"
                >
                    <div class="space-y-2">
                        <input
                            :value="props.modelValue.template.template || ''"
                            @input="(e) => updateTemplate({ template: e.target.value })"
                            placeholder="{emoji}{region}-{index}"
                            class="w-full px-3 py-2 font-mono text-xs rounded-md bg-[#131515] border border-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600"
                            :aria-label="t('operators.templateRewrite')"
                        />
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="tag in [
                                    '{name}',
                                    '{protocol}',
                                    '{regionZh}',
                                    '{region}',
                                    '{emoji}',
                                    '{index}',
                                    '{index:2}',
                                    '{g1}',
                                    '{g2}',
                                    '{g3}',
                                    '{server}',
                                ]"
                                :key="tag"
                                class="font-mono text-[9px] bg-transparent text-zinc-300 px-1.5 py-0.5 rounded-md border border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100 transition-colors touch-target-min"
                                @click="
                                    updateTemplate({
                                        template: (props.modelValue.template.template || '') + tag,
                                    })
                                "
                            >
                                {{ tag }}
                            </button>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[9px] text-zinc-500">{{
                                t('operators.recommendedTemplates')
                            }}</span>
                            <button
                                v-for="tpl in presetTemplates"
                                :key="tpl.nameKey"
                                @click="applyPresetTemplate(tpl.template)"
                                class="text-[9px] px-2 py-0.5 rounded-md border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors touch-target-min"
                            >
                                {{ t(tpl.nameKey) }}
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                        <span class="text-[10px] text-zinc-400 font-medium">{{
                            t('operators.startIndex')
                        }}</span>
                        <input
                            :value="props.modelValue.template.offset || 1"
                            @input="
                                (e) => updateTemplate({ offset: parseInt(e.target.value) || 1 })
                            "
                            type="number"
                            class="w-14 px-2 py-1 font-mono text-[10px] rounded-md bg-[#131515] border border-zinc-800 text-zinc-100 outline-none focus:border-zinc-600"
                            :aria-label="t('operators.startIndex')"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
