<script setup>
    import { Home } from 'lucide-vue-next';
    import Input from '../../ui/Input.vue';
    import SectionHeader from '../SectionHeader.vue';
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
        <section class="rounded-lg border border-zinc-800 bg-[#171717] p-6">
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

        <!-- Announcement Settings -->
        <AnnouncementSettings :settings="settings" />

        <!-- Guestbook Management -->
        <GuestbookManagement :settings="settings" />
    </div>
</template>
