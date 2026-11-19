<script setup>
    import { computed } from 'vue';
    import { X } from '@lucide/vue';
    import { useI18n } from '@/i18n/index.js';

    const props = defineProps({
        modelValue: {
            type: Object,
            default: () => ({}),
        },
    });

    const emit = defineEmits(['update:modelValue']);
    const { t } = useI18n();

    // Local working copy with defaults
    const params = computed({
        get: () => ({
            include: { enabled: false, rules: [], ...props.modelValue.include },
            exclude: { enabled: false, rules: [], ...props.modelValue.exclude },
            protocols: { enabled: false, values: [], ...props.modelValue.protocols },
            regions: { enabled: false, values: [], ...props.modelValue.regions },
        }),
        set: (val) => emit('update:modelValue', val),
    });

    const updateParam = (key, value) => {
        const newParams = { ...params.value, [key]: value };
        emit('update:modelValue', newParams);
    };

    const addRule = (type) => {
        const current = { ...params.value[type] };
        current.rules = [...(current.rules || []), { pattern: '', flags: 'i' }];
        updateParam(type, current);
    };

    const normalizeRuleFlags = (type, index) => {
        const current = { ...params.value[type] };
        current.rules = [...(current.rules || [])];
        const rule = current.rules[index];
        if (!rule) return;
        current.rules[index] = { ...rule, flags: 'i' };
        updateParam(type, current);
    };

    const removeRule = (type, index) => {
        const current = { ...params.value[type] };
        current.rules = [...current.rules];
        current.rules.splice(index, 1);
        updateParam(type, current);
    };

    const commonProtocols = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'socks'];
    const commonRegions = ['香港', '美国', '日本', '新加坡', '台湾', '韩国', '英国', '德国'];
    const regionLabels = {
        香港: 'Hong Kong',
        美国: 'United States',
        日本: 'Japan',
        新加坡: 'Singapore',
        台湾: 'Taiwan',
        韩国: 'South Korea',
        英国: 'United Kingdom',
        德国: 'Germany',
    };
    const statusLabel = (enabled) => t(enabled ? 'operators.statusOn' : 'operators.statusOff');
    const regionLabel = (region) =>
        t('operators.regionLabel', { region: regionLabels[region] || region });

    const toggleValue = (type, value) => {
        const current = { ...params.value[type] };
        const values = new Set(current.values || []);
        if (values.has(value)) {
            values.delete(value);
        } else {
            values.add(value);
        }
        current.values = Array.from(values);
        updateParam(type, current);
    };
</script>

<template>
    <div class="space-y-5">
        <!-- Protocol & Region Filter Layer -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Protocol -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label
                        class="text-[11px] font-semibold text-fg-muted uppercase tracking-tight"
                        >{{ t('operators.protocolLimit') }}</label
                    >
                    <button
                        @click="
                            updateParam('protocols', {
                                ...params.protocols,
                                enabled: !params.protocols.enabled,
                            })
                        "
                        :class="[
                            'text-[10px] font-medium transition-colors',
                            params.protocols.enabled ? 'text-fg' : 'text-fg-subtle',
                        ]"
                    >
                        {{ statusLabel(params.protocols.enabled) }}
                    </button>
                </div>
                <div
                    v-if="params.protocols.enabled"
                    class="flex flex-wrap gap-1.5 p-2 bg-transparent rounded-md border border-line"
                >
                    <button
                        v-for="p in commonProtocols"
                        :key="p"
                        @click="toggleValue('protocols', p)"
                        :class="[
                            'px-2 py-1 rounded-md font-mono text-[10px] font-semibold uppercase transition-all',
                            params.protocols.values?.includes(p)
                                ? 'bg-accent text-accent-fg'
                                : 'bg-transparent text-fg-muted border border-line hover:bg-hover hover:text-fg',
                        ]"
                    >
                        {{ p }}
                    </button>
                </div>
            </div>

            <!-- Region -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <label
                        class="text-[11px] font-semibold text-fg-muted uppercase tracking-tight"
                        >{{ t('operators.regionLimit') }}</label
                    >
                    <button
                        @click="
                            updateParam('regions', {
                                ...params.regions,
                                enabled: !params.regions.enabled,
                            })
                        "
                        :class="[
                            'text-[10px] font-medium transition-colors',
                            params.regions.enabled ? 'text-fg' : 'text-fg-subtle',
                        ]"
                    >
                        {{ statusLabel(params.regions.enabled) }}
                    </button>
                </div>
                <div
                    v-if="params.regions.enabled"
                    class="flex flex-wrap gap-1.5 p-2 bg-transparent rounded-md border border-line"
                >
                    <button
                        v-for="r in commonRegions"
                        :key="r"
                        @click="toggleValue('regions', r)"
                        :class="[
                            'px-2 py-1 rounded-md text-[10px] font-semibold transition-all',
                            params.regions.values?.includes(r)
                                ? 'bg-accent text-accent-fg'
                                : 'bg-transparent text-fg-muted border border-line hover:bg-hover hover:text-fg',
                        ]"
                    >
                        {{ regionLabel(r) }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Name Rules (Include/Exclude) -->
        <div v-for="type in ['include', 'exclude']" :key="type" class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="text-[11px] font-semibold text-fg-muted uppercase tracking-tight">
                    {{
                        t(type === 'include' ? 'operators.includeRegex' : 'operators.excludeRegex')
                    }}
                </label>
                <div class="flex items-center gap-3">
                    <button
                        v-if="params[type].enabled"
                        @click="addRule(type)"
                        class="text-[10px] text-fg font-semibold hover:text-white"
                    >
                        + {{ t('operators.add') }}
                    </button>
                    <button
                        @click="
                            updateParam(type, { ...params[type], enabled: !params[type].enabled })
                        "
                        :class="[
                            'text-[10px] font-medium',
                            params[type].enabled ? 'text-fg' : 'text-fg-subtle',
                        ]"
                    >
                        {{ statusLabel(params[type].enabled) }}
                    </button>
                </div>
            </div>

            <div v-if="params[type].enabled" class="space-y-1.5">
                <div
                    v-for="(rule, idx) in params[type].rules"
                    :key="idx"
                    class="flex items-center gap-2 group"
                >
                    <input
                        v-model="rule.pattern"
                        @input="normalizeRuleFlags(type, idx)"
                        :placeholder="t('operators.regexPlaceholder')"
                        class="flex-1 px-3 py-1.5 font-mono text-[11px] rounded-md bg-inset border border-line text-fg placeholder:text-fg-subtle focus:border-line-strong transition-all outline-none"
                        :aria-label="t('operators.regexPlaceholder')"
                    />
                    <button
                        @click="removeRule(type, idx)"
                        class="p-1.5 text-fg-subtle hover:text-red-400 touch-target"
                        :aria-label="t('operators.removeRule')"
                    >
                        <X class="h-3.5 w-3.5" />
                    </button>
                </div>
                <p class="text-[10px] text-fg-subtle px-1">
                    {{ t('operators.regexFlagsHint') }}
                </p>
                <div
                    v-if="!params[type].rules?.length"
                    class="text-center py-2 text-[10px] text-fg-subtle italic"
                >
                    {{ t('operators.filterEmptyRules') }}
                </div>
            </div>
        </div>
    </div>
</template>
