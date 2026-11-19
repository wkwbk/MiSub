<script setup>
    import { computed } from 'vue';
    import { Check, Copy, Eye, FileText, Pencil, QrCode, Trash2 } from '@lucide/vue';
    import { getItemTags } from '@/utils/tags.js';
    import { useI18n } from '@/i18n/index.js';
    import Switch from '@/components/ui/Switch.vue';

    const { t } = useI18n();

    const props = defineProps({
        profile: {
            type: Object,
            required: true,
        },
        isSorting: {
            type: Boolean,
            default: false,
        },
        compact: {
            type: Boolean,
            default: false,
        },
        isSelectionMode: {
            type: Boolean,
            default: false,
        },
        isSelected: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits([
        'delete',
        'change',
        'edit',
        'open-copy',
        'preview',
        'view-logs',
        'qrcode',
        'filter-tag',
        'toggle-select',
    ]);

    const profileTags = computed(() => getItemTags(props.profile));
    const visibleTags = computed(() => profileTags.value.slice(0, 2));
    const overflowCount = computed(() => Math.max(0, profileTags.value.length - 2));

    const subscriptionCount = computed(() =>
        Array.isArray(props.profile?.subscriptions) ? props.profile.subscriptions.length : 0
    );
    const subProfileCount = computed(() =>
        Array.isArray(props.profile?.subProfiles) ? props.profile.subProfiles.length : 0
    );
    const manualNodeCount = computed(() =>
        Array.isArray(props.profile?.manualNodes) ? props.profile.manualNodes.length : 0
    );
    const isEnabled = computed(() => props.profile?.enabled !== false);
    const isPublic = computed(() => props.profile?.isPublic === true);
</script>

<template>
    <div
        class="group flex flex-col rounded-md border p-4 hover:-translate-y-1 hover:z-10 transition-all duration-200"
        :class="[
            isSelectionMode && isSelected
                ? 'border-line-strong bg-active'
                : 'border-line bg-surface',
            {
                'opacity-60': !isEnabled && !isSelectionMode,
                'cursor-pointer': isSelectionMode,
            },
        ]"
        @click="isSelectionMode ? emit('toggle-select') : null"
    >
        <div class="flex items-center justify-between" :class="compact ? 'gap-2' : 'gap-3'">
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <!-- Selection Checkbox -->
                <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
                    <div
                        class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                        :class="
                            isSelected
                                ? 'bg-accent border-accent text-accent-fg'
                                : 'border-line-strong bg-transparent'
                        "
                    >
                        <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
                    </div>
                </div>

                <span
                    class="shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                >
                    {{ t('profiles.badge') }}
                </span>

                <!-- Tags -->
                <div
                    v-if="profileTags.length > 0"
                    data-testid="profile-card-tags"
                    class="flex flex-wrap items-center gap-1.5"
                >
                    <button
                        v-for="tag in visibleTags"
                        :key="tag"
                        type="button"
                        data-testid="profile-tag-badge"
                        class="max-w-[96px] sm:max-w-[110px] shrink-0 truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
                        :title="tag"
                        @click.stop="emit('filter-tag', tag)"
                    >
                        {{ tag }}
                    </button>
                    <span
                        v-if="overflowCount > 0"
                        class="shrink-0 rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle"
                        :title="profileTags.join(', ')"
                    >
                        +{{ overflowCount }}
                    </span>
                </div>

                <span
                    v-if="!isEnabled"
                    class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-zinc-500"></span>
                    {{ t('profiles.disabled') }}
                </span>
                <span
                    v-else-if="isPublic"
                    class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {{ t('profiles.public') }}
                </span>
            </div>

            <div
                v-if="!isSelectionMode"
                class="shrink-0 flex items-center gap-1 opacity-100 md:opacity-65 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200"
            >
                <button
                    @click.stop="emit('preview')"
                    class="p-1.5 rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.previewNodes')"
                    :aria-label="t('actions.previewNodes')"
                >
                    <Eye class="w-4 h-4" />
                </button>
                <button
                    @click.stop="emit('qrcode')"
                    class="p-1.5 rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.showQrCode')"
                    :aria-label="t('actions.showQrCode')"
                >
                    <QrCode class="w-4 h-4" stroke-width="1.5" />
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="p-1.5 rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <Pencil class="w-4 h-4" />
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="p-1.5 rounded-md border border-transparent hover:border-red-900/60 hover:bg-red-950/40 text-fg-muted hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <Trash2 class="w-4 h-4" />
                </button>
            </div>
        </div>

        <p
            class="mt-2 truncate text-base font-semibold leading-snug text-fg"
            :title="profile.name"
        >
            {{ profile.name }}
        </p>

        <p
            class="mt-1.5 text-xs font-mono text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1"
        >
            <span>
                {{
                    t('profiles.counts', {
                        subscriptions: subscriptionCount,
                        nodes: manualNodeCount,
                    })
                }}
            </span>
            <span class="text-fg-subtle" aria-hidden="true">·</span>
            <span>
                {{ t('profiles.downloadCount', { count: profile.downloadCount || 0 }) }}
            </span>
            <span
                v-if="subProfileCount > 0"
                class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-line bg-transparent text-[11px] font-mono text-fg-muted"
            >
                {{ t('profileModal.subProfilesCountBadge', { count: subProfileCount }) }}
            </span>
        </p>

        <div
            class="mt-3 grid gap-2.5 rounded-md border border-line bg-transparent p-3 text-xs"
            :class="{ 'pointer-events-none': isSelectionMode }"
        >
            <div class="flex items-center justify-between gap-3 text-fg-muted">
                <span>{{ t('profiles.enabledStatus') }}</span>
                <Switch
                    :model-value="isEnabled"
                    @update:model-value="(val) => $emit('change', { ...profile, enabled: val })"
                    :label="t('profiles.enable')"
                />
            </div>
            <div class="flex items-center justify-between gap-3 text-fg-muted">
                <span>{{ t('profiles.publicAccess') }}</span>
                <Switch
                    :model-value="isPublic"
                    @update:model-value="(val) => $emit('change', { ...profile, isPublic: val })"
                    :label="t('profiles.publicSwitch')"
                />
            </div>
        </div>

        <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
            :class="[compact ? 'items-stretch' : '', { 'pointer-events-none': isSelectionMode }]"
        >
            <div class="flex items-center gap-2 sm:gap-4" :class="compact ? 'flex-1' : ''">
                <button
                    @click="emit('open-copy')"
                    class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:opacity-90 border border-accent"
                    :class="compact ? 'w-full justify-center' : ''"
                >
                    <Copy class="h-3.5 w-3.5" />
                    {{ t('profiles.copySubscription') }}
                </button>
            </div>
            <div class="flex items-center gap-1.5 transition-opacity duration-200">
                <button
                    @click.stop="emit('view-logs')"
                    class="inline-flex items-center gap-1 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
                    :title="t('actions.viewLogs')"
                >
                    <FileText class="h-3.5 w-3.5" />
                    {{ t('actions.viewLog') }}
                </button>
            </div>
        </div>
    </div>
</template>
