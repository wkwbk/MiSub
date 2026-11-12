<template>
    <div class="not-found-container bg-[#09090b] font-sans text-zinc-100">
        <!-- Content Card -->
        <div
            class="relative z-10 border border-zinc-800 bg-[#0c0c0e] rounded-md p-10 max-w-lg w-[90%] text-center shadow-none"
        >
            <div
                class="font-mono font-bold text-7xl text-zinc-100 mb-4"
            >
                404
            </div>

            <h1 class="text-xl font-semibold mb-3 tracking-tight text-zinc-100">{{ t('notFound.title') }}</h1>
            <p class="text-sm text-zinc-400 mb-8 leading-relaxed">
                {{ t('notFound.description') }}<br />
                {{ t('notFound.loginHint') }}
            </p>

            <router-link
                to="/"
                class="inline-flex items-center justify-center px-6 py-2.5 text-xs font-semibold text-zinc-900 bg-zinc-100 hover:bg-white rounded-md transition-colors shadow-none"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mr-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
                        clip-rule="evenodd"
                    />
                </svg>
                {{ t('actions.backToHome') }}
            </router-link>
        </div>
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useSessionStore } from '../stores/session.js';
    import { useI18n } from '../i18n/index.js';

    const { t } = useI18n();
    const sessionStore = useSessionStore();

    const normalizedCustomPath = computed(() => {
        const raw = sessionStore.publicConfig?.customLoginPath;
        if (!raw || typeof raw !== 'string') return '';
        return raw.trim().replace(/^\/+/, '');
    });

    const hasCustomPath = computed(() => {
        const normalized = normalizedCustomPath.value;
        return normalized.length > 0 && normalized !== 'login';
    });

    const loginPath = computed(() =>
        hasCustomPath.value ? `/${normalizedCustomPath.value}` : '/login'
    );
</script>

<style scoped>
    .not-found-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        width: 100vw;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 9999;
        overflow: hidden;
    }

    .glass-panel {
        background: var(--surface-card-dark);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
    }

    @keyframes float {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-15px);
        }
    }

    @keyframes pulse-slow {
        0%,
        100% {
            opacity: 0.3;
            transform: scale(1);
        }
        50% {
            opacity: 0.5;
            transform: scale(1.1);
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

    .animate-float {
        animation: float 6s ease-in-out infinite;
    }

    .animate-pulse-slow {
        animation: pulse-slow 8s ease-in-out infinite;
    }

    .animate-fade-in-up {
        animation: fade-in-up 0.8s ease-out forwards;
    }
</style>
