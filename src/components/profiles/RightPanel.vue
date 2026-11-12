<script setup>
    import { ref, computed, onUnmounted } from 'vue';
    import { useToastStore } from '../../stores/toast.js';
    import { useUIStore } from '../../stores/ui.js';
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        config: Object,
        profiles: Array,
        compact: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['qrcode']);

    const { showToast } = useToastStore();
    const uiStore = useUIStore();
    const { t } = useI18n();

    const copied = ref(false);
    let copyTimeout = null;

    const formats = ['universal', 'Base64', 'Clash', 'Sing-Box', 'Surge', 'Loon'];
    const selectedFormat = ref('universal');
    const selectedId = ref('default');

    const formatLabel = (format) =>
        format === 'universal' ? t('dashboard.linkCard.universalFormat') : format;
    const isStableToken = (value) =>
        typeof value === 'string' &&
        value.trim() === value &&
        value !== 'auto' &&
        /^[a-zA-Z0-9-_]+$/.test(value);

    const hasProfiles = computed(() => (props.profiles || []).length > 0);
    const mainTokenReady = computed(() => isStableToken(props.config?.mytoken));
    const profileTokenReady = computed(() => isStableToken(props.config?.profileToken));

    const setupTasks = computed(() => {
        const tasks = [];
        if (!mainTokenReady.value) {
            tasks.push({
                id: 'main-token',
                title: t('dashboard.linkCard.mainTokenTitle'),
                description: t('dashboard.linkCard.mainTokenDesc'),
                to: '/dashboard/settings?focus=mytoken',
            });
        }
        if (!hasProfiles.value) {
            tasks.push({
                id: 'profile',
                title: t('dashboard.linkCard.profileTitle'),
                description: t('dashboard.linkCard.profileDesc'),
                to: '/dashboard/subscriptions?focus=profiles',
            });
        }
        if (hasProfiles.value && !profileTokenReady.value) {
            tasks.push({
                id: 'profile-token',
                title: t('dashboard.linkCard.profileTokenTitle'),
                description: t('dashboard.linkCard.profileTokenDesc'),
                to: '/dashboard/settings?focus=profileToken',
            });
        }
        return tasks;
    });

    const hasSetupTasks = computed(() => setupTasks.value.length > 0);

    const requiredToken = computed(() => {
        return selectedId.value === 'default'
            ? {
                  type: 'mytoken',
                  value: props.config?.mytoken,
                  name: t('dashboard.linkCard.tokenNameMain'),
              }
            : {
                  type: 'profileToken',
                  value: props.config?.profileToken,
                  name: t('dashboard.linkCard.tokenNameShare'),
              };
    });

    const isLinkValid = computed(() => isStableToken(requiredToken.value.value));

    const subLink = computed(() => {
        if (!isLinkValid.value) {
            return t('dashboard.linkCard.configureTokenFirst', { name: requiredToken.value.name });
        }

        const origin = window.location.origin;
        const token = requiredToken.value.value;
        let baseUrl =
            selectedId.value === 'default'
                ? `${origin}/${token}`
                : `${origin}/${token}/${selectedId.value}`;

        if (selectedFormat.value === 'universal') {
            return baseUrl;
        }

        const targetMapping = { 'Sing-Box': 'singbox', QuanX: 'quanx' };
        const formatKey = targetMapping[selectedFormat.value] || selectedFormat.value.toLowerCase();
        return `${baseUrl}?${formatKey}`;
    });

    const copyToClipboard = () => {
        if (!isLinkValid.value) {
            showToast(t('notices.linkInvalid'), 'error');
            return;
        }
        navigator.clipboard.writeText(subLink.value);
        showToast(t('notices.copied'), 'success');
        copied.value = true;
        clearTimeout(copyTimeout);
        copyTimeout = setTimeout(() => {
            copied.value = false;
        }, 2000);
    };

    onUnmounted(() => {
        clearTimeout(copyTimeout);
    });
</script>

