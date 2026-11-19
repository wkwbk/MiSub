<script setup>
    import { computed } from 'vue';
    import Select from '@/components/ui/Select.vue';
    import { useI18n } from '@/i18n/index.js';

    const props = defineProps({
        modelValue: {
            type: Object,
            default: () => ({}),
        },
    });

    const emit = defineEmits(['update:modelValue']);
    const { t } = useI18n();

    const protocolOptions = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'tuic', 'socks5'];

    const params = computed({
        get: () => ({
            mode: 'serverPort',
            includeProtocol: true,
            prefer: {
                protocolOrder: [],
            },
            ...props.modelValue,
            prefer: {
                protocolOrder: [],
                ...(props.modelValue?.prefer || {}),
            },
        }),
        set: (val) => emit('update:modelValue', val),
    });

    const updateValue = (patch) => {
        params.value = {
            ...params.value,
            ...patch,
        };
    };

    const statusLabel = (enabled) => t(enabled ? 'operators.statusOn' : 'operators.statusOff');

    const toggleProtocol = (protocol) => {
        const current = new Set(params.value.prefer?.protocolOrder || []);
        if (current.has(protocol)) {
            current.delete(protocol);
        } else {
            current.add(protocol);
        }

        updateValue({
            prefer: {
                ...(params.value.prefer || {}),
                protocolOrder: Array.from(current),
            },
        });
    };
</script>

<template>
    <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
                <label class="text-[11px] font-semibold uppercase tracking-tight text-fg-muted">{{
                    t('operators.dedupMode')
                }}</label>
                <Select
                    :model-value="params.mode"
                    @update:model-value="updateValue({ mode: $event })"
                    :options="[
                        { value: 'serverPort', label: t('operators.dedupServerPort') },
                        { value: 'url', label: t('operators.dedupFullUrl') },
                    ]"
                />
                <p class="text-[10px] text-fg-subtle">
                    {{ t('operators.dedupModeHint') }}
                </p>
            </div>

            <div class="space-y-2 rounded-md border border-line bg-transparent p-3">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="text-sm font-medium text-fg">
                            {{ t('operators.includeProtocolDedup') }}
                        </p>
                        <p class="text-[10px] text-fg-subtle">
                            {{ t('operators.includeProtocolDedupHint') }}
                        </p>
                    </div>
                    <button
                        @click="updateValue({ includeProtocol: !params.includeProtocol })"
                        :class="
                            params.includeProtocol
                                ? 'bg-accent text-accent-fg'
                                : 'border border-line bg-transparent text-fg-muted'
                        "
                        class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                        {{ statusLabel(params.includeProtocol) }}
                    </button>
                </div>
            </div>
        </div>

        <div class="space-y-2">
            <label class="text-[11px] font-semibold uppercase tracking-tight text-fg-muted">{{
                t('operators.preferredProtocols')
            }}</label>
            <div class="flex flex-wrap gap-2 rounded-md border border-line bg-transparent p-3">
                <button
                    v-for="protocol in protocolOptions"
                    :key="protocol"
                    @click="toggleProtocol(protocol)"
                    :class="
                        (params.prefer?.protocolOrder || []).includes(protocol)
                            ? 'bg-accent text-accent-fg'
                            : 'border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg'
                    "
                    class="rounded-md px-3 py-1.5 font-mono text-xs font-medium uppercase transition-colors"
                >
                    {{ protocol }}
                </button>
            </div>
            <p class="text-[10px] text-fg-subtle">
                {{ t('operators.preferredProtocolsHint') }}
            </p>
        </div>
    </div>
</template>
