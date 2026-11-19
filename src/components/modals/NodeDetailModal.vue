<script setup>
    import { computed, ref, watch } from 'vue';
    import { Check, Copy, X } from '@lucide/vue';
    import Modal from '@/components/forms/Modal.vue';
    import { parseNodeDetail } from '@/utils/nodeDetail.js';
    import { useToastStore } from '@/stores/toast.js';
    import { useI18n } from '@/i18n/index.js';

    const props = defineProps({
        show: {
            type: Boolean,
            default: false,
        },
        node: {
            type: Object,
            default: null,
        },
        zIndex: {
            type: [String, Number],
            default: 'var(--z-modal-popover)',
        },
    });

    const emit = defineEmits(['update:show']);
    const { showToast } = useToastStore();
    const { t } = useI18n();

    const activeTab = ref('structured');
    const copiedKey = ref('');

    const detail = computed(() => parseNodeDetail(props.node));

    const sectionTitleMap = {
        basic: 'nodeDetail.sectionBasic',
        auth: 'nodeDetail.sectionAuth',
        transport: 'nodeDetail.sectionTransport',
        security: 'nodeDetail.sectionSecurity',
        extra: 'nodeDetail.sectionExtra',
    };

    watch(
        () => props.show,
        (visible) => {
            if (visible) {
                activeTab.value = 'structured';
                copiedKey.value = '';
            }
        }
    );

    const copyText = async (text, key) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(String(text));
            copiedKey.value = key;
            showToast(t('notices.copied'), 'success');
            setTimeout(() => {
                if (copiedKey.value === key) {
                    copiedKey.value = '';
                }
            }, 1500);
        } catch {
            showToast(t('notices.copyFailed'), 'error');
        }
    };

    const closeModal = () => {
        emit('update:show', false);
    };
</script>

