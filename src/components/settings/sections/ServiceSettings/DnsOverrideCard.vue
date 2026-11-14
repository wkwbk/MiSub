<script setup>
    import { computed, ref } from 'vue';
    import { Globe } from 'lucide-vue-next';
    import { useI18n } from '@/i18n/index.js';
    import SectionHeader from '../../SectionHeader.vue';
    import yaml from 'js-yaml';

    const { t } = useI18n();

    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });

    const inputValue = computed({
        get() {
            return props.settings.customDnsOverride || '';
        },
        set(value) {
            props.settings.customDnsOverride = value;
        },
    });

    const jsonError = ref('');

    function detectFormat(raw) {
        if (/^\s*\{/.test(raw)) return 'json';
        return 'yaml';
    }

    function validateInput() {
        const raw = inputValue.value.trim();
        if (!raw) {
            jsonError.value = '';
            return;
        }
        const format = detectFormat(raw);
        try {
            let parsed;
            if (format === 'json') {
                parsed = JSON.parse(raw);
            } else {
                parsed = yaml.load(raw);
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                jsonError.value = t('settings.dnsOverrideInvalidObject');
            } else {
                jsonError.value = '';
            }
        } catch {
            jsonError.value =
                format === 'json'
                    ? t('settings.dnsOverrideInvalidJson')
                    : t('settings.dnsOverrideInvalidYaml');
        }
    }

    const hasValue = computed(() => inputValue.value.trim().length > 0);
</script>

<template>
    <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
        <SectionHeader
            :title="t('settings.dnsOverrideTitle')"
            :description="t('settings.dnsOverrideDesc')"
        >
            <template #icon>
                <Globe class="h-4 w-4" />
            </template>
            <template v-if="hasValue" #actions>
                <span
                    class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-300"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {{ t('settings.dnsOverrideActive') }}
                </span>
            </template>
        </SectionHeader>

        <div>
            <label class="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
                {{ t('settings.dnsOverrideLabel') }}
            </label>
            <textarea
                v-model="inputValue"
                rows="16"
                spellcheck="false"
                :placeholder="t('settings.dnsOverridePlaceholder')"
                class="block w-full rounded-md border bg-[#131515] px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-100 shadow-none transition-colors focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500"
                :class="
                    jsonError
                        ? 'border-red-500/60 focus:border-red-500 focus-visible:ring-red-500'
                        : 'border-zinc-800'
                "
                @blur="validateInput"
            />
            <p v-if="jsonError" class="mt-2 text-xs text-red-400">
                {{ jsonError }}
            </p>
            <p v-else class="mt-2 text-xs leading-relaxed text-zinc-500">
                {{ t('settings.dnsOverrideHint') }}
            </p>
        </div>
    </section>
</template>
