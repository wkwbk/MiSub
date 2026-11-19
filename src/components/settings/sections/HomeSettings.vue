<script setup>
    import { Home } from '@lucide/vue';
    import Input from '@/components/ui/Input.vue';
    import SectionHeader from '@/components/settings/SectionHeader.vue';
    import AnnouncementSettings from '@/components/settings/sections/AnnouncementSettings.vue';
    import ClientSettings from '@/components/settings/sections/ClientSettings.vue';
    import GuestbookManagement from '@/components/settings/sections/GuestbookManagement.vue';
    import PublicCoresSettings from '@/components/settings/sections/PublicCoresSettings.vue';
    import PublicLinksSettings from '@/components/settings/sections/PublicLinksSettings.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });
</script>

<template>
    <div v-if="settings" class="space-y-4">
        <!-- {{ t('settings.homeHeroTitle') }} -->
        <section class="rounded-lg border border-line bg-surface p-6">
            <SectionHeader
                :title="t('settings.homeHeroTitle')"
                :description="t('settings.homeHeroDesc')"
            >
                <template #icon>
                    <Home class="h-4 w-4" />
                </template>
            </SectionHeader>
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
        </section>

        <!-- Client Management -->
        <ClientSettings />

        <!-- Public Cores Management -->
        <PublicCoresSettings :settings="settings" />

        <!-- Public Links Management -->
        <PublicLinksSettings :settings="settings" />

        <!-- Announcement Settings -->
        <AnnouncementSettings :settings="settings" />

        <!-- Guestbook Management -->
        <GuestbookManagement :settings="settings" />
    </div>
</template>
