<script setup>
    import { computed } from 'vue';
    import {
        Eye,
        QrCode,
        Pencil,
        Trash2,
        FileText,
        Copy,
    } from '@lucide/vue';
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
    });

    const emit = defineEmits([
        'delete',
        'change',
        'edit',
        'open-copy',
        'preview',
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
        class="group flex flex-col rounded-md border border-zinc-800 bg-[#171717] p-4 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:-translate-y-1 hover:z-10 transition-all duration-200"
        :class="{ 'opacity-60': !isEnabled }"
    >
        <div class="flex items-center justify-between" :class="compact ? 'gap-2' : 'gap-3'">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
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

            <div
                class="shrink-0 flex items-center gap-1 opacity-100 md:opacity-65 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200"
            >
                <button
                    @click.stop="emit('preview')"
                    class="p-1.5 rounded-md border border-transparent hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.previewNodes')"
                    :aria-label="t('actions.previewNodes')"
                >
                    <Eye class="w-4 h-4" />
                </button>
                <button
                    @click.stop="emit('qrcode')"
                    class="p-1.5 rounded-md border border-transparent hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.showQrCode')"
                    :aria-label="t('actions.showQrCode')"
                >
                    <QrCode class="w-4 h-4" stroke-width="1.5" />
                </button>
                <button
                    @click.stop="emit('edit')"
                    class="p-1.5 rounded-md border border-transparent hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.edit')"
                    :aria-label="t('actions.edit')"
                >
                    <Pencil class="w-4 h-4" />
                </button>
                <button
                    @click.stop="emit('delete')"
                    class="p-1.5 rounded-md border border-transparent hover:border-red-900/60 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 flex items-center justify-center"
                    :title="t('actions.delete')"
                    :aria-label="t('actions.delete')"
                >
                    <Trash2 class="w-4 h-4" />
                </button>
            </div>
        </div>

        <p
            class="mt-2 truncate text-base font-semibold leading-snug text-zinc-100"
            :title="profile.name"
        >
            {{ profile.name }}
        </p>

        <p
            class="mt-1.5 text-xs font-mono text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1"
        >
            <span>
                {{
                    t('profiles.counts', {
                        subscriptions: subscriptionCount,
                        nodes: manualNodeCount,
                    })
                }}
            </span>
            <span class="text-zinc-600" aria-hidden="true">·</span>
            <span>
                {{
                    t('profiles.downloadCount', { count: profile.downloadCount || 0 })
                }}
            </span>
            <span
                v-if="subProfileCount > 0"
                class="inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-800 bg-transparent text-[11px] font-mono text-zinc-300"
            >
                {{ t('profileModal.subProfilesCountBadge', { count: subProfileCount }) }}
            </span>
        </p>

        <div
            class="mt-3 grid gap-2.5 rounded-md border border-zinc-800 bg-transparent p-3 text-xs"
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
        </div>

        <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3"
            :class="compact ? 'items-stretch' : ''"
        >
            <div class="flex items-center gap-2 sm:gap-4" :class="compact ? 'flex-1' : ''">
                <button
                    @click="emit('open-copy')"
                    class="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
                    :class="compact ? 'w-full justify-center' : ''"
                >
                    <Copy class="h-3.5 w-3.5" />
                    {{ t('profiles.copySubscription') }}
                </button>
            </div>
            <div class="flex items-center gap-1.5 transition-opacity duration-200">
                <button
                    @click.stop="emit('view-logs')"
                    class="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-transparent px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
                    :title="t('actions.viewLogs')"
                >
                    <FileText class="h-3.5 w-3.5" />
                    {{ t('actions.viewLog') }}
                </button>
            </div>
        </div>
    </div>
</template>
