<script setup>
    import { computed } from 'vue';
    import { GripHorizontal, Search, X } from '@lucide/vue';
    import draggable from 'vuedraggable';
    import TagFilterBar from '@/components/shared/TagFilterBar.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        subscriptions: {
            type: Array,
            default: () => [],
        },
        filteredSubscriptions: {
            type: Array,
            default: () => [],
        },
        searchTerm: {
            type: String,
            default: '',
        },
        activeTagFilters: {
            type: Array,
            default: () => [],
        },
        tags: {
            type: Array,
            default: () => [],
        },
        selectedIds: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits([
        'update:searchTerm',
        'update:tagFilters',
        'update:selectedIds',
        'toggle-selection',
        'select-all',
        'deselect-all',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });

    const orderedSelectedSubs = computed({
        get() {
            const subMap = new Map(props.subscriptions.map((s) => [s.id, s]));
            return props.selectedIds.map((id) => subMap.get(id)).filter(Boolean);
        },
        set(newList) {
            const availableIds = new Set(props.subscriptions.map((sub) => sub.id));
            const reorderedIds = newList.map((sub) => sub.id);
            let reorderedIndex = 0;

            const mergedIds = props.selectedIds
                .map((id) => {
                    if (!availableIds.has(id)) return id;
                    return reorderedIds[reorderedIndex++];
                })
                .filter(Boolean);

            if (reorderedIndex < reorderedIds.length) {
                mergedIds.push(...reorderedIds.slice(reorderedIndex));
            }

            emit('update:selectedIds', mergedIds);
        },
    });
</script>

<template>
    <div v-if="subscriptions.length > 0" class="space-y-2">
        <div class="flex justify-between items-center gap-2 h-6">
            <h4 class="text-xs font-semibold text-fg-muted truncate">
                {{ t('profileModal.selectSubscriptions') }}
            </h4>
            <div class="space-x-2 shrink-0 whitespace-nowrap">
                <button
                    type="button"
                    @click="emit('select-all')"
                    class="text-xs text-fg-muted hover:text-white hover:underline"
                >
                    {{ t('profileModal.selectAll') }}
                </button>
                <button
                    type="button"
                    @click="emit('deselect-all')"
                    class="text-xs text-fg-muted hover:text-white hover:underline"
                >
                    {{ t('profileModal.deselectAll') }}
                </button>
            </div>
        </div>
        <!-- Tag Filter Bar -->
        <div class="flex items-center h-8">
            <TagFilterBar
                :tags="tags"
                :active-filters="activeTagFilters"
                always-show
                test-id-prefix="sub-selector-tag"
                @update:active-filters="emit('update:tagFilters', $event)"
            />
        </div>
        <div class="relative">
            <input
                type="text"
                v-model="searchModel"
                :placeholder="t('subscriptions.searchPlaceholder')"
                class="w-full pl-9 pr-3 py-1.5 text-xs bg-inset border border-line rounded-md shadow-none text-fg placeholder:text-fg-subtle focus-visible:outline-hidden focus:border-line-strong"
                :aria-label="t('subscriptions.searchPlaceholder')"
            />
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
        </div>
        <div
            class="overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line h-36 lg:h-64"
        >
            <div v-for="sub in filteredSubscriptions" :key="sub.id">
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        :checked="selectedIds.includes(sub.id)"
                        @change="emit('toggle-selection', sub.id)"
                        class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
                    />
                    <span class="text-xs text-fg truncate" :title="sub.name">{{
                        sub.name || t('subscriptions.unnamed')
                    }}</span>
                </label>
            </div>
            <div
                v-if="filteredSubscriptions.length === 0"
                class="text-center text-fg-subtle text-xs py-4"
            >
                {{ t('profileModal.noMatchedSubscriptions') }}
            </div>
        </div>

        <div v-if="orderedSelectedSubs.length > 0" class="mt-3">
            <div class="flex justify-between items-center mb-1.5">
                <h5 class="text-xs font-medium text-fg-muted">
                    {{ t('profileModal.selectedDrag', { count: orderedSelectedSubs.length }) }}
                </h5>
            </div>
            <draggable
                v-model="orderedSelectedSubs"
                item-key="id"
                handle=".drag-handle"
                ghost-class="opacity-40"
                class="space-y-1 p-2 bg-transparent rounded-md border border-line h-32 lg:h-48 overflow-y-auto"
            >
                <template #item="{ element, index }">
                    <div
                        class="flex items-center gap-2 px-2 py-1.5 bg-inset rounded-md border border-line shadow-none"
                    >
                        <span
                            class="drag-handle cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg-muted"
                        >
                            <GripHorizontal class="w-4 h-4" />
                        </span>
                        <span class="font-mono text-xs font-medium text-fg-muted w-5">{{
                            index + 1
                        }}</span>
                        <span class="text-xs text-fg truncate flex-1" :title="element.name">
                            {{ element.name || t('subscriptions.unnamed') }}
                        </span>
                        <button
                            type="button"
                            @click="emit('toggle-selection', element.id)"
                            class="text-fg-subtle hover:text-red-400 transition-colors"
                            :title="t('profileModal.remove')"
                            :aria-label="t('profileModal.remove')"
                        >
                            <X class="w-4 h-4" />
                        </button>
                    </div>
                </template>
            </draggable>
        </div>
    </div>
    <div
        v-else
        class="text-center text-xs text-fg-subtle p-4 bg-transparent border border-line rounded-md flex items-center justify-center h-full"
    >
        {{ t('profileModal.noAvailableSubscriptions') }}
    </div>
</template>
