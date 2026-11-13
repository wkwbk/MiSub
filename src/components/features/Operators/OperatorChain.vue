<script setup>
    import { ref, computed } from 'vue';
    import {
        Filter,
        PenLine,
        Code2,
        ArrowUpDown,
        Copy,
        Zap,
        Plus,
        ChevronUp,
        ChevronDown,
        PauseCircle,
        X,
    } from 'lucide-vue-next';
    import { useI18n } from '../../../i18n/index.js';
    import FilterEditor from './components/FilterEditor.vue';
    import RenameEditor from './components/RenameEditor.vue';
    import SortEditor from './components/SortEditor.vue';
    import DedupEditor from './components/DedupEditor.vue';
    import Input from '../../ui/Input.vue';

    const props = defineProps({
        modelValue: {
            type: Array,
            default: () => [],
        },
        legacyData: {
            type: Object,
            default: null,
        },
    });

    const emit = defineEmits(['update:modelValue']);
    const { t } = useI18n();

    // Migration Logic
    const canMigrate = computed(() => {
        return props.modelValue.length === 0 && props.legacyData && props.legacyData.enabled;
    });

    const migrateFromLegacy = () => {
        if (!props.legacyData) return;
        const config = props.legacyData;
        const ops = [];

        // 1. Filter
        const filter = config.filter;
        if (
            filter &&
            (filter.include?.enabled ||
                filter.exclude?.enabled ||
                filter.protocols?.enabled ||
                filter.regions?.enabled ||
                filter.script?.enabled ||
                filter.useless?.enabled)
        ) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'filter',
                enabled: true,
                params: JSON.parse(JSON.stringify(filter)),
            });
        }

        // 2. Rename (Regex)
        const regex = config.rename?.regex;
        if (regex?.enabled && regex.rules?.length > 0) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'rename',
                enabled: true,
                params: { regex: JSON.parse(JSON.stringify(regex)) },
            });
        }

        // 3. Rename (Template)
        const template = config.rename?.template;
        if (template?.enabled) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'rename',
                enabled: true,
                params: {
                    template: {
                        enabled: true,
                        template: template.template || '{emoji}{region}-{protocol}-{index}',
                        offset: template.indexStart || 1,
                    },
                },
            });
        }

        // 4. Script Rename
        const renameScript = config.rename?.script;
        if (renameScript?.enabled && renameScript.expression) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'script',
                enabled: true,
                params: {
                    code: `return ($nodes) => { return $nodes.map(n => { n.name = (${renameScript.expression})(n.name, n); return n; }); }`,
                },
            });
        }

        // 5. Dedup
        const dedup = config.dedup;
        if (dedup?.enabled) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'dedup',
                enabled: true,
                params: JSON.parse(JSON.stringify(dedup)),
            });
        }

        // 6. Sort
        const sort = config.sort;
        if (sort?.enabled && sort.keys?.length > 0) {
            ops.push({
                id: crypto.randomUUID(),
                type: 'sort',
                enabled: true,
                params: JSON.parse(JSON.stringify(sort)),
            });
        }

        emit('update:modelValue', ops);
    };

    // Track which operator is expanded
    const expandedIndex = ref(props.modelValue.length > 0 ? props.modelValue.length - 1 : null);

    const toggleExpand = (index) => {
        expandedIndex.value = expandedIndex.value === index ? null : index;
    };

    const addOperator = (type) => {
        const newOp = {
            id: Math.random().toString(36).substring(2, 11),
            type,
            enabled: true,
            params: getInitialParams(type),
        };
        const newList = [...props.modelValue, newOp];
        emit('update:modelValue', newList);
        // Auto expand new operator
        expandedIndex.value = newList.length - 1;
    };

    const getInitialParams = (type) => {
        switch (type) {
            case 'filter':
                return {
                    include: { enabled: false, rules: [] },
                    exclude: { enabled: false, rules: [] },
                    protocols: { enabled: false, values: [] },
                    regions: { enabled: false, values: [] },
                };
            case 'rename':
                return {
                    regex: { enabled: false, rules: [] },
                    template: { enabled: false, template: '' },
                };
            case 'script':
                return { code: '', url: '' };
            case 'sort':
                return {
                    keys: [
                        {
                            key: 'region',
                            order: 'asc',
                            customOrder: [
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
                        },
                    ],
                };
            case 'dedup':
                return { mode: 'serverPort', includeProtocol: true, prefer: { protocolOrder: [] } };
            default:
                return {};
        }
    };

    const removeOperator = (index) => {
        const newList = [...props.modelValue];
        newList.splice(index, 1);
        emit('update:modelValue', newList);
        if (expandedIndex.value === index) expandedIndex.value = null;
    };

    const moveOperator = (event, index, direction) => {
        event.stopPropagation();
        const newList = [...props.modelValue];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= newList.length) return;
        [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
        emit('update:modelValue', newList);
        if (expandedIndex.value === index) expandedIndex.value = newIndex;
        else if (expandedIndex.value === newIndex) expandedIndex.value = index;
    };

    const toggleOperator = (event, index) => {
        event.stopPropagation();
        const newList = [...props.modelValue];
        newList[index] = { ...newList[index], enabled: !newList[index].enabled };
        emit('update:modelValue', newList);
    };

    const operatorLabel = (type) => t(`operators.${type}`);
    const operatorTypes = ['filter', 'rename', 'script', 'sort', 'dedup'];

    const OPERATOR_ICONS = {
        filter: Filter,
        rename: PenLine,
        script: Code2,
        sort: ArrowUpDown,
        dedup: Copy,
    };

    const getOperatorIcon = (type) => OPERATOR_ICONS[type] || Filter;

    const updateOperatorParams = (index, params) => {
        const newList = [...props.modelValue];
        newList[index] = { ...newList[index], params };
        emit('update:modelValue', newList);
    };
</script>

<template>
    <div class="space-y-4">
        <!-- Migration Suggestion Card -->
        <div
            v-if="canMigrate"
            class="group relative mb-6 overflow-hidden rounded-md border border-zinc-800 bg-transparent p-4"
        >
            <div class="relative z-10 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div
                        class="w-9 h-9 rounded-md border border-zinc-800 bg-transparent text-zinc-300 flex items-center justify-center shrink-0"
                    >
                        <Zap class="h-4 w-4" />
                    </div>
                    <div>
                        <h4 class="text-xs font-semibold text-zinc-100">
                            {{ t('operators.legacyConfigFound') }}
                        </h4>
                        <p class="mt-0.5 text-xs text-zinc-400">
                            {{ t('operators.legacyConfigDesc') }}
                        </p>
                    </div>
                </div>
                <button
                    @click="migrateFromLegacy"
                    class="whitespace-nowrap rounded-md border border-zinc-100 bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 shadow-none transition-colors hover:bg-white"
                >
                    {{ t('operators.migrateNow') }}
                </button>
            </div>
        </div>

        <div
            v-if="modelValue.length === 0 && !canMigrate"
            class="rounded-md border border-zinc-800 bg-transparent py-10 text-center"
        >
            <div
                class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-400"
            >
                <Plus class="h-5 w-5" />
            </div>
            <h3 class="text-xs font-semibold text-zinc-100">
                {{ t('operators.emptyTitle') }}
            </h3>
            <p class="mt-1 text-xs text-zinc-500">{{ t('operators.emptyDesc') }}</p>
        </div>

        <div v-else class="space-y-2">
            <div
                v-for="(op, index) in modelValue"
                :key="op.id || index"
                :class="[
                    'group overflow-hidden rounded-md border bg-transparent transition-colors',
                    expandedIndex === index
                        ? 'border-zinc-600'
                        : 'border-zinc-800 hover:border-zinc-700',
                    !op.enabled && 'opacity-60 grayscale-[0.5]',
                ]"
            >
                <!-- Compact Header -->
                <div
                    @click="toggleExpand(index)"
                    class="cursor-pointer select-none p-3 hover:bg-zinc-900/40"
                >
                    <div class="flex items-start justify-between gap-3 sm:items-center">
                        <div class="flex items-center gap-3 min-w-0">
                            <div
                                :class="[
                                    'w-8 h-8 flex items-center justify-center rounded-md border shadow-none transition-colors',
                                    expandedIndex === index
                                        ? 'bg-zinc-100 border-zinc-100 text-zinc-900'
                                        : 'bg-transparent border-zinc-800 text-zinc-400',
                                ]"
                            >
                                <component :is="getOperatorIcon(op.type)" class="h-4 w-4" />
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h4 class="font-semibold text-xs text-zinc-100">
                                        {{ operatorLabel(op.type) }}
                                    </h4>
                                    <span
                                        v-if="!op.enabled"
                                        class="rounded-md border border-zinc-800 bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                                        >{{ t('operators.paused') }}</span
                                    >
                                </div>
                                <p class="mt-1 text-[11px] text-zinc-500 sm:hidden">
                                    {{
                                        op.enabled
                                            ? t('operators.enabled')
                                            : t('operators.disabled')
                                    }}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-center gap-2">
                            <div
                                class="flex items-center gap-1 pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                                <button
                                    @click="(e) => moveOperator(e, index, -1)"
                                    class="rounded-md p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-30"
                                    :disabled="index === 0"
                                >
                                    <ChevronUp class="h-4 w-4" />
                                </button>
                                <button
                                    @click="(e) => moveOperator(e, index, 1)"
                                    class="rounded-md p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-30"
                                    :disabled="index === modelValue.length - 1"
                                >
                                    <ChevronDown class="h-4 w-4" />
                                </button>
                                <button
                                    @click="(e) => toggleOperator(e, index)"
                                    class="rounded-md p-1"
                                    :class="
                                        op.enabled
                                            ? 'text-zinc-300 hover:bg-zinc-900 hover:text-amber-400'
                                            : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100'
                                    "
                                >
                                    <PauseCircle class="h-4 w-4" />
                                </button>
                                <button
                                    @click="
                                        (e) => {
                                            e.stopPropagation();
                                            removeOperator(index);
                                        }
                                    "
                                    class="rounded-md p-1 text-zinc-400 hover:bg-red-950/40 hover:text-red-400"
                                >
                                    <X class="h-4 w-4" />
                                </button>
                            </div>
                            <ChevronDown
                                class="h-4 w-4 text-zinc-400 transition-transform duration-300"
                                :class="{ 'rotate-180 text-zinc-100': expandedIndex === index }"
                            />
                        </div>
                    </div>
                </div>

                <!-- Collapsible Content -->
                <transition
                    enter-active-class="transition-[max-height,opacity] duration-300 ease-out"
                    enter-from-class="max-h-0 opacity-0"
                    enter-to-class="max-h-[800px] opacity-100"
                    leave-active-class="transition-[max-height,opacity] duration-200 ease-in"
                    leave-from-class="max-h-[800px] opacity-100"
                    leave-to-class="max-h-0 opacity-0"
                >
                    <div v-show="expandedIndex === index" class="border-t border-zinc-800">
                        <div class="p-4 sm:p-5">
                            <FilterEditor
                                v-if="op.type === 'filter'"
                                :modelValue="op.params"
                                @update:modelValue="(val) => updateOperatorParams(index, val)"
                            />
                            <RenameEditor
                                v-else-if="op.type === 'rename'"
                                :modelValue="op.params"
                                @update:modelValue="(val) => updateOperatorParams(index, val)"
                            />
                            <SortEditor
                                v-else-if="op.type === 'sort'"
                                :modelValue="op.params"
                                @update:modelValue="(val) => updateOperatorParams(index, val)"
                            />
                            <DedupEditor
                                v-else-if="op.type === 'dedup'"
                                :modelValue="op.params"
                                @update:modelValue="(val) => updateOperatorParams(index, val)"
                            />

                            <div v-else-if="op.type === 'script'" class="space-y-4">
                                <Input
                                    :modelValue="op.params.url"
                                    @update:modelValue="
                                        (val) =>
                                            updateOperatorParams(index, { ...op.params, url: val })
                                    "
                                    :label="t('operators.scriptUrlLabel')"
                                    :placeholder="t('operators.scriptUrlPlaceholder')"
                                />
                                <textarea
                                    :value="op.params.code"
                                    @input="
                                        (e) =>
                                            updateOperatorParams(index, {
                                                ...op.params,
                                                code: e.target.value,
                                            })
                                    "
                                    class="w-full h-64 p-3 font-mono text-xs bg-[#131515] text-zinc-100 border border-zinc-800 rounded-md focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 outline-none transition-colors resize-none"
                                    placeholder="function operator($proxies, $context) { ... }"
                                ></textarea>
                            </div>
                        </div>
                    </div>
                </transition>
            </div>
        </div>

        <!-- Add Control (Segmented Style) -->
        <div class="pt-4">
            <div
                class="grid grid-cols-2 gap-1.5 rounded-md border border-zinc-800 bg-[#131515] p-1 sm:inline-flex sm:flex-wrap"
            >
                <button
                    v-for="type in operatorTypes"
                    :key="type"
                    @click="addOperator(type)"
                    class="rounded-md px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 whitespace-nowrap"
                >
                    + {{ operatorLabel(type) }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .group:hover .hover-action {
        opacity: 1;
    }
</style>
