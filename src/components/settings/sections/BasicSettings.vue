<script setup>
    import { Globe, Info, Languages, SlidersHorizontal } from 'lucide-vue-next';
    import SectionHeader from '../SectionHeader.vue';
    const props = defineProps({
        settings: {
            type: Object,
            required: true,
        },
        disguiseConfig: {
            type: Object,
            required: true,
        },
        // id of the field the dashboard deep-linked to, so we can highlight it.
        highlightedFocusId: {
            type: String,
            default: '',
        },
    });

    import Input from '../../ui/Input.vue';
    import Select from '../../ui/Select.vue';
    import Switch from '../../ui/Switch.vue';
    import { watch, computed } from 'vue';
    import { useToastStore } from '../../../stores/toast';
    import { useI18n } from '../../../i18n/index.js';

    const { showToast } = useToastStore();
    const { t } = useI18n();

    // 系统保留路径列表，这些路径会与前端路由或后端 API 冲突
    const RESERVED_PATHS = [
        'settings',
        'login',
        'groups',
        'nodes',
        'subscriptions',
        'dashboard',
        'api',
        'explore',
        'sub',
        'cron',
        'assets',
        '@vite',
        'public',
        'profile',
        'offline',
        'logout',
        'auth_debug',
        'auth_check',
        'data',
        'kv_test',
        'clients',
        'system',
        'github',
        'telegram',
        'test_notification',
        'misubs',
        'node_count',
        'fetch_external_url',
        'batch_update_nodes',
        'subscription_nodes',
        'debug_subscription',
        'preview',
    ];

    const getPathSegment = (value) => value.replace(/^\/+/, '').split('/')[0].toLowerCase();
    const hasInvalidTokenChars = (value) => /[\s\/?#]/.test(value);

    const customLoginPathError = computed(() => {
        const value = props.settings.customLoginPath;
        if (!value) return '';

        if (/[^a-zA-Z0-9-_\/]/.test(value)) {
            return t('settings.reservedPathChars');
        }

        const pathSegment = getPathSegment(value);
        if (RESERVED_PATHS.includes(pathSegment)) {
            return t('settings.reservedPathCustomLogin', { path: pathSegment });
        }

        return '';
    });

    const myTokenError = computed(() => {
        const value = props.settings.mytoken;
        if (!value) return '';

        if (hasInvalidTokenChars(value)) {
            return t('settings.reservedTokenChars');
        }

        const pathSegment = getPathSegment(value);
        return RESERVED_PATHS.includes(pathSegment)
            ? t('settings.reservedPathSubscriptionToken')
            : '';
    });

    const profileTokenError = computed(() => {
        const value = props.settings.profileToken;
        if (!value) return '';

        if (hasInvalidTokenChars(value)) {
            return t('settings.reservedTokenChars');
        }

        const pathSegment = getPathSegment(value);
        return RESERVED_PATHS.includes(pathSegment) ? t('settings.reservedPathProfileToken') : '';
    });

    // 监听自定义登录路径，保留输入并通过提示引导修正
    watch(
        () => props.settings.customLoginPath,
        (val) => {
            if (!val) return;

            // 仅允许字母、数字、下划线、中划线和斜杠
            const sanitized = val.replace(/[^a-zA-Z0-9-_\/]/g, '');

            if (sanitized !== val) {
                props.settings.customLoginPath = sanitized;
                showToast(t('settings.reservedPathCharsToast'), 'warning');
                return;
            }
        }
    );

    watch(
        () => props.settings.mytoken,
        (val) => {
            if (!val) return;
            if (hasInvalidTokenChars(val)) {
                showToast(t('settings.reservedTokenChars'), 'error');
                return;
            }
            const pathSegment = getPathSegment(val);
            if (RESERVED_PATHS.includes(pathSegment)) {
                showToast(t('settings.reservedPathSubscriptionToken'), 'error');
            }
        }
    );

    watch(
        () => props.settings.profileToken,
        (val) => {
            if (!val) return;
            if (hasInvalidTokenChars(val)) {
                showToast(t('settings.reservedTokenChars'), 'error');
                return;
            }
            const pathSegment = getPathSegment(val);
            if (RESERVED_PATHS.includes(pathSegment)) {
                showToast(t('settings.reservedPathProfileToken'), 'error');
            }
        }
    );
</script>

<template>
    <div class="space-y-6">
        <!-- 默认显示语言 -->
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <SectionHeader
                :title="t('settings.defaultLanguageTitle')"
                :description="t('settings.defaultLanguageDesc')"
                tone="amber"
            >
                <template #icon>
                    <Languages class="h-4 w-4" />
                </template>
            </SectionHeader>
            <div class="max-w-xs">
                <Select
                    v-model="settings.defaultLocale"
                    :options="[
                        { value: 'zh-CN', label: t('settings.defaultLanguageZh') },
                        { value: 'en-US', label: t('settings.defaultLanguageEn') },
                    ]"
                />
            </div>
        </div>

        <!-- 订阅基本信息配置 -->
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <SectionHeader
                :title="t('settings.subscriptionConfigTitle')"
                :description="t('settings.subscriptionConfigDesc')"
                tone="indigo"
            >
                <template #icon>
                    <Info class="h-4 w-4" />
                </template>
            </SectionHeader>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                    <Input
                        :label="t('settings.customFileName')"
                        v-model="settings.FileName"
                        class="rounded-md font-mono"
                    />
                </div>
                <div>
                    <Input
                        id="setting-mytoken"
                        :label="t('settings.customToken')"
                        v-model="settings.mytoken"
                        :error="myTokenError"
                        class="rounded-md font-mono transition-shadow duration-300"
                        :class="{
                            'ring-1 ring-zinc-400 rounded-md':
                                highlightedFocusId === 'setting-mytoken',
                        }"
                    />
                    <p class="mt-2 text-xs text-zinc-400">
                        {{ t('settings.subscriptionTokenRotationHint') }}
                    </p>
                </div>
                <div>
                    <Input
                        id="setting-profileToken"
                        :label="t('settings.profileToken')"
                        v-model="settings.profileToken"
                        :placeholder="t('settings.profileTokenPlaceholder')"
                        :error="profileTokenError"
                        class="rounded-md font-mono transition-shadow duration-300"
                        :class="{
                            'ring-1 ring-zinc-400 rounded-md':
                                highlightedFocusId === 'setting-profileToken',
                        }"
                    />
                </div>
            </div>
        </div>

        <!-- 功能开关区域 -->
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <SectionHeader
                :title="t('settings.featureControlTitle')"
                :description="t('settings.featureControlDesc')"
                tone="green"
            >
                <template #icon>
                    <SlidersHorizontal class="h-4 w-4" />
                </template>
            </SectionHeader>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- 订阅自动更新间隔 -->
                <div class="p-4 bg-transparent border border-zinc-800 rounded-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-zinc-100">
                                {{ t('settings.autoUpdateInterval') }}
                            </p>
                            <p class="text-xs text-zinc-400 mt-0.5">
                                {{ t('settings.autoUpdateDesc') }}
                            </p>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <input
                                type="number"
                                :value="
                                    ![0, 30, 60, 120].includes(settings.autoUpdateInterval)
                                        ? settings.autoUpdateInterval
                                        : ''
                                "
                                @input="
                                    (e) => {
                                        const v = parseInt(e.target.value);
                                        if (v >= 5) settings.autoUpdateInterval = v;
                                    }
                                "
                                :placeholder="t('settings.customInterval')"
                                min="5"
                                class="w-24 px-2.5 py-1.5 text-xs font-mono bg-[#131515] border border-zinc-800 rounded-md text-zinc-100 placeholder-zinc-500 focus-visible:ring-1 focus-visible:ring-zinc-500 focus:border-zinc-500 outline-none transition-colors"
                                :aria-label="t('settings.autoUpdateInterval')"
                            />
                            <span class="text-xs text-zinc-400">{{ t('settings.minutes') }}</span>
                        </div>
                        <span class="text-xs text-zinc-500 self-center">{{
                            t('settings.quickSelect')
                        }}</span>
                        <button
                            v-for="option in [
                                { value: 0, label: t('settings.disabledOption') },
                                { value: 30, label: t('settings.option30Minutes') },
                                { value: 60, label: t('settings.option1Hour') },
                            ]"
                            :key="option.value"
                            @click="settings.autoUpdateInterval = option.value"
                            :aria-pressed="settings.autoUpdateInterval === option.value"
                            :class="[
                                'px-2.5 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors',
                                settings.autoUpdateInterval === option.value
                                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-none'
                                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100',
                            ]"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                    <p
                        v-if="settings.autoUpdateInterval === 0"
                        class="text-xs text-amber-400 mt-2 flex items-center gap-1.5"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        {{ t('settings.autoUpdateDisabledHint') }}
                    </p>
                </div>

                <!-- 访问日志 -->
                <div
                    class="flex items-center justify-between p-4 bg-transparent border border-zinc-800 rounded-md"
                >
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.accessLogTitle') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.accessLogDesc') }}
                        </p>
                        <p class="text-[11px] text-amber-400 mt-1 flex items-center gap-1.5">
                            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            {{ t('settings.accessLogQuotaHint') }}
                        </p>
                    </div>
                    <Switch v-model="settings.enableAccessLog" />
                </div>

                <div
                    v-if="settings.enableAccessLog"
                    class="p-4 bg-transparent border border-zinc-800 rounded-md space-y-2"
                >
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.accessLogMode') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.accessLogModeDesc') }}
                        </p>
                    </div>
                    <div class="min-w-[160px]">
                        <Select
                            v-model="settings.accessLogPersistenceMode"
                            :options="[
                                { value: 'light', label: t('settings.accessLogLight') },
                                { value: 'full', label: t('settings.accessLogFull') },
                            ]"
                        />
                    </div>
                </div>

                <!-- 流量与到期时间节点 -->
                <div
                    class="flex items-center justify-between p-4 bg-transparent border border-zinc-800 rounded-md"
                >
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.trafficNodeTitle') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.trafficNodeDesc') }}
                        </p>
                    </div>
                    <Switch v-model="settings.enableTrafficNode" />
                </div>

                <!-- 合并到期时间策略 -->
                <div class="p-4 bg-transparent border border-zinc-800 rounded-md space-y-2">
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.mergeExpireStrategyTitle') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.mergeExpireStrategyDesc') }}
                        </p>
                    </div>
                    <Select
                        v-model="settings.mergeExpireStrategy"
                        :options="[
                            { value: 'max', label: t('settings.mergeExpireMax') },
                            { value: 'min', label: t('settings.mergeExpireMin') },
                        ]"
                    />
                </div>
            </div>
        </div>

        <!-- Web 访问控制 -->
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <SectionHeader
                :title="t('settings.webAccessTitle')"
                :description="t('settings.webAccessDesc')"
                tone="blue"
            >
                <template #icon>
                    <Globe class="h-4 w-4" />
                </template>
            </SectionHeader>

            <div
                class="bg-transparent border border-zinc-800 rounded-md divide-y divide-zinc-800 overflow-hidden"
            >
                <!-- 公开页访问 -->
                <div
                    class="p-4 flex items-center justify-between hover:bg-zinc-900/40 transition-colors"
                >
                    <div>
                        <p class="text-sm font-medium text-zinc-100">
                            {{ t('settings.publicPageAccessTitle') }}
                        </p>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            {{ t('settings.publicPageAccessDesc') }}
                        </p>
                    </div>
                    <Switch v-model="settings.enablePublicPage" />
                </div>

                <!-- 伪装页面 -->
                <div class="p-4 space-y-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-zinc-100">
                                {{ t('settings.disguisePageTitle') }}
                            </p>
                            <p class="text-xs text-zinc-400 mt-0.5">
                                {{ t('settings.disguisePageDesc') }}
                            </p>
                        </div>
                        <Switch v-model="disguiseConfig.enabled" />
                    </div>

                    <!-- 自定义登录路径设置 -->
                    <div class="pt-4 border-t border-zinc-800">
                        <div class="max-w-md">
                            <!-- 隐藏的诱饵输入框，吸收浏览器自动填充 -->
                            <input
                                type="text"
                                name="fake_user_for_autofill"
                                autocomplete="username"
                                style="display: none"
                                tabindex="-1"
                                aria-hidden="true"
                            />
                            <input
                                type="password"
                                name="fake_pass_for_autofill"
                                autocomplete="current-password"
                                style="display: none"
                                tabindex="-1"
                                aria-hidden="true"
                            />
                            <Input
                                :label="t('settings.customAdminPath')"
                                v-model="settings.customLoginPath"
                                :error="customLoginPathError"
                                :placeholder="t('settings.customAdminPathPlaceholder')"
                                prefix="/"
                                autocomplete="off"
                                name="custom_admin_path_setting_no_autofill"
                                type="search"
                            />
                        </div>
                        <p class="text-xs text-zinc-400 mt-1">
                            {{ t('settings.customAdminPathHint') }}
                        </p>
                        <p class="text-xs text-amber-400 mt-1 flex items-center gap-1.5">
                            <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            {{ t('settings.reservedPathListHint') }}
                        </p>
                    </div>

                    <div
                        v-show="disguiseConfig.enabled"
                        class="bg-transparent rounded-md p-4 space-y-4 border border-zinc-800 transition-all duration-300"
                    >
                        <div>
                            <label
                                class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block"
                                >{{ t('settings.disguiseStrategy') }}</label
                            >
                            <div class="flex flex-col sm:flex-row gap-4">
                                <label class="flex items-center cursor-pointer group">
                                    <input
                                        type="radio"
                                        value="default"
                                        v-model="disguiseConfig.pageType"
                                        class="h-4 w-4 text-zinc-100 focus-visible:ring-zinc-500 border-zinc-700 bg-zinc-900"
                                    />
                                    <div class="ml-3">
                                        <span
                                            class="block text-sm font-medium text-zinc-200 group-hover:text-zinc-100"
                                            >{{ t('settings.disguiseDefault404') }}</span
                                        >
                                        <span class="block text-xs text-zinc-500">{{
                                            t('settings.disguiseDefault404Desc')
                                        }}</span>
                                    </div>
                                </label>
                                <label class="flex items-center cursor-pointer group">
                                    <input
                                        type="radio"
                                        value="redirect"
                                        v-model="disguiseConfig.pageType"
                                        class="h-4 w-4 text-zinc-100 focus-visible:ring-zinc-500 border-zinc-700 bg-zinc-900"
                                    />
                                    <div class="ml-3">
                                        <span
                                            class="block text-sm font-medium text-zinc-200 group-hover:text-zinc-100"
                                            >{{ t('settings.disguiseRedirect') }}</span
                                        >
                                        <span class="block text-xs text-zinc-500">{{
                                            t('settings.disguiseRedirectDesc')
                                        }}</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div
                            v-if="disguiseConfig.pageType === 'redirect'"
                            class="animate-fade-in-down"
                        >
                            <div>
                                <Input
                                    :label="t('settings.disguiseTargetUrl')"
                                    v-model="disguiseConfig.redirectUrl"
                                    placeholder="www.example.com"
                                    type="url"
                                />
                            </div>
                        </div>

                        <div
                            class="flex items-center gap-2 text-xs text-zinc-400 bg-transparent border border-zinc-800 p-2.5 rounded-md"
                        >
                            <span class="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0"></span>
                            <span>{{ t('settings.disguiseBrowserOnlyHint') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
    /* Toggle Switch CSS */

    .animate-fade-in-down {
        animation: fadeInDown 0.3s ease-out;
    }

    @keyframes fadeInDown {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
