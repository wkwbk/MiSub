<script setup>
    import { computed, ref } from 'vue';
    import { ChevronDown, ChevronUp, X } from '@lucide/vue';
    import Select from '@/components/ui/Select.vue';
    import { useI18n } from '@/i18n/index.js';
    import draggable from 'vuedraggable';
    import { REGION_EMOJI } from '../../../../../functions/modules/utils/geo-utils.js';

    const props = defineProps({
        modelValue: {
            type: Object,
            default: () => ({}),
        },
    });

    const emit = defineEmits(['update:modelValue']);
    const { t } = useI18n();
    const regexDrafts = ref({});
    const regexErrors = ref({});
    // 按行下标与条件类型暂存已编辑的 customOrder，防止切换条件类型后配置丢失
    const stashedCustomOrders = ref({});
    const CUSTOM_ORDER_KEYS = new Set(['region', 'protocol', 'regex']);

    const swapIndexedMap = (mapObj, idxA, idxB) => {
        const next = { ...mapObj };
        const valA = next[idxA];
        const valB = next[idxB];
        if (valB === undefined) delete next[idxA];
        else next[idxA] = valB;
        if (valA === undefined) delete next[idxB];
        else next[idxB] = valA;
        return next;
    };

    const removeIndexedEntry = (mapObj, removedIdx) => {
        const next = {};
        for (const [k, v] of Object.entries(mapObj)) {
            const num = Number(k);
            if (num < removedIdx) next[num] = v;
            else if (num > removedIdx) next[num - 1] = v;
        }
        return next;
    };

    const omitIndexedEntry = (mapObj, idx) => {
        if (!(idx in mapObj)) return mapObj;
        const next = { ...mapObj };
        delete next[idx];
        return next;
    };

    const params = computed({
        get: () => ({
            keys: [],
            ...props.modelValue,
        }),
        set: (val) => emit('update:modelValue', val),
    });

    const updateKeys = (updater) => {
        const currentKeys = Array.isArray(params.value.keys) ? params.value.keys : [];
        params.value = {
            ...params.value,
            keys: updater([...currentKeys]),
        };
    };

    const DEFAULT_CUSTOM_ORDERS = {
        region: [
            '香港',
            '台湾',
            '日本',
            '新加坡',
            '美国',
            '韩国',
            '英国',
            '德国',
            '法国',
            '加拿大',
        ],
        protocol: ['vless', 'trojan', 'vmess', 'hysteria2', 'ss', 'ssr', 'anytls'],
    };

    const getDefaultCustomOrder = (keyType) => [...(DEFAULT_CUSTOM_ORDERS[keyType] || [])];

    const addKey = () => {
        updateKeys((keys) => [
            ...keys,
            { key: 'region', order: 'asc', customOrder: getDefaultCustomOrder('region') },
        ]);
    };

    const removeKey = (index) => {
        updateKeys((keys) => {
            keys.splice(index, 1);
            return keys;
        });
        regexDrafts.value = removeIndexedEntry(regexDrafts.value, index);
        regexErrors.value = removeIndexedEntry(regexErrors.value, index);
        stashedCustomOrders.value = removeIndexedEntry(stashedCustomOrders.value, index);
    };

    const moveKey = (index, dir) => {
        const currentLen = Array.isArray(params.value.keys) ? params.value.keys.length : 0;
        const target = index + dir;
        if (target < 0 || target >= currentLen) return;
        updateKeys((keys) => {
            [keys[index], keys[target]] = [keys[target], keys[index]];
            return keys;
        });
        regexDrafts.value = swapIndexedMap(regexDrafts.value, index, target);
        regexErrors.value = swapIndexedMap(regexErrors.value, index, target);
        stashedCustomOrders.value = swapIndexedMap(stashedCustomOrders.value, index, target);
    };

    const updateKeyField = (index, field, value) => {
        let nextDrafts = regexDrafts.value;
        let nextErrors = regexErrors.value;
        let nextStashed = stashedCustomOrders.value;

        updateKeys((keys) => {
            const current = keys[index];
            if (!current) return keys;
            let next = { ...current, [field]: value };
            if (field === 'key' && current.key !== value) {
                const rowStash = { ...(nextStashed[index] || {}) };
                if (CUSTOM_ORDER_KEYS.has(current.key) && Array.isArray(current.customOrder)) {
                    rowStash[current.key] = [...current.customOrder];
                }

                const restoredOrder = rowStash[value];
                if (Array.isArray(restoredOrder)) {
                    next.customOrder = [...restoredOrder];
                    delete rowStash[value];
                } else {
                    next.customOrder = getDefaultCustomOrder(value);
                }

                if (Object.keys(rowStash).length > 0) {
                    nextStashed = { ...nextStashed, [index]: rowStash };
                } else {
                    nextStashed = omitIndexedEntry(nextStashed, index);
                }

                if (value === 'regex') {
                    next.order = 'asc';
                }

                nextDrafts = omitIndexedEntry(nextDrafts, index);
                nextErrors = omitIndexedEntry(nextErrors, index);
            }
            keys[index] = next;
            return keys;
        });

        regexDrafts.value = nextDrafts;
        regexErrors.value = nextErrors;
        stashedCustomOrders.value = nextStashed;
    };

    const getRegionEmoji = (region) => {
        if (!region) return '🌐';
        return REGION_EMOJI[region] || '🌍';
    };

    const getTagsList = (item) => {
        return (item.customOrder || []).map((val) => ({ id: val, name: val }));
    };

    const handleDragEnd = (idx, newOrder) => {
        updateKeys((keys) => {
            const current = keys[idx];
            if (!current) return keys;
            keys[idx] = {
                ...current,
                customOrder: newOrder.map((item) => item.name),
            };
            return keys;
        });
    };

    const resetToDefaultOrder = (idx, keyType) => {
        updateKeys((keys) => {
            const current = keys[idx];
            if (!current) return keys;
            keys[idx] = { ...current, customOrder: getDefaultCustomOrder(keyType) };
            return keys;
        });
    };

    const clearRegexError = (idx) => {
        regexErrors.value = omitIndexedEntry(regexErrors.value, idx);
    };

    const handleRegexEnter = (event, idx) => {
        if (event?.isComposing || event?.keyCode === 229) return;
        event?.preventDefault?.();
        addCustomOrderItem(idx);
    };

    const addCustomOrderItem = (idx) => {
        const raw = String(regexDrafts.value[idx] || '').trim();
        if (!raw) return;
        try {
            new RegExp(raw, 'i');
        } catch {
            regexErrors.value = {
                ...regexErrors.value,
                [idx]: t('operators.invalidRegexError'),
            };
            return;
        }
        clearRegexError(idx);
        updateKeys((keys) => {
            const current = keys[idx];
            if (!current) return keys;
            const existing = Array.isArray(current.customOrder) ? current.customOrder : [];
            if (!existing.includes(raw)) {
                keys[idx] = {
                    ...current,
                    customOrder: [...existing, raw],
                };
            }
            return keys;
        });
        regexDrafts.value = omitIndexedEntry(regexDrafts.value, idx);
    };

    const removeCustomOrderItem = (idx, tagIdx) => {
        updateKeys((keys) => {
            const current = keys[idx];
            if (!current) return keys;
            const nextOrder = [...(current.customOrder || [])];
            nextOrder.splice(tagIdx, 1);
            keys[idx] = { ...current, customOrder: nextOrder };
            return keys;
        });
    };

    const clearCustomOrder = (idx) => {
        updateKeys((keys) => {
            const current = keys[idx];
            if (!current) return keys;
            keys[idx] = { ...current, customOrder: [] };
            return keys;
        });
        clearRegexError(idx);
    };

    const getPriorityTypeLabelKey = (key) => {
        if (key === 'region') return 'operators.sortKeyRegion';
        if (key === 'protocol') return 'operators.sortKeyProtocol';
        return 'operators.sortKeyRegex';
    };

    const availableKeys = [
        { value: 'region', labelKey: 'operators.sortKeyRegion' },
        { value: 'protocol', labelKey: 'operators.sortKeyProtocol' },
        { value: 'name', labelKey: 'operators.sortKeyName' },
        { value: 'regex', labelKey: 'operators.sortKeyRegex' },
        { value: 'tag', labelKey: 'operators.sortKeyTag' },
        { value: 'server', labelKey: 'operators.sortKeyServer' },
        { value: 'port', labelKey: 'operators.sortKeyPort' },
    ];

    const regionLabels = {
        香港: 'Hong Kong',
        台湾: 'Taiwan',
        日本: 'Japan',
        新加坡: 'Singapore',
        美国: 'United States',
        韩国: 'South Korea',
        英国: 'United Kingdom',
        德国: 'Germany',
        法国: 'France',
        加拿大: 'Canada',
    };
    const displayTagName = (item, name) =>
        item.key === 'region'
            ? `${getRegionEmoji(name)} ${t('operators.regionLabel', { region: regionLabels[name] || name })}`
            : name;
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <label class="text-[11px] font-semibold text-fg-muted uppercase tracking-tight">{{
                t('operators.sortWeights')
            }}</label>
            <button
                @click="addKey"
                class="text-[10px] text-fg font-semibold hover:text-white"
            >
                + {{ t('operators.addCondition') }}
            </button>
        </div>

        <div class="space-y-1.5">
            <div
                v-for="(item, idx) in params.keys"
                :key="idx"
                class="flex flex-col gap-2 p-2 bg-transparent rounded-md border border-line transition-all"
            >
                <div class="flex items-center gap-2">
                    <div class="flex flex-col">
                        <button
                            @click="moveKey(idx, -1)"
                            class="text-fg-subtle hover:text-fg disabled:opacity-20"
                            :disabled="idx === 0"
                            :aria-label="t('actions.moveUp')"
                        >
                            <ChevronUp class="h-2.5 w-2.5" />
                        </button>
                        <button
                            @click="moveKey(idx, 1)"
                            class="text-fg-subtle hover:text-fg disabled:opacity-20"
                            :disabled="idx === params.keys.length - 1"
                            :aria-label="t('actions.moveDown')"
                        >
                            <ChevronDown class="h-2.5 w-2.5" />
                        </button>
                    </div>

                    <div class="min-w-0 flex-1">
                        <Select
                            :model-value="item.key"
                            @update:model-value="updateKeyField(idx, 'key', $event)"
                            size="xs"
                            trigger-class="font-medium"
                            :options="
                                availableKeys.map((k) => ({ value: k.value, label: t(k.labelKey) }))
                            "
                        />
                    </div>

                    <div v-if="item.key !== 'regex'" class="w-20 shrink-0">
                        <Select
                            :model-value="item.order"
                            @update:model-value="updateKeyField(idx, 'order', $event)"
                            size="xs"
                            popover-min-width="110"
                            :options="[
                                { value: 'asc', label: t('operators.ascending') },
                                { value: 'desc', label: t('operators.descending') },
                            ]"
                        />
                    </div>

                    <button
                        @click="removeKey(idx)"
                        class="p-1 text-fg-subtle hover:text-red-400 touch-target"
                        :aria-label="t('operators.removeSortKey')"
                    >
                        <X class="h-3.5 w-3.5" />
                    </button>
                </div>

                <!-- Custom Order Editor Section -->
                <div
                    v-if="item.key === 'region' || item.key === 'protocol' || item.key === 'regex'"
                    class="mt-0.5 p-2 bg-inset rounded-md border border-line space-y-2"
                >
                    <div class="flex items-center justify-between text-[10px]">
                        <span
                            class="font-semibold text-fg-muted uppercase tracking-tight flex items-center gap-1"
                        >
                            {{
                                t('operators.customPriorityOrder', {
                                    type: t(getPriorityTypeLabelKey(item.key)),
                                })
                            }}
                        </span>
                        <button
                            v-if="item.key === 'region' || item.key === 'protocol'"
                            type="button"
                            @click="resetToDefaultOrder(idx, item.key)"
                            class="text-fg-muted hover:text-white font-semibold"
                        >
                            {{ t('operators.resetDefault') }}
                        </button>
                        <button
                            v-else-if="(item.customOrder || []).length > 0"
                            type="button"
                            @click="clearCustomOrder(idx)"
                            class="text-rose-500 hover:text-rose-600 font-bold"
                        >
                            {{ t('operators.clearAll') }}
                        </button>
                    </div>

                    <!-- Regex Input Row -->
                    <div v-if="item.key === 'regex'" class="space-y-1">
                        <div class="flex items-center gap-1.5">
                            <input
                                v-model="regexDrafts[idx]"
                                type="text"
                                @input="clearRegexError(idx)"
                                @keydown.enter="handleRegexEnter($event, idx)"
                                :placeholder="t('operators.regexPinPlaceholder')"
                                :class="[
                                    'flex-1 px-2.5 py-1 text-[11px] rounded-md bg-canvas border text-fg focus:bg-inset transition-all outline-none',
                                    regexErrors[idx]
                                        ? 'border-rose-400 dark:border-rose-500/70 focus:border-rose-500'
                                        : 'border-line focus:border-line-strong',
                                ]"
                            />
                            <button
                                type="button"
                                @click="addCustomOrderItem(idx)"
                                class="px-2.5 py-1 rounded-md bg-accent hover:opacity-90 text-accent-fg text-[10px] font-bold transition-colors shrink-0"
                            >
                                + {{ t('operators.add') }}
                            </button>
                        </div>
                        <p v-if="regexErrors[idx]" class="text-[10px] text-rose-500">
                            {{ regexErrors[idx] }}
                        </p>
                    </div>

                    <!-- Drag and Drop Tags List -->
                    <draggable
                        :model-value="getTagsList(item)"
                        @update:model-value="(newOrder) => handleDragEnd(idx, newOrder)"
                        item-key="id"
                        animation="200"
                        class="flex flex-wrap gap-1.5"
                    >
                        <template #item="{ element, index }">
                            <div
                                class="cursor-grab active:cursor-grabbing inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-transparent border border-line font-mono text-[10px] text-fg-muted font-semibold hover:bg-hover hover:text-fg transition-colors select-none"
                            >
                                <span v-if="item.key === 'regex'" class="opacity-60 font-mono"
                                    >{{ index + 1 }}.</span
                                >
                                <span>{{ displayTagName(item, element.name) }}</span>
                                <button
                                    v-if="item.key === 'regex'"
                                    type="button"
                                    @click.stop="removeCustomOrderItem(idx, index)"
                                    class="ml-0.5 text-fg-muted hover:text-rose-500 transition-colors leading-none"
                                    :aria-label="t('operators.removeRule')"
                                >
                                    ×
                                </button>
                            </div>
                        </template>
                    </draggable>

                    <div
                        v-if="!(item.customOrder || []).length"
                        class="text-[9px] text-fg-subtle italic"
                    >
                        {{
                            t(
                                item.key === 'regex'
                                    ? 'operators.emptyRegexPriorityItems'
                                    : 'operators.emptyPriorityItems'
                            )
                        }}
                    </div>
                </div>
            </div>

            <div
                v-if="params.keys.length === 0"
                class="text-center py-2 text-[10px] text-fg-subtle italic"
            >
                {{ t('operators.emptySortConditions') }}
            </div>
        </div>
        <p class="text-[10px] text-fg-subtle">{{ t('operators.sortHint') }}</p>
    </div>
</template>
