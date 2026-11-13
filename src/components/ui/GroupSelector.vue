<script setup>
    import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
    import { Folder, ChevronDown, Check } from 'lucide-vue-next';
    import { t } from '@/i18n/index.js';

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
    const dropdownStyle = ref({ top: '0px', left: '0px', width: '0px' });
    const isTyping = ref(false);

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

    const updatePosition = () => {
        if (inputRef.value) {
            const rect = inputRef.value.getBoundingClientRect();
            const isInsideModal = Boolean(
                containerRef.value?.closest('[role="dialog"][aria-modal="true"]')
            );
            dropdownStyle.value = {
                top: `${rect.bottom + window.scrollY + 4}px`,
                left: `${rect.left + window.scrollX}px`,
                width: `${rect.width}px`,
                zIndex: isInsideModal ? 'var(--z-modal-popover)' : 'var(--z-popover)',
            };
        }
    };

    const handleInput = (e) => {
        isTyping.value = true;
        emit('update:modelValue', e.target.value);
        isOpen.value = true;
    };

    const handleFocus = () => {
        isTyping.value = false;
        isOpen.value = true;
    };

    const selectGroup = (group) => {
        emit('update:modelValue', normalizeGroup(group));
        isTyping.value = false;
        isOpen.value = false;
    };

    const toggleDropdown = () => {
        isTyping.value = false;
        isOpen.value = !isOpen.value;
    };

    const handleClickOutside = (e) => {
        if (containerRef.value && !containerRef.value.contains(e.target)) {
            // Check if clicking inside the dropdown (which is teleported)
            const dropdownEl = document.getElementById('group-selector-dropdown');
            if (dropdownEl && dropdownEl.contains(e.target)) {
                return;
            }
            isOpen.value = false;
        }
    };

    const handleScroll = () => {
        if (isOpen.value) {
            updatePosition();
        }
    };

    watch(isOpen, (val) => {
        if (val) {
            nextTick(() => {
                updatePosition();
                window.addEventListener('scroll', handleScroll, true);
                window.addEventListener('resize', updatePosition);
            });
        } else {
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', updatePosition);
        }
    });

    onMounted(() => {
        document.addEventListener('click', handleClickOutside, true);
    });

    onUnmounted(() => {
        document.removeEventListener('click', handleClickOutside, true);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', updatePosition);
    });
</script>

<template>
    <div ref="containerRef" class="relative group w-full">
        <div class="relative w-full">
            <input
                ref="inputRef"
                :value="modelValue"
                type="text"
                :placeholder="placeholder"
                class="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131515] border border-zinc-300 dark:border-zinc-800 rounded-md focus-visible:outline-hidden focus:border-zinc-500 text-sm transition-colors h-[38px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 shadow-none"
                @input="handleInput"
                @focus="handleFocus"
                @keydown.enter="isOpen = false"
                :aria-label="placeholder"
            />
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                <slot name="icon">
                    <Folder class="h-4 w-4" />
                </slot>
            </div>

            <!-- Arrow Icon -->
            <div
                data-testid="group-selector-toggle"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 cursor-pointer transition-transform duration-200 hover:text-zinc-700 dark:hover:text-zinc-300"
                :class="{ 'rotate-180': isOpen }"
                @click.stop="toggleDropdown"
            >
                <ChevronDown class="h-4 w-4" />
            </div>
        </div>

        <!-- Dropdown -->
        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <div
                    v-if="isOpen && (groups.length > 0 || modelValue)"
                    id="group-selector-dropdown"
                    class="absolute bg-white dark:bg-[#171717] rounded-md shadow-none border border-zinc-200 dark:border-zinc-800 max-h-60 overflow-auto py-1"
                    :style="dropdownStyle"
                >
                    <button
                        v-if="normalizeGroup(modelValue) && !hasExistingGroup"
                        class="w-full text-left pl-9 pr-4 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 block transition-colors"
                        @click="selectGroup(modelValue)"
                    >
                        {{ t('common.createGroup', { name: modelValue }) }}
                    </button>
                    <button
                        v-for="group in filteredGroups"
                        :key="group"
                        class="w-full text-left pl-9 pr-4 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center justify-between group-item"
                        :class="{
                            'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium':
                                modelValue === group,
                        }"
                        @click="selectGroup(group)"
                    >
                        <span>{{ group }}</span>
                        <Check v-if="modelValue === group" class="h-4 w-4" />
                    </button>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>
