<script setup>
    import { computed } from 'vue';
    import { ChevronRight, X } from '@lucide/vue';
    import Textarea from '@/components/ui/Textarea.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        editingSubscription: {
            type: Object,
            required: true,
        },
        isRuleExpanded: {
            type: Boolean,
            default: false,
        },
        isAdvancedMode: {
            type: Boolean,
            default: false,
        },
        ruleMode: {
            type: String,
            default: 'exclude',
        },
        customKeyword: {
            type: String,
            default: '',
        },
        selectedRules: {
            type: Array,
            default: () => [],
        },
        keepRules: {
            type: Array,
            default: () => [],
        },
        excludeRules: {
            type: Array,
            default: () => [],
        },
        presetRegions: {
            type: Array,
            default: () => [],
        },
        presetProtocols: {
            type: Array,
            default: () => [],
        },
        presetKeywords: {
            type: Array,
            default: () => [],
        },
        excludeRuleState: {
            type: Object,
            required: true,
        },
        toggleTag: {
            type: Function,
            required: true,
        },
        isSelected: {
            type: Function,
            required: true,
        },
        isOtherSelected: {
            type: Function,
            default: () => false,
        },
        addCustomKeyword: {
            type: Function,
            required: true,
        },
        removeRule: {
            type: Function,
            required: true,
        },
        removeKeepRule: {
            type: Function,
            default: null,
        },
        removeExcludeRule: {
            type: Function,
            default: null,
        },
        switchToAdvanced: {
            type: Function,
            required: true,
        },
        switchToVisual: {
            type: Function,
            required: true,
        },
    });

    const emit = defineEmits(['toggle-expand', 'update:ruleMode', 'update:customKeyword']);

    const ruleModeModel = computed({
        get: () => props.ruleMode,
        set: (val) => emit('update:ruleMode', val),
    });

    const customKeywordModel = computed({
        get: () => props.customKeyword,
        set: (val) => emit('update:customKeyword', val),
    });

    const effectiveKeepRules = computed(() => {
        if (props.keepRules && props.keepRules.length > 0) return props.keepRules;
        if (props.ruleMode === 'keep') return props.selectedRules;
        return [];
    });

    const effectiveExcludeRules = computed(() => {
        if (props.excludeRules && props.excludeRules.length > 0) return props.excludeRules;
        if (props.ruleMode === 'exclude') return props.selectedRules;
        return [];
    });

    const handleRemoveKeep = (index) => {
        if (props.removeKeepRule) {
            props.removeKeepRule(index);
        } else {
            props.removeRule(index, 'keep');
        }
    };

    const handleRemoveExclude = (index) => {
        if (props.removeExcludeRule) {
            props.removeExcludeRule(index);
        } else {
            props.removeRule(index, 'exclude');
        }
    };
</script>

