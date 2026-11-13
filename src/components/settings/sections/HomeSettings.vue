<script setup>
    import { Home } from 'lucide-vue-next';
    import Input from '../../ui/Input.vue';
    import AnnouncementSettings from './AnnouncementSettings.vue';
    import GuestbookManagement from './GuestbookManagement.vue';
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();

    defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });
</script>

<template>
    <div v-if="settings" class="space-y-6">
        <!-- {{ t('settings.homeHeroTitle') }} -->
        <div class="rounded-md border border-zinc-800 bg-transparent p-5 shadow-none">
            <div class="mb-5 flex items-start gap-3">
                <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
                >
                    <Home class="h-4 w-4" />
                </div>
                <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-zinc-100">
                        {{ t('settings.homeHeroTitle') }}
                    </h3>
                    <p class="text-xs text-zinc-400">
                        {{ t('settings.homeHeroDesc') }}
                    </p>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <Input
                        :label="t('settings.homeHeroTitle1')"
                        v-model="settings.heroTitle1"
                        :placeholder="t('settings.homeHeroTitle1Placeholder')"
                    />
                </div>
                <div>
                    <Input
                        :label="t('settings.homeHeroTitle2')"
                        v-model="settings.heroTitle2"
                        :placeholder="t('settings.homeHeroTitle2Placeholder')"
                    />
                </div>
                <div class="md:col-span-2">
                    <Input
                        :label="t('settings.homeHeroDescription')"
                        v-model="settings.heroDescription"
                        :placeholder="t('settings.homeHeroDescriptionPlaceholder')"
                    />
                </div>
            </div>
        </div>

        <!-- Announcement Settings -->
        <AnnouncementSettings :settings="settings" />

        <!-- Guestbook Management -->
        <GuestbookManagement :settings="settings" />
    </div>
</template>
