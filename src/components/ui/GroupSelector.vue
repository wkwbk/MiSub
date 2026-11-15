<script setup>
    import { ref, computed, onBeforeUnmount, nextTick, watch } from 'vue';
    import { Folder, ChevronDown, Check } from '@lucide/vue';
    import { t } from '@/i18n/index.js';
    import { usePopoverGuard } from '@/composables/usePopoverGuard.js';

    const props = defineProps({
        modelValue: {
            type: String,
            default: '',
        },
        groups: {
            type: Array,
            default: () => [],
        },
        placeholder: {
            type: String,
            default: () => t('common.groupPlaceholder'),
        },
    });

    const emit = defineEmits(['update:modelValue']);

    const isOpen = ref(false);
    const inputRef = ref(null);
    const containerRef = ref(null);
    const popoverRef = ref(null);
    const listRef = ref(null);
    const placement = ref('bottom');
    const popoverStyle = ref({});
    const isTyping = ref(false);
    const highlightedIndex = ref(-1);

    const normalizeGroup = (value) => String(value || '').trim();
    const normalizeGroupForCompare = (value) => normalizeGroup(value).toLowerCase();
    const hasExistingGroup = computed(() => {
        const current = normalizeGroupForCompare(props.modelValue);
        if (!current) return false;
        return props.groups.some((group) => normalizeGroupForCompare(group) === current);
    });

    // Filter groups based on actual typing. Opening dropdown should show all groups.
    const filteredGroups = computed(() => {
        const groups = props.groups.map(normalizeGroup).filter(Boolean);
        const uniqueGroups = Array.from(new Set(groups));
        const query = isTyping.value ? normalizeGroupForCompare(props.modelValue) : '';
        if (!query) return uniqueGroups;
        return uniqueGroups.filter((group) => group.toLowerCase().includes(query));
    });

    const showCreateOption = computed(
        () => Boolean(normalizeGroup(props.modelValue)) && !hasExistingGroup.value
    );

    const isDropdownVisible = computed(
        () => isOpen.value && (filteredGroups.value.length > 0 || showCreateOption.value)
    );

    const isGroupSelected = (group) =>
        normalizeGroupForCompare(props.modelValue) === normalizeGroupForCompare(group);

    const updatePosition = () => {
        if (!inputRef.value) return;

        const rect = inputRef.value.getBoundingClientRect();
        const gap = 6;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const estimatedHeight = Math.min(popoverRef.value?.offsetHeight || 240, 260);
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        const openUpward = spaceBelow < estimatedHeight + gap + 8 && spaceAbove > spaceBelow;
        placement.value = openUpward ? 'top' : 'bottom';

        const width = rect.width;
        const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
        const isInsideModal = Boolean(
            containerRef.value?.closest('[role="dialog"][aria-modal="true"]')
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

    const open = async () => {
        if (isOpen.value) return;
        isOpen.value = true;
        highlightedIndex.value = filteredGroups.value.findIndex((group) => isGroupSelected(group));
        updatePosition();
        await nextTick();
        updatePosition();
    };

    const close = () => {
        if (!isOpen.value) return;
        isOpen.value = false;
        highlightedIndex.value = -1;
    };

    const handleInput = (e) => {
        isTyping.value = true;
        emit('update:modelValue', e.target.value);
        highlightedIndex.value = -1;
        if (!isOpen.value) {
            open();
        } else {
            nextTick(updatePosition);
        }
    };

    const handleFocus = () => {
        isTyping.value = false;
        open();
    };

    const selectGroup = (group) => {
        emit('update:modelValue', normalizeGroup(group));
        isTyping.value = false;
        close();
    };

    const toggleDropdown = () => {
        isTyping.value = false;
        if (isOpen.value) {
            close();
        } else {
            open();
        }
    };

    const handleInputKeydown = (event) => {
        if (event.key === 'Escape' && isOpen.value) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!isOpen.value) {
                event.preventDefault();
                isTyping.value = false;
                open();
                return;
            }
            const len = filteredGroups.value.length;
            if (!len) return;
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            highlightedIndex.value =
                highlightedIndex.value < 0
                    ? step > 0
                        ? 0
                        : len - 1
                    : (highlightedIndex.value + step + len) % len;
            return;
        }
        if (event.key === 'Enter') {
            if (isOpen.value && highlightedIndex.value >= 0 && filteredGroups.value[highlightedIndex.value]) {
                event.preventDefault();
                selectGroup(filteredGroups.value[highlightedIndex.value]);
            } else {
                close();
            }
        }
    };

    const handleDocumentPointerDown = (event) => {
        if (!isOpen.value) return;
        if (!containerRef.value?.contains(event.target) && !popoverRef.value?.contains(event.target)) {
            close();
        }
    };

    const detachDocumentListeners = () => {
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };

    watch(isOpen, (val) => {
        if (val) {
            document.addEventListener('pointerdown', handleDocumentPointerDown, true);
        } else {
            detachDocumentListeners();
        }
    });

    onBeforeUnmount(detachDocumentListeners);

    usePopoverGuard({
        isOpen,
        popoverRef,
        onClose: close,
        onReposition: updatePosition,
    });

    const getOptionClasses = (group, index) => {
        if (highlightedIndex.value === index) {
            return 'bg-zinc-100 dark:bg-[#27272a] text-zinc-900 dark:text-zinc-100';
        }
        if (isGroupSelected(group)) {
            return 'text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-[#27272a]';
        }
        return 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#27272a] hover:text-zinc-900 dark:hover:text-zinc-100';
    };