<template>
    <!-- 包含/排除节点 -->
    <div class="border border-line rounded-md overflow-hidden">
        <!-- 折叠头部 -->
        <div
            class="flex items-center justify-between px-4 py-3 bg-inset hover:bg-hover transition-colors"
        >
            <button
                type="button"
                @click="emit('toggle-expand')"
                :aria-expanded="isRuleExpanded"
                aria-controls="sub-edit-rule-content"
                class="flex flex-1 items-center gap-2 text-left cursor-pointer"
            >
                <div class="flex items-center gap-2">
                    <ChevronRight
                        class="w-4 h-4 text-fg-subtle transition-transform duration-200"
                        :class="{ 'rotate-90': isRuleExpanded }"
                    />
                    <span
                        class="text-sm font-medium text-fg cursor-pointer"
                        >{{ t('subscriptions.includeExclude') }}</span
                    >
                    <span
                        v-if="selectedRules.length > 0"
                        class="px-1.5 py-0.5 text-xs font-mono font-medium rounded-md border border-line bg-surface text-fg-muted"
                    >
                        {{ selectedRules.length }}
                    </span>
                </div>
            </button>
            <div class="flex items-center gap-2" @click.stop>
                <button
                    v-if="!isAdvancedMode"
                    @click="switchToAdvanced"
                    class="text-xs text-fg-muted hover:text-fg hover:underline"
                >
                    {{ t('subscriptions.advancedMode') }}
                </button>
                <button
                    v-else
                    @click="switchToVisual"
                    class="text-xs text-fg-muted hover:text-fg hover:underline"
                >
                    {{ t('subscriptions.visualMode') }}
                </button>
            </div>
        </div>

        <!-- 内容区域 -->
        <Transition name="collapse">
            <div
                v-show="isRuleExpanded"
                id="sub-edit-rule-content"
                class="px-4 py-3 border-t border-line bg-surface"
            >
                <!-- 可视化模式 -->
                <div v-if="!isAdvancedMode" class="space-y-3">
                    <!-- 模式选择（保留白名单 vs 剔除黑名单） -->
                    <div class="flex gap-2">
                        <button
                            type="button"
                            @click="ruleModeModel = 'keep'"
                            :aria-pressed="ruleModeModel === 'keep'"
                            :class="[
                                'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md border transition-all !min-h-0 !min-w-0 cursor-pointer',
                                ruleModeModel === 'keep'
                                    ? 'bg-active text-fg border-line-strong font-semibold'
                                    : 'bg-transparent text-fg-subtle border-line hover:bg-hover',
                            ]"
                        >
                            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            <span>{{ t('subscriptions.keepMode') }}</span>
                            <span
                                v-if="effectiveKeepRules.length > 0"
                                class="px-1.5 py-0.2 rounded-md text-xs font-mono border border-current/20"
                            >
                                {{ effectiveKeepRules.length }}
                            </span>
                        </button>
                        <button
                            type="button"
                            @click="ruleModeModel = 'exclude'"
                            :aria-pressed="ruleModeModel === 'exclude'"
                            :class="[
                                'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md border transition-all !min-h-0 !min-w-0 cursor-pointer',
                                ruleModeModel === 'exclude'
                                    ? 'bg-active text-fg border-line-strong font-semibold'
                                    : 'bg-transparent text-fg-subtle border-line hover:bg-hover',
                            ]"
                        >
                            <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                            <span>{{ t('subscriptions.excludeMode') }}</span>
                            <span
                                v-if="effectiveExcludeRules.length > 0"
                                class="px-1.5 py-0.2 rounded-md text-xs font-mono border border-current/20"
                            >
                                {{ effectiveExcludeRules.length }}
                            </span>
                        </button>
                    </div>

                    <!-- 地区标签 -->
                    <div>
                        <div class="text-xs text-fg-subtle mb-1.5">
                            {{ t('subscriptions.region') }}
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="tag in presetRegions"
                                :key="tag.pattern"
                                type="button"
                                @click="toggleTag(tag, 'region')"
                                :aria-pressed="isSelected(tag.pattern)"
                                :class="[
                                    'px-2.5 py-1 text-xs font-medium rounded-md border transition-all !min-h-0 !min-w-0 cursor-pointer',
                                    isSelected(tag.pattern)
                                        ? 'bg-active text-fg border-line-strong'
                                        : isOtherSelected(tag.pattern)
                                          ? 'bg-transparent text-fg-subtle border-dashed border-line-strong'
                                          : 'bg-transparent text-fg-muted border-line hover:bg-hover',
                                ]"
                            >
                                {{ tag.icon }} {{ tag.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 协议标签 -->
                    <div>
                        <div class="text-xs text-fg-subtle mb-1.5">
                            {{ t('subscriptions.protocol') }}
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="tag in presetProtocols"
                                :key="tag.pattern"
                                type="button"
                                @click="toggleTag(tag, 'protocol')"
                                :aria-pressed="isSelected(tag.pattern)"
                                :class="[
                                    'px-2.5 py-1 text-xs font-mono font-medium rounded-md border transition-all !min-h-0 !min-w-0 cursor-pointer',
                                    isSelected(tag.pattern)
                                        ? 'bg-active text-fg border-line-strong'
                                        : isOtherSelected(tag.pattern)
                                          ? 'bg-transparent text-fg-subtle border-dashed border-line-strong'
                                          : 'bg-transparent text-fg-muted border-line hover:bg-hover',
                                ]"
                            >
                                {{ tag.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 关键词标签 -->
                    <div>
                        <div class="text-xs text-fg-subtle mb-1.5">
                            {{ t('subscriptions.keyword') }}
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="tag in presetKeywords"
                                :key="tag.pattern"
                                type="button"
                                @click="toggleTag(tag, 'keyword')"
                                :aria-pressed="isSelected(tag.pattern)"
                                :class="[
                                    'px-2.5 py-1 text-xs font-medium rounded-md border transition-all !min-h-0 !min-w-0 cursor-pointer',
                                    isSelected(tag.pattern)
                                        ? 'bg-active text-fg border-line-strong'
                                        : isOtherSelected(tag.pattern)
                                          ? 'bg-transparent text-fg-subtle border-dashed border-line-strong'
                                          : 'bg-transparent text-fg-muted border-line hover:bg-hover',
                                ]"
                            >
                                {{ tag.label }}
                            </button>
                        </div>
                    </div>

                    <!-- 自定义关键字输入 -->
                    <div>
                        <div class="text-xs text-fg-subtle mb-1.5">
                            {{ t('subscriptions.customKeyword') }}
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                v-model="customKeywordModel"
                                @keyup.enter="addCustomKeyword"
                                :placeholder="t('subscriptions.keywordPlaceholder')"
                                class="w-full sm:flex-1 min-w-0 px-3 py-1.5 text-sm bg-inset border border-line rounded-md focus-visible:outline-hidden focus:border-line-strong text-fg"
                                :aria-label="t('subscriptions.keywordPlaceholder')"
                            />
                            <button
                                type="button"
                                @click="addCustomKeyword"
                                class="w-full sm:w-auto flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium bg-accent text-accent-fg hover:opacity-90 rounded-md transition-colors !min-h-0 !min-w-0 cursor-pointer"
                            >
                                {{ t('subscriptions.addKeyword') }}
                            </button>
                        </div>
                    </div>

                    <!-- 已选规则展示：保留与剔除两组清晰列出 -->
                    <div
                        v-if="effectiveKeepRules.length > 0 || effectiveExcludeRules.length > 0"
                        class="space-y-2 pt-2 border-t border-line"
                    >
                        <!-- 保留规则列表 -->
                        <div v-if="effectiveKeepRules.length > 0">
                            <div
                                class="text-xs font-medium text-fg-muted mb-1 flex items-center gap-1.5"
                            >
                                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                {{ t('subscriptions.keepRulesTitle') }} (<span class="font-mono">{{
                                    effectiveKeepRules.length
                                }}</span
                                >)
                            </div>
                            <div
                                class="flex flex-wrap gap-1.5 p-2 bg-inset rounded-md border border-line"
                            >
                                <span
                                    v-for="(rule, index) in effectiveKeepRules"
                                    :key="'keep-' + index"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border border-line bg-surface text-fg !min-h-0 !min-w-0"
                                >
                                    {{ rule.icon ? rule.icon + ' ' : '' }}{{ rule.label }}
                                    <button
                                        type="button"
                                        @click="handleRemoveKeep(index)"
                                        class="hover:text-red-500 text-fg-muted transition-colors cursor-pointer !min-h-0 !min-w-0"
                                        :aria-label="t('operators.removeRule')"
                                    >
                                        <X class="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            </div>
                        </div>

                        <!-- 剔除规则列表 -->
                        <div v-if="effectiveExcludeRules.length > 0">
                            <div
                                class="text-xs font-medium text-fg-muted mb-1 flex items-center gap-1.5"
                            >
                                <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                {{ t('subscriptions.excludeRulesTitle') }} (<span
                                    class="font-mono"
                                    >{{ effectiveExcludeRules.length }}</span
                                >)
                            </div>
                            <div
                                class="flex flex-wrap gap-1.5 p-2 bg-inset rounded-md border border-line"
                            >
                                <span
                                    v-for="(rule, index) in effectiveExcludeRules"
                                    :key="'exclude-' + index"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border border-line bg-surface text-fg !min-h-0 !min-w-0"
                                >
                                    {{ rule.icon ? rule.icon + ' ' : '' }}{{ rule.label }}
                                    <button
                                        type="button"
                                        @click="handleRemoveExclude(index)"
                                        class="hover:text-red-500 text-fg-muted transition-colors cursor-pointer !min-h-0 !min-w-0"
                                        :aria-label="t('operators.removeRule')"
                                    >
                                        <X class="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 提示 -->
                    <p class="text-xs text-fg-subtle">
                        {{
                            ruleModeModel === 'keep'
                                ? t('subscriptions.keepHint')
                                : t('subscriptions.excludeHint')
                        }}
                    </p>
                </div>

                <!-- 高级模式（简化版文本编辑器） -->
                <div v-else>
                    <div class="flex items-center gap-2 mb-2">
                        <span
                            class="text-xs px-2 py-0.5 rounded-md border border-line text-fg-muted font-mono"
                            >{{ excludeRuleState.tag }}</span
                        >
                    </div>
                    <Textarea
                        id="sub-edit-exclude"
                        :aria-invalid="excludeRuleState.errors.length > 0 ? 'true' : 'false'"
                        :aria-describedby="
                            excludeRuleState.errors.length ? 'sub-edit-exclude-error' : undefined
                        "
                        v-model="editingSubscription.exclude"
                        :placeholder="t('subscriptions.excludePlaceholder')"
                        rows="8"
                        :invalid="excludeRuleState.errors.length > 0"
                        :wrapperClass="[
                            'bg-inset focus-within:ring-0',
                            excludeRuleState.errors.length
                                ? 'border-red-500'
                                : 'border-line focus-within:border-line-strong',
                        ]"
                        class="px-3 py-2 sm:text-sm font-mono text-fg leading-6 resize-none"
                    />
                    <div
                        v-if="excludeRuleState.errors.length"
                        id="sub-edit-exclude-error"
                        role="alert"
                        class="mt-2 text-xs text-red-500"
                    >
                        {{
                            t('subscriptions.ruleInvalid', { message: excludeRuleState.errorsText })
                        }}
                    </div>
                    <div class="mt-2 text-xs text-fg-subtle space-y-1">
                        <p>
                            {{ t('subscriptions.ruleLineHelp') }}
                            <code class="font-mono">proto:</code>
                        </p>
                        <p>{{ t('subscriptions.ruleKeepHelp') }}</p>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
    .collapse-enter-active,
    .collapse-leave-active {
        transition: all 0.2s ease;
        overflow: hidden;
    }

    .collapse-enter-from,
    .collapse-leave-to {
        opacity: 0;
        max-height: 0;
    }

    .collapse-enter-to,
    .collapse-leave-from {
        opacity: 1;
        max-height: 600px;
    }
</style>
