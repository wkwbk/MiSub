/** * 共享表单模态框组件 * @author MiSub Team */

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Loader2, X } from '@lucide/vue';
import { t } from '@/i18n/index.js';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss.js';
import { useScrollLock } from '@/composables/useScrollLock.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large', 'xlarge'].includes(value),
  },
  closable: {
    type: Boolean,
    default: true,
  },
  maskClosable: {
    type: Boolean,
    default: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showFooter: {
    type: Boolean,
    default: true,
  },
  confirmText: {
    type: String,
    default: '',
  },
  cancelText: {
    type: String,
    default: '',
  },
  confirmDisabled: {
    type: Boolean,
    default: false,
  },
  confirmButtonClass: {
    type: String,
    default: '',
  },
  cancelButtonClass: {
    type: String,
    default: '',
  },
  maxWidth: {
    type: String,
    default: '',
  },
  maxHeight: {
    type: String,
    default: '',
  },
  zIndex: {
    type: Number,
    default: 1000000,
  },
});

const emit = defineEmits(['update:show', 'confirm', 'cancel', 'close', 'opened', 'closed']);

const modalRef = ref(null);
const contentRef = ref(null);

// 尺寸样式映射
const sizeClasses = {
  small: 'max-w-md',
  medium: 'max-w-lg',
  large: 'max-w-2xl',
  xlarge: 'max-w-4xl',
};

// 计算样式
const modalClasses = computed(() => [
  'modal-surface relative transform overflow-hidden rounded-lg text-left text-fg transition-opacity duration-150',
  sizeClasses[props.size] || sizeClasses.medium,
  props.maxWidth ? `max-w-[${props.maxWidth}]` : '',
]);

const contentStyle = computed(() => {
  const styles = {};
  if (props.maxHeight) {
    styles.maxHeight = props.maxHeight;
  }
  return styles;
});

const resolvedConfirmText = computed(() => props.confirmText || t('actions.confirm'));
const resolvedCancelText = computed(() => props.cancelText || t('actions.cancel'));

// 监听显示状态变化
watch(
  () => props.show,
  async (newVal) => {
    if (newVal) {
      await nextTick();
      emit('opened');
      // 自动聚焦到第一个输入框
      if (contentRef.value) {
        const firstInput = contentRef.value.querySelector('input, textarea, select');
        if (firstInput) {
          firstInput.focus();
        }
      }
    } else {
      emit('closed');
    }
  },
);

// 处理关闭
const handleClose = () => {
  if (props.disabled || props.loading) return;
  emit('update:show', false);
  emit('close');
};

// 处理遮罩点击
const { handleBackdropPointerDown: handleMaskPointerDown, handleBackdropClick: handleMaskClick } = useBackdropDismiss(
  handleClose,
  () => props.maskClosable && !props.disabled && !props.loading,
);
useScrollLock(() => props.show);

// 处理确认
const handleConfirm = () => {
  if (props.disabled || props.loading || props.confirmDisabled) return;
  emit('confirm');
};

// 处理取消
const handleCancel = () => {
  if (props.disabled || props.loading) return;
  emit('cancel');
  handleClose();
};

// 键盘事件处理
const handleKeydown = (event) => {
  if (!props.show) return;

  switch (event.key) {
    case 'Escape':
      if (!props.disabled && !props.loading) {
        handleClose();
      }
      break;
    case 'Enter':
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Enter 确认
        if (!props.disabled && !props.loading && !props.confirmDisabled) {
          handleConfirm();
        }
      }
      break;
  }
};

// 暴露方法给父组件
defineExpose({
  focus: () => {
    if (modalRef.value) {
      modalRef.value.focus();
    }
  },
  getContentElement: () => contentRef.value,
});
</script>

<template>
  <teleport to="body">
    <div
      v-if="show"
      ref="modalRef"
      :style="{ zIndex }"
      aria-modal="true"
      class="fixed inset-0 overflow-y-auto overscroll-contain"
      role="dialog"
      @keydown="handleKeydown"
    >
      <!-- 遮罩层 -->
      <div
        :class="{ 'bg-black/75 backdrop-blur-sm': show }"
        class="flex min-h-full items-center justify-center p-4 text-center sm:p-0"
        @click="handleMaskClick"
        @pointerdown.capture="handleMaskPointerDown"
      >
        <!-- 模态框 -->
        <div :class="modalClasses" class="w-full" @click.stop>
          <!-- 头部 -->
          <div v-if="title || closable" class="modal-chrome-header px-6 py-4">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold leading-6 text-fg">
                {{ title }}
              </h3>

              <!-- 关闭按钮 -->
              <button
                v-if="closable"
                :disabled="disabled || loading"
                class="rounded-md bg-transparent text-fg-muted hover:text-fg hover:bg-hover focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed p-2 transition-colors duration-200"
                type="button"
                @click="handleClose"
              >
                <span class="sr-only">{{ t('common.close') }}</span>
                <X class="h-5 w-5" />
              </button>
            </div>
          </div>

          <!-- 内容区域 -->
          <div ref="contentRef" :style="contentStyle" class="modal-scrollbar px-6 py-4 overflow-y-auto">
            <!-- 默认插槽 -->
            <slot />
          </div>

          <!-- 底部按钮 -->
          <div v-if="showFooter || $slots.footer" class="modal-chrome-footer px-6 py-3.5">
            <!-- 自定义底部插槽 -->
            <slot name="footer">
              <!-- 默认按钮组 -->
              <div class="flex justify-end items-center gap-2.5">
                <button
                  :class="cancelButtonClass"
                  :disabled="disabled || loading"
                  class="inline-flex items-center px-4 py-2 border border-line hover:border-line-strong text-sm font-medium rounded-md text-fg-muted bg-transparent hover:bg-hover hover:text-fg focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  type="button"
                  @click="handleCancel"
                >
                  {{ resolvedCancelText }}
                </button>

                <button
                  :class="[confirmButtonClass, { 'opacity-50 cursor-not-allowed': confirmDisabled }]"
                  :disabled="disabled || loading || confirmDisabled"
                  class="inline-flex items-center px-4 py-2 border border-accent text-sm font-semibold rounded-md text-accent-fg bg-accent hover:opacity-90 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-200"
                  type="button"
                  @click="handleConfirm"
                >
                  <!-- 加载图标 -->
                  <Loader2 v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4" />

                  {{ resolvedConfirmText }}
                </button>
              </div>
            </slot>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
