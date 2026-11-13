<script setup>
    import { ref } from 'vue';
    import { Globe, Lock, AlertCircle, EyeOff, Eye, ArrowLeft } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';
    import Button from '../ui/Button.vue';

    const { t } = useI18n();

    const emit = defineEmits(['success']);
    const password = ref('');
    const isLoading = ref(false);
    const error = ref('');
    const showPassword = ref(false);
    // 伪装开启时 /logo.png 对未鉴权请求会被服务端有意 404（指纹防护），
    // 这里降级为内联图标，避免登录页出现「图片损坏」占位符。
    const logoFailed = ref(false);

    const props = defineProps({
        login: Function,
    });

    const submitLogin = async () => {
        if (!password.value) {
            error.value = t('login.passwordRequired');
            return;
        }
        isLoading.value = true;
        error.value = '';
        try {
            await props.login(password.value);
        } catch (err) {
            error.value = err.message || t('login.unknownError');
        } finally {
            isLoading.value = false;
        }
    };
</script>

<template>
    <div class="w-full max-w-[420px] relative z-10 px-6">
        <div
            class="relative bg-[#171717] border border-zinc-800 rounded-md p-8 shadow-none overflow-hidden"
        >
            <div class="flex flex-col items-center relative z-10">
                <div class="w-16 h-16 mb-6 relative group cursor-default">
                    <div
                        class="w-full h-full flex items-center justify-center relative z-10"
                    >
                        <img
                            v-if="!logoFailed"
                            width="64"
                            height="64"
                            src="/logo.png"
                            alt="MiSub"
                            @error="logoFailed = true"
                        />
                        <Globe
                            v-else
                            :size="64"
                            stroke-width="1.5"
                            class="text-zinc-300"
                            aria-hidden="true"
                        />
                    </div>
                </div>

                <div class="text-center mb-8">
                    <h1
                        class="text-xl font-semibold text-zinc-100 mb-1.5 tracking-tight"
                    >
                        {{ t('login.welcomeBack') }}
                    </h1>
                    <p class="text-xs text-zinc-400">
                        {{ t('login.verifyIdentity') }}
                    </p>
                </div>
            </div>

            <form @submit.prevent="submitLogin" class="space-y-6 relative z-10 w-full mb-2">
                <div class="relative w-full group" :class="{ 'animate-shake': error }">
                    <div
                        class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors"
                        :class="
                            error
                                ? 'text-red-400'
                                : 'text-zinc-500 group-focus-within:text-zinc-300'
                        "
                    >
                        <Lock v-if="!error" class="h-4 w-4" />
                        <AlertCircle v-else class="h-4 w-4" />
                    </div>
                    <input
                        v-model="password"
                        @input="error = ''"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="t('login.passwordPlaceholder')"
                        autocomplete="current-password"
                        :disabled="isLoading"
                        class="w-full bg-[#131515] border rounded-md py-2.5 pl-10 pr-10 text-sm outline-none transition-colors disabled:opacity-50"
                        :class="[
                            error
                                ? 'border-red-500 text-red-400 placeholder-red-400/60 focus:border-red-500'
                                : 'border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:border-zinc-600',
                        ]"
                        :aria-label="t('login.passwordPlaceholder')"
                    />
                    <button
                        type="button"
                        @click="showPassword = !showPassword"
                        class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none rounded-r-md"
                        :aria-label="
                            showPassword ? t('login.hidePassword') : t('login.showPassword')
                        "
                    >
                        <EyeOff v-if="showPassword" class="h-4 w-4" />
                        <Eye v-else class="h-4 w-4" />
                    </button>
                    <transition name="fade">
                        <p
                            v-if="error"
                            class="absolute top-full mt-2 left-0 right-0 text-center text-xs text-red-400 font-medium flex items-center justify-center gap-1"
                        >
                            {{ error }}
                        </p>
                    </transition>
                </div>

                <Button
                    type="submit"
                    class="w-full relative overflow-hidden"
                    :loading="isLoading"
                    variant="primary"
                    size="md"
                >
                    <template v-if="!isLoading">
                        <span class="relative z-10">{{ t('login.authorizeLogin') }}</span>
                    </template>
                    <template v-else>
                        <span>{{ t('login.verifying') }}</span>
                    </template>
                </Button>
            </form>
        </div>

        <div class="mt-6 text-center">
            <a
                href="/"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-zinc-800 bg-transparent hover:bg-zinc-900 text-xs text-zinc-400 hover:text-zinc-100 font-medium transition-colors"
            >
                <ArrowLeft class="h-3.5 w-3.5" />
                {{ t('login.backHome') }}
            </a>
        </div>
    </div>
</template>

<style scoped>
    @keyframes shake {
        0%,
        100% {
            transform: translateX(0);
        }
        25% {
            transform: translateX(-4px);
        }
        75% {
            transform: translateX(4px);
        }
    }

    .animate-shake {
        animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    @keyframes blob {
        0%,
        100% {
            transform: translate(0, 0) scale(1);
        }
        33% {
            transform: translate(30px, -50px) scale(1.1);
        }
        66% {
            transform: translate(-20px, 20px) scale(0.9);
        }
    }

    @keyframes float-slow {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-10px);
        }
    }

    @keyframes pulse-slow {
        0%,
        100% {
            opacity: 0.1;
            transform: scale(1);
        }
        50% {
            opacity: 0.2;
            transform: scale(1.05);
        }
    }

    @keyframes gradient-rotate {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    @keyframes fade-in-up {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .animate-blob {
        animation: blob 8s ease-in-out infinite;
    }

    .animate-float-slow {
        animation: float-slow 6s ease-in-out infinite;
    }

    .animate-pulse-slow {
        animation: pulse-slow 4s ease-in-out infinite;
    }

    .animate-gradient-rotate {
        animation: gradient-rotate 20s linear infinite;
    }

    .animate-fade-in-up {
        animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .animation-delay-2000 {
        animation-delay: 2s;
    }

    .animation-delay-300 {
        animation-delay: 0.3s;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.2s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }

    @media (prefers-reduced-motion: reduce) {
        .animate-blob,
        .animate-float-slow,
        .animate-pulse-slow,
        .animate-gradient-rotate,
        .animate-fade-in-up,
        .animate-shake {
            animation: none !important;
        }
    }
</style>
