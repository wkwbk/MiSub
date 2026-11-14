<script setup>
    import { computed } from 'vue';
    import { Search } from 'lucide-vue-next';
    import ProfileCard from './ProfileCard.vue';
    import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
    import PanelPagination from '@/components/shared/PanelPagination.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        profiles: Array,
        paginatedProfiles: {
            type: Array,
            default: () => [],
        },
        currentPage: Number,
        totalPages: Number,
        isSorting: {
            type: Boolean,
            default: false,
        },
        compact: {
            type: Boolean,
            default: false,
        },
        searchable: { type: Boolean, default: false },
        searchQuery: { type: String, default: '' },
        filteredCount: { type: Number, default: undefined },
    });

    const emit = defineEmits([
        'add',
        'edit',
        'delete',
        'deleteAll',
        'toggle',
        'openCopy',
        'preview',
        'reorder',
        'changePage',
        'viewLogs',
        'qrcode',
        'toggle-sort',
        'updateSearch',
    ]);

    const searchModel = computed({
        get: () => props.searchQuery,
        set: (value) => emit('updateSearch', value),
    });

    const visibleCount = computed(() => props.filteredCount ?? props.profiles.length);

    const displayProfiles = computed(() => {
        if (props.isSorting) {
            return props.profiles || [];
        }

        if (props.paginatedProfiles && props.paginatedProfiles.length > 0) {
            return props.paginatedProfiles;
        }

        if (props.totalPages !== undefined) {
            return props.paginatedProfiles || [];
        }
        return props.profiles || [];
    });

    const handleEdit = (profileId) => emit('edit', profileId);
    const handleDelete = (profileId) => emit('delete', profileId);
    const handleToggle = (event) => emit('toggle', event);
    const handleOpenCopy = (profileId) => emit('openCopy', profileId);
    const handlePreview = (profileId) => emit('preview', profileId);
    const handleAdd = () => emit('add');
    const handleChangePage = (page) => emit('changePage', page);
    const handleDeleteAll = () => emit('deleteAll');
    const handleToggleSort = () => emit('toggle-sort');

    const handleQRCode = (profileId) => emit('qrcode', profileId);

    // 始终基于真实 profile id 排序，避免分页视图把页内索引用到全量列表上。
    const handleMoveUp = (profileId) => {
        const index = props.profiles.findIndex(
            (profile) => profile.id === profileId || profile.customId === profileId
        );
        if (index > 0) {
            emit('reorder', profileId, 'up');
        }
    };

    const handleMoveDown = (profileId) => {
        const index = props.profiles.findIndex(
            (profile) => profile.id === profileId || profile.customId === profileId
        );
        if (index !== -1 && index < props.profiles.length - 1) {
            emit('reorder', profileId, 'down');
        }
    };
</script>