<template>
    <Modal
        :show="show"
        size="2xl"
        :z-index="zIndex"
        body-class="px-6 py-4"
        @update:show="emit('update:show', $event)"
    >
        <template #title>
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span
                            class="inline-flex shrink-0 items-center rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase text-zinc-200"
                        >
                            {{ detail.protocol }}
                        </span>
                        <h3 class="truncate text-base font-semibold text-zinc-100">
                            {{ detail.name || t('nodeDetail.title') }}
                        </h3>
                    </div>
                    <p
                        v-if="detail.server"
                        class="mt-1 truncate font-mono text-xs text-zinc-400"
                        :title="`${detail.server}:${detail.port}`"
                    >
                        {{ detail.server }}<span v-if="detail.port !== ''">:</span>{{ detail.port }}
                    </p>
                </div>
                <button
                    type="button"
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-zinc-400 transition-colors hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100"
                    :aria-label="t('nodeDetail.close')"
                    @click="closeModal"
                >
                    <X class="h-4 w-4" />
                </button>
            </div>
        </template>

        <template #body>
            <div class="space-y-4">
                <!-- View Switch Tabs -->
                <div
                    v-if="detail.parsed"
                    class="inline-flex rounded-md border border-zinc-800 bg-[#131515] p-0.5"
                >
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-colors"
                        :class="
                            activeTab === 'structured'
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200'
                        "
                        @click="activeTab = 'structured'"
                    >
                        {{ t('nodeDetail.tabStructured') }}
                    </button>
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-colors"
                        :class="
                            activeTab === 'yaml'
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200'
                        "
                        @click="activeTab = 'yaml'"
                    >
                        {{ t('nodeDetail.tabYaml') }}
                    </button>
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-colors"
                        :class="
                            activeTab === 'json'
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200'
                        "
                        @click="activeTab = 'json'"
                    >
                        {{ t('nodeDetail.tabJson') }}
                    </button>
                </div>

                <!-- Unsupported protocol notice -->
                <div
                    v-if="!detail.parsed"
                    class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300"
                >
                    {{ t('nodeDetail.unsupportedNotice') }}
                </div>

                <!-- Structured Tab -->
                <div v-if="activeTab === 'structured'" class="space-y-4">
                    <div
                        v-for="section in detail.sections"
                        :key="section.id"
                        class="rounded-md border border-zinc-800 bg-[#131515] overflow-hidden"
                    >
                        <div
                            class="border-b border-zinc-800 bg-zinc-900/50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                        >
                            {{ t(sectionTitleMap[section.id] || section.id) }}
                        </div>
                        <div class="divide-y divide-zinc-800/70">
                            <div
                                v-for="item in section.items"
                                :key="item.key"
                                class="flex items-start justify-between gap-3 px-3.5 py-2 text-xs"
                            >
                                <span
                                    class="shrink-0 font-medium text-zinc-400 pt-0.5 min-w-[110px] sm:min-w-[140px]"
                                >
                                    {{ item.label }}
                                </span>
                                <div class="flex min-w-0 flex-1 items-start justify-end gap-2">
                                    <span
                                        v-if="item.kind === 'boolean'"
                                        class="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[11px]"
                                        :class="
                                            item.value
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                                : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                                        "
                                    >
                                        {{ item.display }}
                                    </span>
                                    <span
                                        v-else
                                        class="break-all text-right font-mono text-zinc-200"
                                    >
                                        {{ item.display }}
                                    </span>
                                    <button
                                        v-if="item.copyable"
                                        type="button"
                                        class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                                        :title="t('actions.copy')"
                                        :aria-label="t('actions.copy')"
                                        @click="copyText(item.display, item.key)"
                                    >
                                        <Check
                                            v-if="copiedKey === item.key"
                                            class="h-3 w-3 text-emerald-400"
                                        />
                                        <Copy v-else class="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Raw URL Block -->
                    <div
                        v-if="detail.rawUrl"
                        class="rounded-md border border-zinc-800 bg-[#131515] overflow-hidden"
                    >
                        <div
                            class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3.5 py-2"
                        >
                            <span
                                class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                            >
                                {{ t('nodeDetail.rawUrl') }}
                            </span>
                            <button
                                type="button"
                                class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                                @click="copyText(detail.rawUrl, '__raw_url__')"
                            >
                                <Check
                                    v-if="copiedKey === '__raw_url__'"
                                    class="h-3 w-3 text-emerald-400"
                                />
                                <Copy v-else class="h-3 w-3" />
                                {{ t('actions.copyLink') }}
                            </button>
                        </div>
                        <pre
                            class="max-h-28 overflow-auto whitespace-pre-wrap break-all px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300"
                            >{{ detail.rawUrl }}</pre>
                    </div>
                </div>

                <!-- YAML Tab -->
                <div
                    v-else-if="activeTab === 'yaml'"
                    class="rounded-md border border-zinc-800 bg-[#131515] overflow-hidden"
                >
                    <div
                        class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3.5 py-2"
                    >
                        <span
                            class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                        >
                            Clash Proxy YAML
                        </span>
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                            @click="copyText(detail.formattedYaml, '__yaml__')"
                        >
                            <Check
                                v-if="copiedKey === '__yaml__'"
                                class="h-3 w-3 text-emerald-400"
                            />
                            <Copy v-else class="h-3 w-3" />
                            {{ t('nodeDetail.copyYaml') }}
                        </button>
                    </div>
                    <pre
                        class="max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-zinc-200"
                        >{{ detail.formattedYaml }}</pre>
                </div>

                <!-- JSON Tab -->
                <div
                    v-else-if="activeTab === 'json'"
                    class="rounded-md border border-zinc-800 bg-[#131515] overflow-hidden"
                >
                    <div
                        class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3.5 py-2"
                    >
                        <span
                            class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                        >
                            JSON
                        </span>
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                            @click="copyText(detail.formattedJson, '__json__')"
                        >
                            <Check
                                v-if="copiedKey === '__json__'"
                                class="h-3 w-3 text-emerald-400"
                            />
                            <Copy v-else class="h-3 w-3" />
                            {{ t('nodeDetail.copyJson') }}
                        </button>
                    </div>
                    <pre
                        class="max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-zinc-200"
                        >{{ detail.formattedJson }}</pre>
                </div>
            </div>
        </template>

        <template #footer>
            <button
                v-if="detail.rawUrl"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                @click="copyText(detail.rawUrl, '__footer_url__')"
            >
                <Check v-if="copiedKey === '__footer_url__'" class="h-4 w-4 text-emerald-400" />
                <Copy v-else class="h-4 w-4" />
                {{ t('actions.copyLink') }}
            </button>
            <button
                type="button"
                class="rounded-md border border-zinc-100 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
                @click="closeModal"
            >
                {{ t('nodeDetail.close') }}
            </button>
        </template>
    </Modal>
</template>