<template>
    <div>
        <div
            class="bg-[#171717] rounded-md border border-zinc-800 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
            :class="compact ? 'p-4' : 'p-5'"
        >
            <h3
                class="font-semibold text-zinc-100 pb-4 mb-4 border-b border-zinc-800 flex items-center gap-2 list-item-animation"
                :class="compact ? 'text-sm' : 'text-base'"
                style="--delay-index: 0"
            >
                <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="isLinkValid ? 'bg-emerald-500' : 'bg-amber-500'"
                ></span>
                {{ t('dashboard.linkCard.title') }}
            </h3>

            <div
                v-if="hasSetupTasks"
                class="mb-4 rounded-md border border-zinc-800 bg-transparent p-3 text-zinc-200 list-item-animation"
                style="--delay-index: 1"
            >
                <p class="text-xs font-medium text-zinc-200 flex items-center gap-2">
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    {{ t('dashboard.linkCard.setupTitle') }}
                </p>
                <div class="mt-2.5 grid gap-2">
                    <router-link
                        v-for="task in setupTasks"
                        :key="task.id"
                        :to="task.to"
                        class="block rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                    >
                        <span class="block font-medium text-zinc-100">{{ task.title }}</span>
                        <span class="mt-0.5 block text-zinc-400">{{ task.description }}</span>
                    </router-link>
                </div>
            </div>

            <div class="mb-4 list-item-animation" style="--delay-index: 2">
                <label class="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">{{
                    t('dashboard.linkCard.selectContent')
                }}</label>
                <select
                    v-model="selectedId"
                    class="w-full px-3 py-2 bg-transparent border border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus-visible:border-zinc-500 text-sm text-zinc-100 font-mono"
                >
                    <option value="default" class="bg-[#131515] text-zinc-100">
                        {{ t('dashboard.linkCard.defaultSubscription') }}
                    </option>
                    <option
                        v-for="profile in profiles"
                        :key="profile.id"
                        :value="profile.customId || profile.id"
                        class="bg-[#131515] text-zinc-100"
                    >
                        {{ profile.name }}
                    </option>
                </select>
            </div>

            <div class="mb-4 list-item-animation" style="--delay-index: 3">
                <label class="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">{{
                    t('dashboard.linkCard.selectFormat')
                }}</label>
                <div class="grid gap-2" :class="compact ? 'grid-cols-2' : 'grid-cols-3'">
                    <button
                        v-for="(format, index) in formats"
                        :key="format"
                        @click="selectedFormat = format"
                        :aria-pressed="selectedFormat === format"
                        class="min-h-10 px-3 py-2 text-xs font-mono font-medium rounded-md border transition-colors flex justify-center items-center text-center shadow-none list-item-animation"
                        :style="{ '--delay-index': index }"
                        :class="[
                            selectedFormat === format
                                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                                : 'bg-transparent text-zinc-300 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100',
                        ]"
                    >
                        {{ formatLabel(format) }}
                    </button>
                </div>
            </div>

            <div class="relative list-item-animation" style="--delay-index: 4">
                <input
                    type="text"
                    :value="subLink"
                    readonly
                    :disabled="!isLinkValid"
                    class="w-full min-h-11 text-xs sm:text-sm text-zinc-200 bg-transparent rounded-md pl-3 pr-22 py-2.5 border border-zinc-800 focus-visible:outline-hidden focus-visible:border-zinc-500 font-mono shadow-none"
                    :class="{
                        'cursor-not-allowed text-zinc-500': !isLinkValid,
                    }"
                    :aria-label="t('dashboard.linkCard.linkField')"
                />
                <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                        @click="$emit('qrcode', subLink, t('dashboard.linkCard.qrTitle'))"
                        :disabled="!isLinkValid"
                        class="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-400 transition-colors duration-150 shadow-none"
                        :class="
                            isLinkValid
                                ? 'hover:text-zinc-100 hover:bg-zinc-900'
                                : 'cursor-not-allowed opacity-50'
                        "
                        :title="t('dashboard.linkCard.showQrCode')"
                        :aria-label="t('dashboard.linkCard.showQrCode')"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="1.5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z"
                            />
                        </svg>
                    </button>
                    <button
                        @click="copyToClipboard"
                        :disabled="!isLinkValid"
                        class="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-400 transition-colors duration-150 shadow-none"
                        :class="
                            isLinkValid
                                ? 'hover:text-zinc-100 hover:bg-zinc-900'
                                : 'cursor-not-allowed opacity-50'
                        "
                        :title="t('dashboard.linkCard.copyLink')"
                        :aria-label="t('dashboard.linkCard.copyLink')"
                    >
                        <Transition name="fade" mode="out-in">
                            <svg
                                v-if="copied"
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 text-zinc-100"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                stroke-width="2.5"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                            <svg
                                v-else
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                stroke-width="1.5"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </Transition>
                    </button>
                </div>
            </div>

            <p
                v-if="!isLinkValid || requiredToken.value === 'auto'"
                class="text-xs text-zinc-400 mt-3 flex items-start gap-2 list-item-animation"
                style="--delay-index: 5"
            >
                <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>
                    {{ t('dashboard.linkCard.hintPrefix') }}
                    <span v-if="!isLinkValid">
                        {{ t('dashboard.linkCard.fixedTokenHint', { name: requiredToken.name }) }}
                        <router-link
                            to="/dashboard/settings"
                            class="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white"
                            >{{ t('dashboard.linkCard.settingsLink') }}</router-link
                        >
                        {{
                            t('dashboard.linkCard.fixedTokenHintSuffix', {
                                name: requiredToken.name,
                            })
                        }}
                    </span>
                    <span
                        v-else-if="
                            requiredToken.type === 'mytoken' && requiredToken.value === 'auto'
                        "
                    >
                        {{ t('dashboard.linkCard.autoTokenWarning') }}
                    </span>
                </span>
            </p>
        </div>
    </div>
</template>

<style scoped>
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.2s ease;
    }
    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
