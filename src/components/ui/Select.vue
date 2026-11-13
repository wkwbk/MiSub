<script setup>
    import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
    import { Check, ChevronDown } from 'lucide-vue-next';
    import { usePopoverGuard } from '@/composables/usePopoverGuard.js';

    const props = defineProps({
        modelValue: {
            type: [String, Number, Boolean, Array, Object],
            default: undefined,
        },
        options: {
            type: Array,
            default: () => [],
        },
        placeholder: {
            type: String,
            default: '',
        },
        disabled: {
            type: Boolean,
            default: false,
        },
        multiple: {
            type: Boolean,
            default: false,
        },
        size: {
            type: String,
            default: 'md',
            validator: (value) => ['xs', 'sm', 'md', 'lg'].includes(value),
        },
        triggerClass: {
            type: String,
            default: '',
        },
        popoverClass: {
            type: String,
            default: '',
        },
        popoverMinWidth: {
            type: [Number, String],
            default: 0,
        },
        id: {
            type: String,
            default: undefined,
        },
        ariaLabel: {
            type: String,
            default: undefined,
        },
    });

    const emit = defineEmits(['update:modelValue', 'change']);

    const isOpen = ref(false);
    const triggerRef = ref(null);
    const popoverRef = ref(null);
    const listRef = ref(null);
    const highlightedIndex = ref(-1);
    const placement = ref('bottom');
    const popoverStyle = ref({});

    const sizeClasses = {
        xs: 'h-7 px-2 text-[11px] rounded-md gap-1.5',
        sm: 'h-8 px-2.5 text-xs rounded-md gap-2',
        md: 'h-9 px-3 text-sm rounded-md gap-2',
        lg: 'h-10 px-3.5 text-sm rounded-md gap-2',
    };

    const currentSizeClass = computed(() => sizeClasses[props.size] || sizeClasses.md);

    const normalizeOption = (item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            return {
                value: item.value,
                label: item.label ?? String(item.value ?? ''),
                disabled: Boolean(item.disabled),
            };
        }
        return {
            value: item,
            label: String(item ?? ''),
            disabled: false,
        };
    };

    // 扁平化分组标题与选项，避免模板中重复渲染逻辑
    const renderItems = computed(() => {
        const items = [];
        let flatIndex = 0;

        for (const item of props.options || []) {
            if (item && typeof item === 'object' && Array.isArray(item.options)) {
                if (item.options.length === 0) continue;
                items.push({ isGroupHeader: true, label: item.label });
                for (const subItem of item.options) {
                    items.push({
                        isGroupHeader: false,
                        ...normalizeOption(subItem),
                        flatIndex: flatIndex++,
                    });
                }
            } else {
                items.push({
                    isGroupHeader: false,
                    ...normalizeOption(item),
                    flatIndex: flatIndex++,
                });
            }
        }

        return items;
    });

    const flatOptions = computed(() => renderItems.value.filter((item) => !item.isGroupHeader));

    const isSelected = (value) => {
        if (props.multiple) {
            return Array.isArray(props.modelValue) && props.modelValue.includes(value);
        }
        return props.modelValue === value;
    };

    const selectedOption = computed(() => {
        if (props.multiple) return null;
        return flatOptions.value.find((opt) => opt.value === props.modelValue) || null;
    });

    const displayLabel = computed(() => {
        if (props.multiple) {
            const values = Array.isArray(props.modelValue) ? props.modelValue : [];
            if (values.length === 0) return props.placeholder;
            return values
                .map((val) => flatOptions.value.find((opt) => opt.value === val)?.label ?? String(val))
                .filter(Boolean)
                .join(', ');
        }
        if (selectedOption.value) return selectedOption.value.label;
        if (props.placeholder) return props.placeholder;
        return props.modelValue !== undefined && props.modelValue !== null
            ? String(props.modelValue)
            : '';
    });

    const isPlaceholderShown = computed(() => {
        if (props.multiple) {
            return !Array.isArray(props.modelValue) || props.modelValue.length === 0;
        }
        return !selectedOption.value && Boolean(props.placeholder);
    });

    const updatePosition = () => {
        if (!triggerRef.value) return;

        const rect = triggerRef.value.getBoundingClientRect();
        const gap = 6;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const estimatedHeight = Math.min(popoverRef.value?.offsetHeight || 240, 260);
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        const openUpward = spaceBelow < estimatedHeight + gap + 8 && spaceAbove > spaceBelow;
        placement.value = openUpward ? 'top' : 'bottom';

        const width = Math.max(rect.width, Number(props.popoverMinWidth) || 0);
        const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
        const isInsideModal = Boolean(
            triggerRef.value.closest('[role="dialog"][aria-modal="true"]')
        );

        popoverStyle.value = {
            position: 'fixed',
            left: `${left}px`,
            width: `${width}px`,
            zIndex: isInsideModal ? 'var(--z-modal-popover)' : 'var(--z-popover)',
            ...(openUpward
                ? { bottom: `${viewportHeight - rect.top + gap}px` }
                : { top: `${rect.bottom + gap}px` }),
        };
    };

    const scrollHighlightedIntoView = () => {
        nextTick(() => {
            const list = listRef.value;
            if (!list || highlightedIndex.value < 0) return;
            const target = list.querySelector(`[data-option-index="${highlightedIndex.value}"]`);
            if (!target) return;
            const targetTop = target.offsetTop;
            const targetBottom = targetTop + target.offsetHeight;
            if (targetTop < list.scrollTop) {
                list.scrollTop = targetTop;
            } else if (targetBottom > list.scrollTop + list.clientHeight) {
                list.scrollTop = targetBottom - list.clientHeight;
            }
        });
    };

    const findInitialHighlight = () => {
        const selectedIdx = flatOptions.value.findIndex(
            (opt) => !opt.disabled && isSelected(opt.value)
        );
        return selectedIdx >= 0 ? selectedIdx : flatOptions.value.findIndex((opt) => !opt.disabled);
    };

    const open = async () => {
        if (props.disabled || isOpen.value) return;
        isOpen.value = true;
        highlightedIndex.value = findInitialHighlight();
        updatePosition();
        await nextTick();
        updatePosition();
        scrollHighlightedIntoView();
    };

    const close = (restoreFocus = false) => {
        if (!isOpen.value) return;
        isOpen.value = false;
        highlightedIndex.value = -1;
        if (restoreFocus) {
            nextTick(() => triggerRef.value?.focus());
        }
    };

    const toggle = () => (isOpen.value ? close() : open());

    const selectOption = (option) => {
        if (!option || option.disabled) return;

        if (props.multiple) {
            const current = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
            const idx = current.indexOf(option.value);
            if (idx >= 0) current.splice(idx, 1);
            else current.push(option.value);
            emit('update:modelValue', current);
            emit('change', current);
            return;
        }

        emit('update:modelValue', option.value);
        emit('change', option.value);
        close(true);
    };

    const moveHighlight = (step) => {
        const opts = flatOptions.value;
        if (!opts.length) return;
        let idx = highlightedIndex.value;
        for (let i = 0; i < opts.length; i++) {
            idx = (idx + step + opts.length) % opts.length;
            if (!opts[idx].disabled) {
                highlightedIndex.value = idx;
                scrollHighlightedIntoView();
                return;
            }
        }
    };

    const handleTriggerKeydown = (event) => {
        if (props.disabled) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isOpen.value) open();
            else if (highlightedIndex.value >= 0) {
                selectOption(flatOptions.value[highlightedIndex.value]);
            }
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen.value) open();
            else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Tab' && isOpen.value) {
            close();
        }
    };

    const handleDocumentPointerDown = (event) => {
        if (!isOpen.value) return;
        if (!triggerRef.value?.contains(event.target) && !popoverRef.value?.contains(event.target)) {
            close();
        }
    };

    const handleDocumentKeydown = (event) => {
        if (!isOpen.value || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
    };

    const detachDocumentListeners = () => {
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
        document.removeEventListener('keydown', handleDocumentKeydown, true);
    };

    watch(isOpen, (val) => {
        if (val) {
            document.addEventListener('pointerdown', handleDocumentPointerDown, true);
            document.addEventListener('keydown', handleDocumentKeydown, true);
        } else {
            detachDocumentListeners();
        }
    });

    onBeforeUnmount(detachDocumentListeners);

    usePopoverGuard({
        isOpen,
        popoverRef,
        onClose: () => close(),
        onReposition: updatePosition,
    });

    const getOptionClasses = (opt) => {
        if (opt.disabled) {
            return 'cursor-not-allowed opacity-40 text-zinc-400 dark:text-zinc-500';
        }
        if (highlightedIndex.value === opt.flatIndex) {
            return 'bg-zinc-100 dark:bg-[#27272a] text-zinc-900 dark:text-zinc-100';
        }
        if (isSelected(opt.value)) {
            return 'text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-[#27272a]';
        }
        return 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#27272a] hover:text-zinc-900 dark:hover:text-zinc-100';
    };
</script>

<template>
    <div class="relative w-full">
        <button
            :id="id"
            ref="triggerRef"
            type="button"
            role="combobox"
            :aria-expanded="isOpen"
            :aria-label="ariaLabel"
            aria-haspopup="listbox"
            :disabled="disabled"
            @click="toggle"
            @keydown="handleTriggerKeydown"
            class="select-trigger flex w-full items-center justify-between border bg-white dark:bg-[#131515] text-left text-zinc-900 dark:text-zinc-100 shadow-none transition-colors duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            :class="[
                currentSizeClass,
                isOpen
                    ? 'border-zinc-500 dark:border-zinc-500'
                    : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 focus-visible:border-zinc-500',
                triggerClass,
            ]"
        >
            <span
                class="min-w-0 flex-1 truncate"
                :class="
                    isPlaceholderShown
                        ? 'text-zinc-400 dark:text-zinc-500'
                        : 'text-zinc-900 dark:text-zinc-100'
                "
            >
                {{ displayLabel }}
            </span>
            <ChevronDown
                class="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform duration-200"
                :class="isOpen ? 'rotate-180 text-zinc-700 dark:text-zinc-200' : ''"
            />
        </button>

        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-if="isOpen"
                    ref="popoverRef"
                    :style="popoverStyle"
                    class="select-popover rounded-md border border-zinc-200 dark:border-zinc-800 p-1"
                    :class="[placement === 'top' ? 'origin-bottom' : 'origin-top', popoverClass]"
                >
                    <div
                        ref="listRef"
                        role="listbox"
                        :aria-multiselectable="multiple || undefined"
                        class="max-h-60 overflow-y-auto overscroll-contain space-y-0.5 pr-0.5 select-scrollbar"
                    >
                        <template v-if="renderItems.length > 0">
                            <template v-for="(item, idx) in renderItems" :key="idx">
                                <div
                                    v-if="item.isGroupHeader"
                                    class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
                                >
                                    {{ item.label }}
                                </div>
                                <button
                                    v-else
                                    type="button"
                                    role="option"
                                    :data-option-index="item.flatIndex"
                                    :aria-selected="isSelected(item.value)"
                                    :disabled="item.disabled"
                                    @click="selectOption(item)"
                                    @mouseenter="
                                        !item.disabled && (highlightedIndex = item.flatIndex)
                                    "
                                    class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs transition-colors duration-100"
                                    :class="getOptionClasses(item)"
                                >
                                    <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                                    <Check
                                        v-if="isSelected(item.value)"
                                        class="h-3.5 w-3.5 shrink-0 text-zinc-900 dark:text-zinc-100"
                                    />
                                </button>
                            </template>
                        </template>
                        <div
                            v-else
                            class="px-3 py-2 text-center text-xs text-zinc-400 dark:text-zinc-500"
                        >
                            No options
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style>
    .select-trigger {
        box-shadow: none !important;
    }
    .select-popover,
    .select-popover:hover {
        background-color: #ffffff;
        box-shadow:
            0 10px 25px -5px rgba(0, 0, 0, 0.12),
            0 8px 10px -6px rgba(0, 0, 0, 0.08);
    }
    .dark .select-popover,
    .dark .select-popover:hover {
        background-color: #171717;
        box-shadow:
            0 16px 32px -8px rgba(0, 0, 0, 0.5),
            0 8px 16px -6px rgba(0, 0, 0, 0.35);
    }
</style>

<style scoped>
    .select-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .select-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .select-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(113, 113, 122, 0.28);
        border-radius: 9999px;
    }
    .select-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(113, 113, 122, 0.48);
    }
</style>
