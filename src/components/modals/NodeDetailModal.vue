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
                    <div class="flex items-center gap-2.5">
                        <span
                            class="inline-flex shrink-0 items-center rounded-sm border border-line-strong bg-active px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-fg"
                        >
                            {{ detail.protocol }}
                        </span>
                        <h3 class="truncate text-base font-semibold text-fg">
                            {{ detail.name || t('nodeDetail.title') }}
                        </h3>
                    </div>
                    <p
                        v-if="detail.server"
                        class="mt-1 truncate font-mono text-xs text-fg-muted"
                        :title="`${detail.server}:${detail.port}`"
                    >
                        {{ detail.server }}<span v-if="detail.port !== ''">:</span>{{ detail.port }}
                    </p>
                </div>
                <button
                    type="button"
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line hover:bg-hover hover:text-fg"
                    :aria-label="t('nodeDetail.close')"
                    @click="closeModal"
                >
                    <X class="h-4 w-4" />
                </button>
            </div>
        </template>

        <template #body>
            <div class="space-y-5">
                <!-- View Switch Tabs -->
                <div
                    v-if="detail.parsed"
                    class="modal-inset-surface inline-flex items-center gap-0.5 rounded-md p-1"
                >
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-all"
                        :class="
                            activeTab === 'structured'
                                ? 'modal-tab-active text-fg'
                                : 'text-fg-muted hover:text-fg'
                        "
                        @click="activeTab = 'structured'"
                    >
                        {{ t('nodeDetail.tabStructured') }}
                    </button>
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-all"
                        :class="
                            activeTab === 'yaml'
                                ? 'modal-tab-active text-fg'
                                : 'text-fg-muted hover:text-fg'
                        "
                        @click="activeTab = 'yaml'"
                    >
                        {{ t('nodeDetail.tabYaml') }}
                    </button>
                    <button
                        type="button"
                        class="rounded-sm px-3 py-1 text-xs font-medium transition-all"
                        :class="
                            activeTab === 'json'
                                ? 'modal-tab-active text-fg'
                                : 'text-fg-muted hover:text-fg'
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
                    <section v-for="section in detail.sections" :key="section.id">
                        <h4
                            class="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted"
                        >
                            {{ t(sectionTitleMap[section.id] || section.id) }}
                        </h4>
                        <div class="modal-section-card rounded-md overflow-hidden">
                            <div class="modal-row-list">
                                <div
                                    v-for="item in section.items"
                                    :key="item.key"
                                    class="modal-row-hover flex items-start justify-between gap-3 px-3.5 py-2.5 text-xs transition-colors"
                                >
                                    <span
                                        class="shrink-0 font-medium text-fg-muted pt-0.5 min-w-[110px] sm:min-w-[140px]"
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
                                                    : 'border-line-strong bg-active text-fg-muted'
                                            "
                                        >
                                            {{ item.display }}
                                        </span>
                                        <span
                                            v-else
                                            class="break-all text-right font-mono text-fg"
                                        >
                                            {{ item.display }}
                                        </span>
                                        <button
                                            v-if="item.copyable"
                                            type="button"
                                            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
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
                    </section>

                    <!-- Raw URL Block -->
                    <section v-if="detail.rawUrl">
                        <div class="mb-1.5 flex items-center justify-between px-1">
                            <h4
                                class="text-[11px] font-medium uppercase tracking-wider text-fg-muted"
                            >
                                {{ t('nodeDetail.rawUrl') }}
                            </h4>
                            <button
                                type="button"
                                class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                        <div class="modal-inset-surface rounded-md overflow-hidden">
                            <pre
                                class="modal-scrollbar max-h-28 overflow-auto whitespace-pre-wrap break-all px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-fg-muted"
                                >{{ detail.rawUrl }}</pre>
                        </div>
                    </section>
                </div>

                <!-- YAML Tab -->
                <div v-else-if="activeTab === 'yaml'">
                    <div class="mb-1.5 flex items-center justify-between px-1">
                        <h4
                            class="text-[11px] font-medium uppercase tracking-wider text-fg-muted"
                        >
                            Clash Proxy YAML
                        </h4>
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                    <div class="modal-inset-surface rounded-md overflow-hidden">
                        <pre
                            class="modal-scrollbar max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-fg"
                            >{{ detail.formattedYaml }}</pre>
                    </div>
                </div>

                <!-- JSON Tab -->
                <div v-else-if="activeTab === 'json'">
                    <div class="mb-1.5 flex items-center justify-between px-1">
                        <h4
                            class="text-[11px] font-medium uppercase tracking-wider text-fg-muted"
                        >
                            JSON
                        </h4>
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
                    <div class="modal-inset-surface rounded-md overflow-hidden">
                        <pre
                            class="modal-scrollbar max-h-[420px] overflow-auto px-3.5 py-3 font-mono text-xs leading-relaxed text-fg"
                            >{{ detail.formattedJson }}</pre>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <button
                type="button"
                class="rounded-md border border-line hover:border-line-strong bg-transparent px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                @click="closeModal"
            >
                {{ t('nodeDetail.close') }}
            </button>
            <button
                v-if="detail.rawUrl"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
                @click="copyText(detail.rawUrl, '__footer_url__')"
            >
                <Check v-if="copiedKey === '__footer_url__'" class="h-4 w-4 text-emerald-500" />
                <Copy v-else class="h-4 w-4" />
                {{ t('actions.copyLink') }}
            </button>
        </template>
    </Modal>
</template>
