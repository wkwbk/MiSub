<script setup>
    import { computed, ref, watch } from 'vue';
    import { Braces, Plus } from '@lucide/vue';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useI18n } from '@/i18n/index.js';
    import TemplateVariablesModal from '@/components/forms/TemplateVariablesModal.vue';
    import Textarea from '@/components/ui/Textarea.vue';

    const emit = defineEmits(['saved']);

    const { t } = useI18n();
    const showTemplateVariables = ref(false);

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
        return template;
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
            const active = localTemplates.value.find(
                (item) => item.id === selectedId.value && item.enabled !== false
            );
            emit('saved', active?.id || '');
            return true;
        } catch {
            return false;
        } finally {
            isSaving.value = false;
        }
    }

    defineExpose({
        refreshTemplates,
        createTemplate,
        saveTemplates,
        isSaving,
        isLoading,
        hasTemplates,
        selectedId,
        localTemplates,
    });
</script>

<template>
    <div class="w-full">
        <div
            v-if="!hasTemplates"
            class="rounded-md border border-dashed border-line bg-inset/70 px-6 py-12 text-center"
        >
            <p class="text-xs font-medium text-fg-muted">
                {{ t('settings.ruleTemplatesEmpty') }}
            </p>
            <p class="mt-1 text-xs text-fg-subtle">
                {{ t('settings.ruleTemplatesEmptyHint') }}
            </p>
            <button
                type="button"
                data-testid="empty-create-rule-template"
                @click="createTemplate"
                class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition hover:opacity-90"
            >
                <Plus class="h-3.5 w-3.5" />
                <span>{{ t('settings.ruleTemplatesNew') }}</span>
            </button>
        </div>

        <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
            <div class="space-y-1.5">
                <button
                    v-for="template in localTemplates"
                    :key="template.id"
                    type="button"
                    @click="selectedId = template.id"
                    :class="
                        selectedId === template.id
                            ? 'border-zinc-500 bg-elevated-card text-fg'
                            : 'border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg'
                    "
                    class="w-full rounded-md border px-3 py-2 text-left transition"
                >
                    <div class="truncate text-xs font-semibold">
                        {{ template.name || t('settings.ruleTemplateUnnamed') }}
                    </div>
                    <div class="mt-1 truncate font-mono text-[10px] text-fg-subtle">
                        custom:{{ template.id }}
                    </div>
                </button>
            </div>

            <div
                v-if="selectedTemplate"
                class="space-y-4 lg:pl-6 lg:border-l lg:border-zinc-800/80"
            >
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="block">
                        <span
                            class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
                            >{{ t('settings.ruleTemplateName') }}</span
                        >
                        <input
                            v-model="selectedTemplate.name"
                            class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-sm text-fg focus:border-zinc-600 focus:outline-hidden"
                        />
                    </label>
                    <label class="block">
                        <span
                            class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
                            >{{ t('settings.ruleTemplateId') }}</span
                        >
                        <input
                            v-model="selectedTemplate.id"
                            class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-sm text-fg focus:border-zinc-600 focus:outline-hidden"
                        />
                    </label>
                </div>

                <label class="block">
                    <span
                        class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
                        >{{ t('settings.ruleTemplateDescription') }}</span
                    >
                    <input
                        v-model="selectedTemplate.description"
                        :placeholder="t('settings.ruleTemplateDescriptionPlaceholder')"
                        class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-zinc-600 focus:outline-hidden"
                    />
                </label>

                <div>
                    <div class="mb-1 flex items-center justify-between gap-2">
                        <span
                            class="text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
                            >{{ t('settings.ruleTemplateContent') }}</span
                        >
                        <button
                            type="button"
                            @click="showTemplateVariables = true"
                            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                        >
                            <Braces class="h-3.5 w-3.5" />
                            <span>{{ t('transformSelector.templateVariablesTitle') }}</span>
                        </button>
                    </div>
                    <Textarea
                        v-model="selectedTemplate.content"
                        rows="12"
                        spellcheck="false"
                        wrapperClass="focus-within:border-zinc-600 focus-within:ring-0"
                        class="px-3 py-2 font-mono text-xs leading-relaxed"
                    />
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                    <label class="flex items-center gap-2 text-xs font-medium text-fg-muted">
                        <input
                            v-model="selectedTemplate.enabled"
                            type="checkbox"
                            class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
                        />
                        {{ t('settings.ruleTemplateEnabled') }}
                    </label>
                    <div class="flex gap-2">
                        <button
                            type="button"
                            @click="duplicateTemplate(selectedTemplate)"
                            class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
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

        <TemplateVariablesModal v-model:show="showTemplateVariables" />
    </div>
</template>
