<script setup>
    import { computed, ref } from 'vue';
    import { useI18n } from '@/i18n/index.js';
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
    <div
        class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none space-y-4"
    >
        <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
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
                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                        />
                    </svg>
                </div>
                <div>
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.dnsOverrideTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.dnsOverrideDesc') }}
                    </p>
                </div>
            </div>
            <span
                v-if="hasValue"
                class="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-300"
            >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                {{ t('settings.dnsOverrideActive') }}
            </span>
        </div>

        <div>
            <label
                class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-400"
            >
                {{ t('settings.dnsOverrideLabel') }}
            </label>
            <textarea
                v-model="inputValue"
                rows="20"
                spellcheck="false"
                :placeholder="t('settings.dnsOverridePlaceholder')"
                class="block w-full rounded-md border bg-[#09090b] px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-100 shadow-none transition-colors focus:border-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500"
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
    </div>
</template>
