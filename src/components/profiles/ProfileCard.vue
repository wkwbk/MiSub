<script setup>
    import { computed } from 'vue';
    import { useI18n } from '../../i18n/index.js';
    import Switch from '../ui/Switch.vue';

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
    });

    const emit = defineEmits([
        'delete',
        'change',
        'edit',
        'open-copy',
        'preview',
        'move-up',
        'move-down',
        'view-logs',
        'qrcode',
    ]);

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
        class="group flex min-h-[180px] flex-col rounded-md border border-zinc-800 bg-[#0c0c0e] shadow-none transition-colors duration-150 hover:border-zinc-700"
        :class="[compact ? 'p-4' : 'p-5', { 'opacity-60': !isEnabled }]"
    >
        <div class="flex items-start justify-between gap-3" :class="compact ? 'flex-col' : ''">
            <div class="min-w-0 flex-1 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span
                        class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
                    >
                        {{ t('profiles.badge') }}
                    </span>
                    <span
                        v-if="!isEnabled"
                        class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-400"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-zinc-500"></span>
                        {{ t('profiles.disabled') }}
                    </span>
                    <span
                        v-else-if="isPublic"
                        class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-[10px] font-mono text-zinc-300"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        {{ t('profiles.public') }}
                    </span>
                </div>
                <p
                    class="truncate text-base font-semibold text-zinc-100"
                    :title="profile.name"
                >
                    {{ profile.name }}
                </p>
                <p
                    class="text-xs font-mono text-zinc-400 flex flex-wrap items-center gap-1.5"
                >
                    <span>
                        {{
                            t('profiles.counts', {
                                subscriptions: subscriptionCount,
                                nodes: manualNodeCount,
                            })
                        }}
                    </span>
                    <span
                        v-if="subProfileCount > 0"
                        class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-800 bg-transparent text-[11px] font-mono text-zinc-300"
                    >
                        {{ t('profileModal.subProfilesCountBadge', { count: subProfileCount }) }}
                    </span>
                </p>
            </div>

            <div
                class="shrink-0 flex items-center gap-1 opacity-100 transition-opacity duration-200"
                :class="compact ? 'self-end flex-wrap justify-end' : ''"
            >
                <button
                    @click.stop="emit('preview')"
                    class="p-2 rounded-md border border-transparent hover:border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.previewNodes')"
                    :aria-label="t('actions.previewNodes')"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                    </svg>
                </button>
                <button
                    @click.stop="emit('qrcode')"
                    class="p-2 rounded-md border border-transparent hover:border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.showQrCode')"
                    :aria-label="t('actions.showQrCode')"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z"
                        />
                    </svg>
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="p-2 rounded-md border border-transparent hover:border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"
                        />
                    </svg>
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="p-2 rounded-md border border-transparent hover:border-red-900/60 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <div
            class="mt-4 grid gap-3 rounded-md border border-zinc-800 bg-transparent p-3 text-xs"
        >
            <div class="flex items-center justify-between gap-3 text-zinc-300">
                <span>{{ t('profiles.enabledStatus') }}</span>
                <Switch
                    :model-value="isEnabled"
                    @update:model-value="(val) => $emit('change', { ...profile, enabled: val })"
                    :label="t('profiles.enable')"
                />
            </div>
            <div class="flex items-center justify-between gap-3 text-zinc-300">
                <span>{{ t('profiles.publicAccess') }}</span>
                <Switch
                    :model-value="isPublic"
                    @update:model-value="(val) => $emit('change', { ...profile, isPublic: val })"
                    :label="t('profiles.publicSwitch')"
                />
            </div>
            <div
                class="flex items-center justify-between gap-3 text-xs font-mono text-zinc-400"
            >
                <span>{{
                    t('profiles.downloadCount', { count: profile.downloadCount || 0 })
                }}</span>
                <button
                    @click.stop="emit('view-logs')"
                    class="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-transparent px-2 py-1 text-xs font-sans font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    :title="t('actions.viewLogs')"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    {{ t('actions.viewLog') }}
                </button>
            </div>
        </div>

        <div
            class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3"
            :class="compact ? 'items-stretch' : ''"
        >
            <div class="flex items-center gap-2 sm:gap-4">
                <button
                    @click="emit('open-copy')"
                    class="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
                    :class="compact ? 'w-full justify-center' : ''"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>
                    {{ t('profiles.copySubscription') }}
                </button>
            </div>
            <div class="flex items-center gap-1 transition-opacity duration-200">
                <template v-if="isSorting">
                    <button
                        @click="emit('move-up')"
                        class="p-1.5 rounded-md border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 touch-target"
                        :title="t('actions.moveUp')"
                        :aria-label="t('actions.moveUp')"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M5 15l7-7 7 7"
                            />
                        </svg>
                    </button>
                    <button
                        @click="emit('move-down')"
                        class="p-1.5 rounded-md border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 touch-target"
                        :title="t('actions.moveDown')"
                        :aria-label="t('actions.moveDown')"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                    </button>
                </template>
            </div>
        </div>
    </div>
</template>
