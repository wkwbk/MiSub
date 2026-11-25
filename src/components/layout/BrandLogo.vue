<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    textSizeClass?: string;
    iconSize?: number;
    // 跳转目标：已登录时由调用方传入 /dashboard，避免先落到 "/" 再被重定向，
    // 造成仪表盘组件树卸载后重新挂载（定时器重启、数据重复校验、界面闪烁）。
    to?: string;
  }>(),
  {
    textSizeClass: 'text-lg',
    iconSize: 28,
    to: '/',
  },
);

// 伪装开启时服务端会对未鉴权的 /logo.png 返回伪装页或 404（有意的指纹防护），
// 浏览器随后会显示「图片损坏」占位符。这里降级为内联图标，保持视觉完整。
const logoFailed = ref(false);
</script>

<template>
  <router-link :to="to" class="nav-brand-wrap">
    <div aria-hidden="true" class="nav-brand-badge nav-brand-badge-sm">
      <img
        v-if="!logoFailed"
        :height="iconSize"
        :width="iconSize"
        alt="MiSub"
        src="/logo.png"
        decoding="async"
        @error="logoFailed = true"
      />
      <svg
        v-else
        :height="iconSize"
        :width="iconSize"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8M3.6 15h16.8" />
        <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
    </div>
    <span :class="textSizeClass" class="nav-brand-text">MiSub</span>
  </router-link>
</template>
