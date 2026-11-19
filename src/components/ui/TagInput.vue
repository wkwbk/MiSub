<script setup>
    import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
    import { Check, ChevronDown, Plus, Tag, X } from '@lucide/vue';
    import { t } from '@/i18n/index.js';
    import { usePopoverGuard } from '@/composables/usePopoverGuard.js';
    import { normalizeTagList, normalizeTagName } from '@/utils/tags.js';

    const props = defineProps({
        modelValue: {
            type: Array,
            default: () => [],
        },
        suggestions: {
            type: Array,
            default: () => [],
        },
        placeholder: {
            type: String,
            default: () => t('tags.placeholder'),
        },
    });

    const emit = defineEmits(['update:modelValue']);

    const isOpen = ref(false);
    const inputText = ref('');
    const inputRef = ref(null);
    const containerRef = ref(null);
    const popoverRef = ref(null);
    const placement = ref('bottom');
    const popoverStyle = ref({});
    const highlightedIndex = ref(-1);

    const selectedTags = computed(() => normalizeTagList(props.modelValue));
    const selectedTagSet = computed(() => new Set(selectedTags.value));

    const availableSuggestions = computed(() => {
        const all = normalizeTagList(props.suggestions);
        const query = inputText.value.trim().toLowerCase();
        if (!query) return all;
        return all.filter((tag) => tag.toLowerCase().includes(query));
    });

    const typedNormalized = computed(() => normalizeTagName(inputText.value));
    const showCreateOption = computed(() => {
        const candidate = typedNormalized.value;
        if (!candidate) return false;
        const lower = candidate.toLowerCase();
        return (
            !selectedTags.value.some((tag) => tag.toLowerCase() === lower) &&
            !availableSuggestions.value.some((tag) => tag.toLowerCase() === lower)
        );
    });

    const dropdownItems = computed(() => {
        const items = availableSuggestions.value.map((tag) => ({
            type: 'existing',
            value: tag,
        }));
        if (showCreateOption.value) {
            items.push({
                type: 'create',
                value: typedNormalized.value,
            });
        }
        return items;
    });

    const isDropdownVisible = computed(() => isOpen.value && dropdownItems.value.length > 0);

    const updateTags = (nextList) => {
        emit('update:modelValue', normalizeTagList(nextList));
    };

    const addTag = (rawTag) => {
        const normalized = normalizeTagName(rawTag);
        if (!normalized) return;
        if (!selectedTagSet.value.has(normalized)) {
            updateTags([...selectedTags.value, normalized]);
        }
        inputText.value = '';
        highlightedIndex.value = -1;
        nextTick(updatePosition);
    };

    const toggleTag = (tag) => {
        const normalized = normalizeTagName(tag);
        if (!normalized) return;
        if (selectedTagSet.value.has(normalized)) {
            updateTags(selectedTags.value.filter((item) => item !== normalized));
        } else {
            updateTags([...selectedTags.value, normalized]);
        }
        inputText.value = '';
        nextTick(updatePosition);
    };

    const removeTag = (tag) => {
        updateTags(selectedTags.value.filter((item) => item !== tag));
        nextTick(updatePosition);
    };

    const updatePosition = () => {
        if (!containerRef.value) return;

        const rect = containerRef.value.getBoundingClientRect();
        const gap = 6;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const estimatedHeight = Math.min(popoverRef.value?.offsetHeight || 220, 260);
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
        highlightedIndex.value = -1;
        updatePosition();
        await nextTick();
        updatePosition();
    };

    const close = () => {
        if (!isOpen.value) return;
        isOpen.value = false;
        highlightedIndex.value = -1;
    };

    const focusInput = () => {
        inputRef.value?.focus();
        open();
    };

    const handleInput = (e) => {
        const val = e.target.value;
        if (val.includes(',') || val.includes('，')) {
            const parts = val.split(/[,，]/);
            const trailing = parts.pop() || '';
            const toAdd = normalizeTagList(parts);
            if (toAdd.length > 0) {
                updateTags([...selectedTags.value, ...toAdd]);
            }
            inputText.value = trailing;
        } else {
            inputText.value = val;
        }
        highlightedIndex.value = -1;
        if (!isOpen.value) {
            open();
        } else {
            nextTick(updatePosition);
        }
    };

    const handleBlur = () => {
        // 失焦时若输入框有未提交的文本，延迟自动收拢为标签（避开下拉点击）
        setTimeout(() => {
            if (!isOpen.value && typedNormalized.value) {
                addTag(typedNormalized.value);
            }
        }, 120);
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape' && isOpen.value) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }

        if (event.key === 'Backspace' && !inputText.value && selectedTags.value.length > 0) {
            event.preventDefault();
            const next = selectedTags.value.slice(0, -1);
            updateTags(next);
            nextTick(updatePosition);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!isOpen.value) {
                event.preventDefault();
                open();
                return;
            }
            const len = dropdownItems.value.length;
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
            if (
                isOpen.value &&
                highlightedIndex.value >= 0 &&
                dropdownItems.value[highlightedIndex.value]
            ) {
                event.preventDefault();
                event.stopPropagation();
                const item = dropdownItems.value[highlightedIndex.value];
                if (item.type === 'create') {
                    addTag(item.value);
                } else {
                    toggleTag(item.value);
                }
                return;
            }
            if (typedNormalized.value) {
                event.preventDefault();
                event.stopPropagation();
                addTag(typedNormalized.value);
            }
        }
    };

    const toggleDropdown = () => {
        if (isOpen.value) {
            close();
        } else {
            inputRef.value?.focus();
            open();
        }
    };

    const handleDocumentPointerDown = (event) => {
        if (!isOpen.value) return;
        if (
            !containerRef.value?.contains(event.target) &&
            !popoverRef.value?.contains(event.target)
        ) {
            if (typedNormalized.value) {
                addTag(typedNormalized.value);
            }
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
</script>

<template>
    <div ref="containerRef" class="relative w-full">
        <div
            class="flex min-h-[38px] w-full flex-wrap items-center gap-1.5 rounded-md border bg-inset pl-8 pr-8 py-1.5 text-sm transition-colors duration-200 cursor-text"
            :class="isOpen ? 'border-line-strong' : 'border-line hover:border-line-strong'"
            @click="focusInput"
        >
            <div class="pointer-events-none absolute left-2.5 top-2.5 text-fg-subtle">
                <slot name="icon">
                    <Tag class="h-4 w-4" />
                </slot>
            </div>

            <span
                v-for="tag in selectedTags"
                :key="tag"
                data-testid="tag-input-chip"
                class="inline-flex max-w-[180px] items-center gap-1 rounded border border-line bg-active px-2 py-0.5 text-xs font-medium text-fg"
            >
                <span class="truncate">{{ tag }}</span>
                <button
                    type="button"
                    class="rounded-sm text-fg-subtle hover:text-fg focus:outline-none cursor-pointer"
                    :aria-label="`${t('actions.delete')} ${tag}`"
                    @click.stop="removeTag(tag)"
                >
                    <X class="h-3 w-3" />
                </button>
            </span>

            <input
                ref="inputRef"
                :value="inputText"
                type="text"
                :placeholder="selectedTags.length === 0 ? placeholder : ''"
                class="min-w-[80px] flex-1 bg-transparent text-xs text-fg placeholder:text-fg-subtle focus:outline-none py-0.5"
                :aria-label="placeholder"
                :aria-expanded="isDropdownVisible"
                role="combobox"
                aria-haspopup="listbox"
                @input="handleInput"
                @focus="open"
                @blur="handleBlur"
                @keydown="handleKeydown"
            />

            <button
                type="button"
                tabindex="-1"
                class="absolute right-2 top-2 rounded p-0.5 text-fg-subtle hover:text-fg transition-colors cursor-pointer"
                @mousedown.prevent="toggleDropdown"
            >
                <ChevronDown
                    class="h-4 w-4 transition-transform duration-200"
                    :class="{ 'rotate-180': isDropdownVisible }"
                />
            </button>
        </div>

        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-if="isDropdownVisible"
                    ref="popoverRef"
                    :style="popoverStyle"
                    data-testid="tag-input-dropdown"
                    role="listbox"
                    class="popover-surface max-h-56 overflow-y-auto rounded-md p-1"
                >
                    <button
                        v-for="(item, index) in dropdownItems"
                        :key="`${item.type}:${item.value}`"
                        type="button"
                        role="option"
                        :aria-selected="selectedTagSet.has(item.value)"
                        class="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer"
                        :class="
                            highlightedIndex === index
                                ? 'bg-active text-fg'
                                : 'text-fg-muted hover:bg-hover hover:text-fg'
                        "
                        @mousedown.prevent="
                            item.type === 'create' ? addTag(item.value) : toggleTag(item.value)
                        "
                    >
                        <span v-if="item.type === 'create'" class="flex items-center gap-1.5 truncate font-medium">
                            <Plus class="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span class="truncate">{{
                                t('tags.createOption', { name: item.value })
                            }}</span>
                        </span>
                        <span v-else class="truncate">{{ item.value }}</span>

                        <Check
                            v-if="item.type === 'existing' && selectedTagSet.has(item.value)"
                            class="h-3.5 w-3.5 shrink-0 text-fg"
                        />
                    </button>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
