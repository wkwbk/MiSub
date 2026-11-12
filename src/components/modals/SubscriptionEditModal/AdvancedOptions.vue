<script setup>
    import Switch from '../../ui/Switch.vue';
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        editingSubscription: {
            type: Object,
            required: true,
        },
    });
</script>

<template>
    <!-- User-Agent -->
    <div>
        <label for="sub-edit-ua" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {{ t('subscriptions.uaLabel') }}
            <span class="text-xs text-zinc-500 ml-2">{{ t('subscriptions.optionalDefault') }}</span>
        </label>
        <select
            id="sub-edit-ua"
            v-model="editingSubscription.customUserAgent"
            class="mt-1 block w-full px-3 py-2 text-sm bg-white dark:bg-[#131515] border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:border-zinc-500"
        >
            <option value="">{{ t('subscriptions.defaultUa') }}</option>
            <option value="MiSub">MiSub</option>
            <option value="clash-verge/v2.4.3">Clash Verge</option>
            <option value="clash.meta">Clash Meta</option>
            <option value="v2rayN/7.23">v2rayN</option>
            <option value="Shadowrocket/1.9.0">Shadowrocket</option>
            <option value="Mozilla/5.0">Mozilla</option>
        </select>
        <p
            v-if="editingSubscription.customUserAgent"
            class="text-xs font-mono text-zinc-500 mt-1"
        >
            {{ t('subscriptions.currentUa', { ua: editingSubscription.customUserAgent }) }}
        </p>
    </div>

    <!-- 官网 -->
    <div>
        <label
            for="sub-edit-website"
            class="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
        >
            {{ t('subscriptions.websiteLabel') }}
            <span class="text-xs text-zinc-500 ml-2">{{ t('subscriptions.websiteOptional') }}</span>
        </label>
        <input
            id="sub-edit-website"
            v-model="editingSubscription.website"
            type="url"
            inputmode="url"
            placeholder="https://example.com"
            class="mt-1 block w-full px-3 py-2 bg-white dark:bg-[#131515] border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-100 font-mono text-sm focus:outline-hidden focus:border-zinc-500"
        />
        <p class="mt-1 text-xs text-zinc-500">
            {{ t('subscriptions.websiteHint') }}
        </p>
    </div>

    <!-- 备注 -->
    <div>
        <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">{{
            t('subscriptions.notesLabel')
        }}</label>
        <textarea
            v-model="editingSubscription.notes"
            :placeholder="t('subscriptions.notesPlaceholder')"
            rows="2"
            class="mt-1 block w-full px-3 py-2 text-sm bg-white dark:bg-[#131515] border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-500"
        ></textarea>
    </div>

    <!-- 开关选项 -->
    <div class="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center justify-between gap-4">
            <div>
                <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{{
                    t('subscriptions.nodeCacheTitle')
                }}</span>
                <p class="text-xs text-zinc-500 mt-0.5">
                    {{ t('subscriptions.nodeCacheDesc') }}
                </p>
            </div>
            <Switch v-model="editingSubscription.enableNodeCache" />
        </div>

        <div class="flex items-center justify-between gap-4">
            <div>
                <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{{
                    t('subscriptions.plusAsSpaceTitle')
                }}</span>
                <p class="text-xs text-zinc-500 mt-0.5">
                    {{ t('subscriptions.plusAsSpaceDesc') }}
                </p>
            </div>
            <Switch v-model="editingSubscription.plusAsSpace" />
        </div>

        <div class="flex items-center justify-between gap-4">
            <div>
                <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{{
                    t('subscriptions.excludeTrafficTitle')
                }}</span>
                <p class="text-xs text-zinc-500 mt-0.5">
                    {{ t('subscriptions.excludeTrafficDesc') }}
                </p>
            </div>
            <Switch v-model="editingSubscription.excludeTraffic" />
        </div>
    </div>
</template>
