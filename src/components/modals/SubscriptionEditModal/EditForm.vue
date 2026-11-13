<script setup>
    const props = defineProps({
        editingSubscription: {
            type: Object,
            required: true,
        },
    });
    import Input from '../../ui/Input.vue';
    import Switch from '../../ui/Switch.vue';
    import { ref, watch } from 'vue';
    import { Loader2, Zap } from 'lucide-vue-next';
    import { fetchNodeCount } from '../../../lib/api.js';
    import { useToastStore } from '../../../stores/toast.js';
    import { useI18n } from '../../../i18n/index.js';

    const { showToast } = useToastStore();
    const { t } = useI18n();

    // 使用独立的本地状态，防止用户清空输入框时开关自动跳回关闭状态
    const useFetchProxy = ref(false);
    const isTestingProxy = ref(false);

    // 当弹窗传入新订阅信息时，初始化开关状态
    watch(
        () => props.editingSubscription,
        (newSub) => {
            if (newSub) {
                useFetchProxy.value = !!newSub.fetchProxy;
            }
        },
        { immediate: true }
    );

    // 当用户主动关闭开关时，清理绑定的代理地址
    watch(useFetchProxy, (val) => {
        if (!val && props.editingSubscription) {
            props.editingSubscription.fetchProxy = '';
        }
    });

    const testProxyConnectivity = async () => {
        if (!props.editingSubscription.fetchProxy || !props.editingSubscription.url) {
            showToast(t('subscriptions.proxyRequired'), 'warning');
            return;
        }
        isTestingProxy.value = true;
        try {
            const res = await fetchNodeCount(
                props.editingSubscription.url,
                props.editingSubscription.fetchProxy,
                props.editingSubscription.plusAsSpace,
                props.editingSubscription.customUserAgent
            );
            if (res.success) {
                showToast(
                    t('subscriptions.proxyTestSuccess', { count: res.data.count }),
                    'success'
                );
            } else {
                showToast(t('subscriptions.proxyTestFailed', { message: res.error }), 'error');
            }
        } catch (err) {
            showToast(t('subscriptions.proxyTestError', { message: err.message }), 'error');
        } finally {
            isTestingProxy.value = false;
        }
    };
</script>

<template>
    <!-- 订阅名称 -->
    <div>
        <Input
            id="sub-edit-name"
            v-model="editingSubscription.name"
            :label="t('subscriptions.nameLabel')"
            :placeholder="t('subscriptions.nameAutoPlaceholder')"
        />
    </div>

    <!-- 订阅链接 -->
    <div>
        <Input
            id="sub-edit-url"
            v-model="editingSubscription.url"
            :label="t('subscriptions.urlLabel')"
            placeholder="https://..."
            class="font-mono"
        />
    </div>

    <!-- 专属拉取代理 -->
    <div class="pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center justify-between mb-2">
            <div>
                <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100">{{
                    t('subscriptions.fetchProxyTitle')
                }}</span>
                <p class="text-xs text-zinc-500 mt-0.5">{{ t('subscriptions.fetchProxyDesc') }}</p>
            </div>
            <Switch v-model="useFetchProxy" />
        </div>

        <!-- 代理输入框 (动画展开) -->
        <div v-if="useFetchProxy" class="mt-3 space-y-2 animate-fade-in">
            <div class="flex gap-2">
                <Input
                    id="sub-edit-proxy"
                    v-model="editingSubscription.fetchProxy"
                    :placeholder="t('subscriptions.proxyPlaceholder')"
                    class="font-mono text-sm flex-1"
                />
                <button
                    type="button"
                    @click="testProxyConnectivity"
                    :disabled="
                        isTestingProxy ||
                        !editingSubscription.fetchProxy ||
                        !editingSubscription.url
                    "
                    class="h-[38px] px-3.5 bg-transparent border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center whitespace-nowrap"
                >
                    <Loader2
                        v-if="isTestingProxy"
                        class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-zinc-400"
                    />
                    <Zap v-else class="w-3.5 h-3.5 mr-1.5" />
                    {{ isTestingProxy ? t('subscriptions.testing') : t('subscriptions.testProxy') }}
                </button>
            </div>
            <p class="text-[11px] text-zinc-500">
                {{ t('subscriptions.fetchProxyHint') }}
            </p>
        </div>
    </div>
</template>

<style scoped>
    .animate-fade-in {
        animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-3px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
