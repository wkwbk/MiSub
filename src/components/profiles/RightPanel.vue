<script setup>
    import { computed, onUnmounted, ref } from 'vue';
    import { Check, Copy, QrCode } from '@lucide/vue';
    import Select from '@/components/ui/Select.vue';
    import { useToastStore } from '@/stores/toast.js';
    import { useUIStore } from '@/stores/ui.js';
    import { useI18n } from '@/i18n/index.js';

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
            class="bg-surface rounded-md border border-line shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
            :class="compact ? 'p-4' : 'p-5'"
        >
            <h3
                class="font-semibold text-fg pb-4 mb-4 border-b border-line flex items-center gap-2 list-item-animation"
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
                class="mb-4 rounded-md border border-line bg-transparent p-3 text-fg list-item-animation"
                style="--delay-index: 1"
            >
                <p class="text-xs font-medium text-fg flex items-center gap-2">
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    {{ t('dashboard.linkCard.setupTitle') }}
                </p>
                <div class="mt-2.5 grid gap-2">
                    <router-link
                        v-for="task in setupTasks"
                        :key="task.id"
                        :to="task.to"
                        class="block rounded-md border border-line bg-transparent px-3 py-2 text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                    >
                        <span class="block font-medium text-fg">{{ task.title }}</span>
                        <span class="mt-0.5 block text-fg-muted">{{ task.description }}</span>
                    </router-link>
                </div>
            </div>

            <div class="mb-4 list-item-animation" style="--delay-index: 2">
                <label
                    class="block text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5"
                    >{{ t('dashboard.linkCard.selectContent') }}</label
                >
                <Select
                    v-model="selectedId"
                    trigger-class="font-mono"
                    :options="[
                        { value: 'default', label: t('dashboard.linkCard.defaultSubscription') },
                        ...(profiles || []).map((profile) => ({
                            value: profile.customId || profile.id,
                            label: profile.name,
                        })),
                    ]"
                />
            </div>

            <div class="mb-4 list-item-animation" style="--delay-index: 3">
                <label
                    class="block text-xs font-medium text-fg-muted uppercase tracking-wider mb-2"
                    >{{ t('dashboard.linkCard.selectFormat') }}</label
                >
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
                                ? 'bg-accent text-accent-fg border-accent font-semibold'
                                : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
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
                    class="w-full min-h-11 text-xs sm:text-sm text-fg bg-transparent rounded-md pl-3 pr-22 py-2.5 border border-line focus-visible:outline-hidden focus-visible:border-line-strong font-mono shadow-none"
                    :class="{
                        'cursor-not-allowed text-fg-subtle': !isLinkValid,
                    }"
                    :aria-label="t('dashboard.linkCard.linkField')"
                />
                <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                        @click="$emit('qrcode', subLink, t('dashboard.linkCard.qrTitle'))"
                        :disabled="!isLinkValid"
                        class="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted transition-colors duration-200 shadow-none"
                        :class="
                            isLinkValid
                                ? 'hover:text-fg hover:bg-hover'
                                : 'cursor-not-allowed opacity-50'
                        "
                        :title="t('dashboard.linkCard.showQrCode')"
                        :aria-label="t('dashboard.linkCard.showQrCode')"
                    >
                        <QrCode class="h-4 w-4" stroke-width="1.5" />
                    </button>
                    <button
                        @click="copyToClipboard"
                        :disabled="!isLinkValid"
                        class="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted transition-colors duration-200 shadow-none"
                        :class="
                            isLinkValid
                                ? 'hover:text-fg hover:bg-hover'
                                : 'cursor-not-allowed opacity-50'
                        "
                        :title="t('dashboard.linkCard.copyLink')"
                        :aria-label="t('dashboard.linkCard.copyLink')"
                    >
                        <Transition name="fade" mode="out-in">
                            <Check v-if="copied" class="h-4 w-4 text-fg" stroke-width="2.5" />
                            <Copy v-else class="h-4 w-4" stroke-width="1.5" />
                        </Transition>
                    </button>
                </div>
            </div>

            <p
                v-if="!isLinkValid || requiredToken.value === 'auto'"
                class="text-xs text-fg-muted mt-3 flex items-start gap-2 list-item-animation"
                style="--delay-index: 5"
            >
                <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>
                    {{ t('dashboard.linkCard.hintPrefix') }}
                    <span v-if="!isLinkValid">
                        {{ t('dashboard.linkCard.fixedTokenHint', { name: requiredToken.name }) }}
                        <router-link
                            to="/dashboard/settings"
                            class="font-medium text-fg underline decoration-zinc-600 underline-offset-4 hover:text-white"
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
