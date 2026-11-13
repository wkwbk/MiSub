<script setup>
    import { X } from 'lucide-vue-next';
    import { useToastStore } from '../../stores/toast.js';
    import { useI18n } from '../../i18n/index.js';

    const toastStore = useToastStore();
    const { t } = useI18n();

    // Screen readers announce each toast on insertion. Errors are assertive so
    // they interrupt; everything else is polite and waits for a pause.
    const getToastRole = (type) => (type === 'error' ? 'alert' : 'status');
    const getToastAriaLive = (type) => (type === 'error' ? 'assertive' : 'polite');

    // 🆕 增强的 Toast 配置
    const getToastConfig = (type) => {
        const configs = {
            success: {
                dot: 'bg-emerald-500',
            },
            error: {
                dot: 'bg-red-500',
            },
            info: {
                dot: 'bg-sky-500',
            },
            warning: {
                dot: 'bg-amber-500',
            },
        };
        return configs[type] || configs.info;
    };

    const handleClose = (id) => {
        toastStore.removeToast(id);
    };
</script>

<template>
    <div
        class="fixed flex flex-col items-end gap-2.5 pointer-events-none top-20 md:top-4 right-4 left-4 md:left-auto max-h-[calc(100vh-120px)] md:max-h-[100vh] overflow-hidden pr-1 pb-safe"
        :style="{ zIndex: 'var(--z-toast)' }"
    >
        <TransitionGroup name="toast">
            <div
                v-for="toast in toastStore.toasts"
                :key="toast.id"
                :role="getToastRole(toast.type)"
                :aria-live="getToastAriaLive(toast.type)"
                aria-atomic="true"
                class="toast-container pointer-events-auto w-full sm:w-auto sm:min-w-80 max-w-md bg-[#171717] border border-zinc-800 rounded-md shadow-none overflow-hidden transition-all duration-200 relative"
            >
                <!-- Toast 内容 -->
                <div class="relative p-3.5 pl-4">
                    <!-- 关闭按钮 -->
                    <button
                        @click="handleClose(toast.id)"
                        class="toast-close-btn absolute top-2 right-2 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors focus-visible:outline-none w-6 h-6 touch-target"
                        :aria-label="t('common.toastClose')"
                    >
                        <X class="w-3.5 h-3.5 flex-shrink-0" />
                    </button>

                    <!-- 圆点和消息 -->
                    <div class="flex items-center gap-2.5 pr-7">
                        <span
                            class="h-1.5 w-1.5 rounded-full shrink-0"
                            :class="getToastConfig(toast.type).dot"
                        ></span>

                        <!-- 消息内容 -->
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-medium text-zinc-200 leading-relaxed break-words">
                                {{ toast.message }}
                            </p>
                        </div>
                    </div>

                    <!-- 进度条 -->
                    <div class="absolute bottom-0 left-0 right-0 h-[1px] bg-zinc-800">
                        <div
                            class="h-full bg-zinc-500 ease-linear progress-bar"
                            :style="{ animationDuration: `${toast.duration}ms` }"
                        ></div>
                    </div>
                </div>
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
    /* Toast 容器安全区域 */
    .pb-safe {
        padding-bottom: max(env(safe-area-inset-bottom, 20px), 80px);
    }

    @media (min-width: 768px) {
        .pb-safe {
            padding-bottom: env(safe-area-inset-bottom, 20px);
        }
    }

    /* Toast 列表动画 */
    .toast-move,
    .toast-enter-active,
    .toast-leave-active {
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        width: 100%;
    }

    .toast-enter-from,
    .toast-leave-to {
        opacity: 0;
        transform: translateX(100%) scale(0.95);
    }

    .toast-leave-active {
        position: absolute;
        /* 确保退出时也是绝对定位，以便腾出空间给后续元素上移 */
        right: 0;
        left: 0;
    }

    @media (min-width: 640px) {
        .toast-leave-active {
            left: auto;
        }
    }

    /* 进度条动画 */
    .progress-bar {
        animation-name: shrink;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
    }

    @keyframes shrink {
        from {
            width: 100%;
        }
        to {
            width: 0%;
        }
    }

    /* 微光效果 */
    .toast-container::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        animation: shimmer 0.6s ease-out 0.2s;
        pointer-events: none;
    }

    @keyframes shimmer {
        0% {
            left: -100%;
        }
        100% {
            left: 100%;
        }
    }

    /* 移动端优化：粗指针设备下把关闭按钮贴边，避免放大热区后遮挡内容
       （44px 尺寸由全局 .touch-target 提供，此处只做位移补偿） */
    @media (pointer: coarse) {
        .toast-close-btn {
            top: 4px;
            right: 4px;
        }
    }
</style>
