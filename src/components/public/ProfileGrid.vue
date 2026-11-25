<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileConfig } from '@misub/core/types.js';
import ProfileCard from '@/components/public/ProfileCard.vue';
import HeroProfileCard from '@/components/public/HeroProfileCard.vue';

const props = withDefaults(
  defineProps<{
    profiles?: ProfileConfig[];
    isQrExpanded: (id: string) => boolean;
    profileToken?: string;
  }>(),
  {
    profiles: () => [],
    profileToken: 'sub',
  },
);

const emit = defineEmits<{
  'quick-import': [profile: ProfileConfig];
  'toggle-qr': [profile: ProfileConfig];
  preview: [profile: ProfileConfig];
  'copy-link': [profile: ProfileConfig];
  'copy-short-link': [profile: ProfileConfig];
  'download-qr': [profile: ProfileConfig];
  'register-canvas': [id: string, el: any];
}>();

// 计算布局类型
const isSingleProfile = computed(() => props.profiles.length === 1);
const isTwoProfiles = computed(() => props.profiles.length === 2);

// 动态网格类
const gridClass = computed(() => {
  if (isSingleProfile.value) return 'grid grid-cols-1 gap-4 w-full';
  if (isTwoProfiles.value) return 'grid grid-cols-1 md:grid-cols-2 gap-4 w-full';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full';
});
</script>

<template>
  <!-- 单卡片：响应式布局 -->
  <div v-if="isSingleProfile">
    <!-- 移动端：使用原卡片布局 -->
    <div class="block md:hidden max-w-md mx-auto">
      <ProfileCard
        :is-qr-expanded="isQrExpanded(profiles[0].id)"
        :profile="profiles[0]"
        @preview="emit('preview', profiles[0])"
        @quick-import="emit('quick-import', profiles[0])"
        @toggle-qr="emit('toggle-qr', profiles[0])"
        @copy-link="emit('copy-link', profiles[0])"
        @copy-short-link="emit('copy-short-link', profiles[0])"
        @download-qr="emit('download-qr', profiles[0])"
        @register-canvas="(id, el) => emit('register-canvas', id, el)"
      />
    </div>
    <!-- 桌面端：使用 Hero 样式 -->
    <div class="hidden md:block w-full">
      <HeroProfileCard
        :is-qr-expanded="isQrExpanded(profiles[0].id)"
        :profile="profiles[0]"
        @preview="emit('preview', profiles[0])"
        @quick-import="emit('quick-import', profiles[0])"
        @toggle-qr="emit('toggle-qr', profiles[0])"
        @copy-link="emit('copy-link', profiles[0])"
        @copy-short-link="emit('copy-short-link', profiles[0])"
        @download-qr="emit('download-qr', profiles[0])"
        @register-canvas="(id, el) => emit('register-canvas', id, el)"
      />
    </div>
  </div>

  <!-- 多卡片：网格布局 -->
  <div v-else :class="gridClass">
    <ProfileCard
      v-for="profile in profiles"
      :key="profile.id"
      :is-qr-expanded="isQrExpanded(profile.id)"
      :profile="profile"
      @preview="emit('preview', profile)"
      @quick-import="emit('quick-import', profile)"
      @toggle-qr="emit('toggle-qr', profile)"
      @copy-link="emit('copy-link', profile)"
      @copy-short-link="emit('copy-short-link', profile)"
      @download-qr="emit('download-qr', profile)"
      @register-canvas="(id, el) => emit('register-canvas', id, el)"
    />
  </div>
</template>