<template>
    <div>
        <div class="list-item-animation mb-4" style="--delay-index: 0">
            <div
                class="rounded-md border border-zinc-800 bg-[#171717] shadow-none"
                :class="[
                    compact ? 'p-3' : 'p-4',
                    !compact && searchable ? 'flex flex-col justify-between md:min-h-[132px]' : '',
                ]"
            >
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-3 shrink-0">
                            <h2 class="text-lg font-semibold text-zinc-100">
                                {{ t('profiles.title') }}
                            </h2>
                            <span
                                class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-zinc-300"
                                >{{ profiles.length }}</span
                            >
                        </div>
                        <p class="mt-1 text-xs text-zinc-400">
                            {{ t('profiles.subtitle') }}
                        </p>
                    </div>
                    <div class="flex items-center gap-2 sm:w-auto justify-end sm:justify-start shrink-0">
                        <button
                            @click="handleAdd"
                            class="shrink-0 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
                        >
                            {{ t('actions.add') }}
                        </button>
                        <MoreActionsMenu :teleport-to-body="true" menu-width-class="w-36">
                            <template #menu="{ close }">
                                <button
                                    @click="
                                        handleToggleSort();
                                        close();
                                    "
                                    class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                                >
                                    {{
                                        isSorting
                                            ? t('actions.finishSort')
                                            : t('actions.manualSort')
                                    }}
                                </button>
                                <div class="my-1 border-t border-zinc-200 dark:border-white/10"></div>
                                <button
                                    @click="
                                        handleDeleteAll();
                                        close();
                                    "
                                    class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                                >
                                    {{ t('actions.clearAll') }}
                                </button>
                            </template>
                        </MoreActionsMenu>
                    </div>
                </div>
                <div v-if="searchable" class="relative mt-4">
                    <Search
                        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                        aria-hidden="true"
                    />
                    <input
                        v-model="searchModel"
                        data-testid="profile-search"
                        type="search"
                        :placeholder="t('profiles.listSearchPlaceholder')"
                        :aria-label="t('profiles.searchPlaceholder')"
                        :disabled="isSorting"
                        class="w-full rounded-md border border-zinc-800 bg-transparent py-2 pl-9 pr-20 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-zinc-500"
                    />
                    <span
                        v-if="searchQuery"
                        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400"
                    >
                        {{ visibleCount }}/{{ profiles.length }}
                    </span>
                </div>
            </div>
        </div>
        <div v-if="profiles.length > 0">
            <div
                v-if="isSorting"
                class="mb-4 flex items-center gap-2 rounded-md border border-zinc-800 bg-[#171717] px-4 py-3 text-xs text-zinc-300"
            >
                <span class="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0"></span>
                {{ t('profiles.sortingHint') }}
            </div>
            <div
                class="grid gap-4"
                :class="
                    compact
                        ? 'grid-cols-1'
                        : displayProfiles.length > 1
                          ? 'grid-cols-1 md:grid-cols-2'
                          : 'grid-cols-1'
                "
            >
                <div
                    v-for="(profile, index) in displayProfiles"
                    :key="profile.id"
                    class="list-item-animation"
                    :style="{ '--delay-index': index + 1 }"
                >
                    <ProfileCard
                        :profile="profile"
                        :is-sorting="isSorting"
                        :compact="compact"
                        @edit="handleEdit(profile.id)"
                        @delete="handleDelete(profile.id)"
                        @change="handleToggle($event)"
                        @preview="handlePreview(profile.id)"
                        @qrcode="handleQRCode(profile.id)"
                        @move-up="handleMoveUp(profile.id)"
                        @move-down="handleMoveDown(profile.id)"
                        @view-logs="emit('viewLogs', profile.id)"
                        @open-copy="handleOpenCopy(profile.id)"
                    />
                </div>
            </div>
            <div
                v-if="!isSorting && displayProfiles.length === 0"
                class="rounded-md border border-zinc-800 bg-[#171717] px-6 py-12 text-center"
            >
                <p class="text-sm font-medium text-zinc-200">
                    {{ t('profiles.noSearchResults') }}
                </p>
                <button
                    type="button"
                    class="mt-3 text-xs font-medium text-zinc-200 hover:text-white underline underline-offset-2"
                    @click="searchModel = ''"
                >
                    {{ t('actions.clearSearch') }}
                </button>
            </div>
            <PanelPagination
                v-if="
                    !isSorting &&
                    totalPages > 1 &&
                    paginatedProfiles &&
                    paginatedProfiles.length > 0
                "
                variant="panel"
                :current-page="currentPage"
                :total-pages="totalPages"
                :total-items="visibleCount"
                :show-total-items="true"
                @change-page="handleChangePage"
            />
        </div>
        <div
            v-else
            class="rounded-md border border-zinc-800 bg-[#171717] py-2"
        >
            <EmptyState
                :title="t('profiles.empty')"
                :description="t('profiles.emptyDesc')"
                icon="folder"
                :total-count="0"
            />
        </div>
    </div>
</template>