</script>

<template>
    <div ref="containerRef" class="relative group w-full">
        <div class="relative w-full">
            <input
                ref="inputRef"
                :value="modelValue"
                type="text"
                :placeholder="placeholder"
                class="w-full pl-9 pr-9 py-2 bg-white dark:bg-[#131515] border rounded-md focus-visible:outline-none text-sm transition-colors duration-200 h-[38px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 shadow-none"
                :class="
                    isOpen
                        ? 'border-zinc-500 dark:border-zinc-500'
                        : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 focus-visible:border-zinc-500'
                "
                @input="handleInput"
                @focus="handleFocus"
                @keydown="handleInputKeydown"
                :aria-label="placeholder"
                :aria-expanded="isDropdownVisible"
                role="combobox"
                aria-haspopup="listbox"
            />
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                <slot name="icon">
                    <Folder class="h-4 w-4" />
                </slot>
            </div>

            <!-- Arrow Icon -->
            <button
                type="button"
                data-testid="group-selector-toggle"
                tabindex="-1"
                :aria-label="placeholder"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 cursor-pointer transition-transform duration-200 hover:text-zinc-700 dark:hover:text-zinc-200"
                :class="isOpen ? 'rotate-180 text-zinc-700 dark:text-zinc-200' : ''"
                @click.stop="toggleDropdown"
            >
                <ChevronDown class="h-3.5 w-3.5" />
            </button>
        </div>

        <!-- Dropdown -->
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
                    v-if="isDropdownVisible"
                    id="group-selector-dropdown"
                    ref="popoverRef"
                    :style="popoverStyle"
                    class="select-popover rounded-md border border-zinc-200 dark:border-zinc-800 p-1"
                    :class="placement === 'top' ? 'origin-bottom' : 'origin-top'"
                >
                    <div
                        ref="listRef"
                        role="listbox"
                        class="max-h-60 overflow-y-auto overscroll-contain space-y-0.5 select-scrollbar"
                    >
                        <button
                            v-if="showCreateOption"
                            type="button"
                            role="option"
                            class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#27272a] hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors duration-100"
                            @click="selectGroup(modelValue)"
                        >
                            <span class="min-w-0 flex-1 truncate">
                                {{ t('common.createGroup', { name: modelValue }) }}
                            </span>
                        </button>
                        <button
                            v-for="(group, index) in filteredGroups"
                            :key="group"
                            type="button"
                            role="option"
                            :aria-selected="isGroupSelected(group)"
                            class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs transition-colors duration-100 group-item"
                            :class="getOptionClasses(group, index)"
                            @mouseenter="highlightedIndex = index"
                            @click="selectGroup(group)"
                        >
                            <span class="min-w-0 flex-1 truncate">{{ group }}</span>
                            <Check
                                v-if="isGroupSelected(group)"
                                class="h-3.5 w-3.5 shrink-0 text-zinc-900 dark:text-zinc-100"
                            />
                        </button>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style>
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
