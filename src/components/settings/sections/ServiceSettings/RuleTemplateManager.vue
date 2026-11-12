<script setup>
    import { computed, ref, watch } from 'vue';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const dataStore = useDataStore();

    const DEFAULT_RULE_TEMPLATE_CONTENT = `[custom]
ruleset=🎯 全球直连,[]GEOIP,CN
ruleset=🎯 全球直连,[]GEOSITE,CN
ruleset=🎯 全球直连,[]DOMAIN-SUFFIX,local
ruleset=📲 电报消息,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Telegram.list
ruleset=🤖 AI 服务,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list
ruleset=🎬 流媒体,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list
ruleset=🛑 广告拦截,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list
ruleset=🐟 漏网之鱼,[]FINAL

custom_proxy_group=🚀 节点选择\`select\`[]♻️ 自动选择\`[]☑️ 手动切换\`[]DIRECT
custom_proxy_group=♻️ 自动选择\`url-test\`.*\`http://www.gstatic.com/generate_204\`300,,50
custom_proxy_group=☑️ 手动切换\`select\`.*
custom_proxy_group=📲 电报消息\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT
custom_proxy_group=🤖 AI 服务\`select\`[]🚀 节点选择\`[]♻️ 自动选择
custom_proxy_group=🎬 流媒体\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT
custom_proxy_group=🎯 全球直连\`select\`[]DIRECT\`[]🚀 节点选择
custom_proxy_group=🛑 广告拦截\`select\`[]REJECT\`[]DIRECT
custom_proxy_group=🐟 漏网之鱼\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT

enable_rule_generator=true
overwrite_original_rules=true`;

    const blankTemplate = () => ({
        id: '',
        name: '',
        description: '',
        type: 'ini',
        content: DEFAULT_RULE_TEMPLATE_CONTENT,
        enabled: true,
    });

    const localTemplates = ref([]);
    const selectedId = ref('');
    const isSaving = ref(false);
    const isLoading = ref(false);

    const selectedTemplate = computed(
        () => localTemplates.value.find((item) => item.id === selectedId.value) || null
    );
    const hasTemplates = computed(() => localTemplates.value.length > 0);

    function cloneTemplates(items) {
        return JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
    }

    function syncFromStore() {
        localTemplates.value = cloneTemplates(dataStore.ruleTemplates);
        if (!selectedId.value && localTemplates.value[0]) {
            selectedId.value = localTemplates.value[0].id;
        }
        if (
            selectedId.value &&
            !localTemplates.value.some((item) => item.id === selectedId.value)
        ) {
            selectedId.value = localTemplates.value[0]?.id || '';
        }
    }

    watch(() => dataStore.ruleTemplates, syncFromStore, { immediate: true, deep: true });

    function createTemplate() {
        const now = Date.now().toString(36);
        const template = {
            ...blankTemplate(),
            id: `custom-${now}`,
            name: t('settings.ruleTemplateDefaultName'),
        };
        localTemplates.value.unshift(template);
        selectedId.value = template.id;
    }

    function duplicateTemplate(template) {
        if (!template) return;
        const copy = cloneTemplates([template])[0];
        copy.id = `${template.id || 'custom'}-copy-${Date.now().toString(36)}`;
        copy.name = `${template.name || t('settings.ruleTemplateDefaultName')} ${t('settings.ruleTemplateCopySuffix')}`;
        localTemplates.value.unshift(copy);
        selectedId.value = copy.id;
    }

    function removeTemplate(template) {
        if (!template) return;
        localTemplates.value = localTemplates.value.filter((item) => item.id !== template.id);
        selectedId.value = localTemplates.value[0]?.id || '';
    }

    async function refreshTemplates() {
        isLoading.value = true;
        try {
            await dataStore.fetchRuleTemplates();
            syncFromStore();
        } finally {
            isLoading.value = false;
        }
    }

    async function saveTemplates() {
        isSaving.value = true;
        try {
            const saved = await dataStore.saveRuleTemplates(localTemplates.value);
            localTemplates.value = cloneTemplates(saved);
            if (!localTemplates.value.some((item) => item.id === selectedId.value)) {
                selectedId.value = localTemplates.value[0]?.id || '';
            }
        } finally {
            isSaving.value = false;
        }
    }
</script>

