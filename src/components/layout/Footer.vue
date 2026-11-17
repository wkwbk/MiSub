<script setup>
    import { computed } from 'vue';
    import { useVersionStore } from '@/stores/version';
    import packageJson from '../../../package.json';

    defineProps({
        hideBranding: {
            type: Boolean,
            default: false,
        },
        hasMobileNav: {
            type: Boolean,
            default: false,
        },
    });

    const versionStore = useVersionStore();
    const currentYear = computed(() => new Date().getFullYear());
    const currentVersion = packageJson.version;
</script>

<template>
    <footer
        class="w-full text-center p-8 border-t border-zinc-800 bg-[#131515] mt-8"
        :class="{ 'footer-with-mobile-nav': hasMobileNav }"
    >
        <div
            class="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-zinc-500"
        >
            <p class="font-mono">
                <template v-if="!hideBranding">
                    Copyright © {{ currentYear }}
                    <a
                        href="https://github.com/wkwbk/MiSub"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold text-zinc-300 hover:text-zinc-100 hover:underline transition-colors"
                    >
                        MiSUB </a
                    >. All Rights Reserved.
                </template>
                <template v-else> Copyright © {{ currentYear }}. All Rights Reserved. </template>
            </p>
            <button
                @click="versionStore.openModal"
                class="px-2 py-0.5 rounded-md bg-transparent text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer border border-zinc-800 touch-target-min"
            >
                v{{ currentVersion }}
            </button>
        </div>
    </footer>
</template>

<style scoped>
    @media (max-width: 767.98px) {
        .footer-with-mobile-nav {
            padding-bottom: calc(6rem + max(env(safe-area-inset-bottom, 0px), 12px));
        }
    }
</style>
