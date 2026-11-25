<script setup lang="ts">
import { computed } from 'vue';
import { Home } from '@lucide/vue';
import Input from '@/components/ui/Input.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import AnnouncementSettings from '@/components/settings/sections/AnnouncementSettings.vue';
import ClientSettings from '@/components/settings/sections/ClientSettings.vue';
import GuestbookManagement from '@/components/settings/sections/GuestbookManagement.vue';
import PublicCoresSettings from '@/components/settings/sections/PublicCoresSettings.vue';
import PublicLinksSettings from '@/components/settings/sections/PublicLinksSettings.vue';
import { useI18n } from '@/i18n/index.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const settingsModel = computed<AppSettingsConfig>({
  get: () => props.settings,
  set: (val: AppSettingsConfig) => emit('update:settings', val),
});

const patchSettings = (patch: Partial<AppSettingsConfig>): void => {
  emit('update:settings', {
    ...props.settings,
    ...patch,
  });
};

const heroTitle1 = computed({
  get: () => (typeof props.settings.heroTitle1 === 'string' ? props.settings.heroTitle1 : ''),
  set: (val: string) => patchSettings({ heroTitle1: val }),
});

const heroTitle2 = computed({
  get: () => (typeof props.settings.heroTitle2 === 'string' ? props.settings.heroTitle2 : ''),
  set: (val: string) => patchSettings({ heroTitle2: val }),
});

const heroDescription = computed({
  get: () => (typeof props.settings.heroDescription === 'string' ? props.settings.heroDescription : ''),
  set: (val: string) => patchSettings({ heroDescription: val }),
});
</script>

<template>
  <div v-if="settings" class="space-y-4">
    <SettingCard :description="t('settings.homeHeroDesc')" :title="t('settings.homeHeroTitle')">
      <template #icon>
        <Home class="h-4 w-4" />
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Input
            v-model="heroTitle1"
            :label="t('settings.homeHeroTitle1')"
            :placeholder="t('settings.homeHeroTitle1Placeholder')"
          />
        </div>
        <div>
          <Input
            v-model="heroTitle2"
            :label="t('settings.homeHeroTitle2')"
            :placeholder="t('settings.homeHeroTitle2Placeholder')"
          />
        </div>
        <div class="md:col-span-2">
          <Input
            v-model="heroDescription"
            :label="t('settings.homeHeroDescription')"
            :placeholder="t('settings.homeHeroDescriptionPlaceholder')"
          />
        </div>
      </div>
    </SettingCard>

    <ClientSettings />

    <PublicCoresSettings />

    <PublicLinksSettings />

    <AnnouncementSettings v-model:settings="settingsModel" />

    <GuestbookManagement v-model:settings="settingsModel" />
  </div>
</template>