<template>
    <div
        class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none"
    >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h3 class="text-sm font-semibold text-zinc-100">
                    {{ t('settings.ruleTemplatesTitle') }}
                </h3>
                <p class="mt-1 text-xs text-zinc-400">
                    {{ t('settings.ruleTemplatesDesc') }}
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <button
                    type="button"
                    @click="refreshTemplates"
                    :disabled="isLoading"
                    class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
                >
                    {{
                        isLoading
                            ? t('settings.ruleTemplatesRefreshing')
                            : t('settings.ruleTemplatesRefresh')
                    }}
                </button>
                <button
                    type="button"
                    @click="createTemplate"
                    class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-900 hover:text-zinc-100"
                >
                    {{ t('settings.ruleTemplatesNew') }}
                </button>
                <button
                    type="button"
                    @click="saveTemplates"
                    :disabled="isSaving"
                    class="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50"
                >
                    {{
                        isSaving
                            ? t('settings.ruleTemplatesSaving')
                            : t('settings.ruleTemplatesSave')
                    }}
                </button>
            </div>
        </div>

        <div
            v-if="!hasTemplates"
            class="mt-5 rounded-md border border-zinc-800 p-6 text-center"
        >
            <p class="text-sm font-medium text-zinc-300">
                {{ t('settings.ruleTemplatesEmpty') }}
            </p>
            <p class="mt-1 text-xs text-zinc-500">
                {{ t('settings.ruleTemplatesEmptyHint') }}
            </p>
        </div>

        <div v-else class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
            <div class="space-y-2">
                <button
                    v-for="template in localTemplates"
                    :key="template.id"
                    type="button"
                    @click="selectedId = template.id"
                    :class="
                        selectedId === template.id
                            ? 'border-zinc-500 bg-zinc-900 text-zinc-100'
                            : 'border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                    "
                    class="w-full rounded-md border px-3 py-2 text-left transition"
                >
                    <div class="truncate text-xs font-semibold">
                        {{ template.name || t('settings.ruleTemplateUnnamed') }}
                    </div>
                    <div class="mt-1 truncate font-mono text-[10px] text-zinc-500">custom:{{ template.id }}</div>
                </button>
            </div>

            <div
                v-if="selectedTemplate"
                class="space-y-4 rounded-md border border-zinc-800 bg-transparent p-4"
            >
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="block">
                        <span
                            class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                            >{{ t('settings.ruleTemplateName') }}</span
                        >
                        <input
                            v-model="selectedTemplate.name"
                            class="block w-full rounded-md border border-zinc-800 bg-[#131515] px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-hidden"
                        />
                    </label>
                    <label class="block">
                        <span
                            class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                            >{{ t('settings.ruleTemplateId') }}</span
                        >
                        <input
                            v-model="selectedTemplate.id"
                            class="block w-full rounded-md border border-zinc-800 bg-[#131515] px-3 py-2 font-mono text-sm text-zinc-100 focus:border-zinc-600 focus:outline-hidden"
                        />
                    </label>
                </div>

                <label class="block">
                    <span
                        class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                        >{{ t('settings.ruleTemplateDescription') }}</span
                    >
                    <input
                        v-model="selectedTemplate.description"
                        :placeholder="t('settings.ruleTemplateDescriptionPlaceholder')"
                        class="block w-full rounded-md border border-zinc-800 bg-[#131515] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-hidden"
                    />
                </label>

                <label class="block">
                    <span
                        class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                        >{{ t('settings.ruleTemplateContent') }}</span
                    >
                    <textarea
                        v-model="selectedTemplate.content"
                        rows="12"
                        spellcheck="false"
                        class="block w-full rounded-md border border-zinc-800 bg-[#131515] px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 focus:border-zinc-600 focus:outline-hidden"
                    ></textarea>
                </label>

                <div class="flex flex-wrap items-center justify-between gap-3">
                    <label
                        class="flex items-center gap-2 text-xs font-medium text-zinc-300"
                    >
                        <input
                            v-model="selectedTemplate.enabled"
                            type="checkbox"
                            class="h-4 w-4 rounded-sm border-zinc-700 bg-[#131515] text-zinc-100 focus:ring-0"
                        />
                        {{ t('settings.ruleTemplateEnabled') }}
                    </label>
                    <div class="flex gap-2">
                        <button
                            type="button"
                            @click="duplicateTemplate(selectedTemplate)"
                            class="rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.copy') }}
                        </button>
                        <button
                            type="button"
                            @click="removeTemplate(selectedTemplate)"
                            class="rounded-md border border-red-900/60 bg-transparent px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/30"
                        >
                            {{ t('actions.delete') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
