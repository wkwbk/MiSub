<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss.js';
import { useScrollLock } from '@/composables/useScrollLock.js';

const props = withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    showCancel?: boolean;
    showConfirm?: boolean;
    confirmKeyword?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | '7xl';
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
    confirmButtonTitle?: string;
    closeOnConfirm?: boolean;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'primary' | 'danger';
    bodyClass?: string;
    zIndex?: string | number;
  }>(),
  {
    show: false,
    title: '',
    showCancel: true,
    showConfirm: true,
    confirmKeyword: undefined,
    size: 'sm',
    confirmDisabled: false,
    confirmLoading: false,
    confirmButtonTitle: '',
    closeOnConfirm: true,
    confirmText: '',
    cancelText: '',
    confirmVariant: 'primary',
    bodyClass: '',
    zIndex: 'var(--z-modal)',
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  confirm: [];
}>();
const { t } = useI18n();
const confirmLabel = computed(() => props.confirmText || t('actions.confirm'));
const cancelLabel = computed(() => props.cancelText || t('actions.cancel'));
const confirmTitle = computed(() => props.confirmButtonTitle || t('actions.confirm'));

const confirmInput = ref('');
const modalPanelRef = ref<HTMLDivElement | null>(null);
const titleId = `modal-title-${Math.random().toString(36).slice(2, 10)}`;

// 记录打开弹窗前的焦点元素，关闭时还原
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(): HTMLElement[] {
  return modalPanelRef.value ? Array.from(modalPanelRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

// Focus trap：Tab / Shift+Tab 循环限制在弹窗内，Escape 关闭
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('update:show', false);
    return;
  }
  if (e.key !== 'Tab') return;

  const focusable = getFocusableElements();
  if (!focusable.length) {
    e.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
};

watch(
  () => props.show,
  async (val) => {
    if (val) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', handleKeydown);
      await nextTick();
      // 优先聚焦第一个可交互元素，否则聚焦弹窗面板本身
      const focusable = getFocusableElements();
      if (focusable.length) {
        focusable[0].focus();
      } else {
        modalPanelRef.value?.focus();
      }
    } else {
      window.removeEventListener('keydown', handleKeydown);
      // 还原焦点到触发元素
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
        previouslyFocused = null;
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const handleConfirm = async () => {
  await emit('confirm');
  if (props.closeOnConfirm) {
    emit('update:show', false);
  }
};

const { handleBackdropPointerDown, handleBackdropClick } = useBackdropDismiss(() => emit('update:show', false));
useScrollLock(() => props.show);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="show"
        :aria-labelledby="titleId"
        :style="{ zIndex }"
        aria-modal="true"
        class="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        @click="handleBackdropClick"
        @pointerdown.capture="handleBackdropPointerDown"
      >
        <Transition name="modal-inner">
          <div
            v-if="show"
            ref="modalPanelRef"
            :class="{
              'max-w-sm': size === 'sm',
              'max-w-md': size === 'md',
              'max-w-lg': size === 'lg',
              'max-w-xl': size === 'xl',
              'max-w-2xl': size === '2xl',
              'max-w-4xl': size === '4xl',
              'max-w-5xl': size === '5xl',
              'max-w-6xl': size === '6xl',
              'max-w-7xl': size === '7xl',
            }"
            class="modal-surface rounded-lg w-full text-left flex flex-col max-h-[85vh] lg:max-h-[90vh] focus-visible:outline-none text-fg overflow-hidden"
            tabindex="-1"
            @click.stop
          >
            <div :id="titleId" class="modal-chrome-header px-6 py-4 shrink-0">
              <slot name="title">
                <h3 class="text-base font-semibold text-fg">
                  {{ title || t('common.confirmAction') }}
                </h3>
              </slot>
            </div>

            <div
              :class="bodyClass || 'px-6 py-5'"
              class="modal-scrollbar grow min-h-0 overflow-y-auto overscroll-contain"
            >
              <slot name="body">
                <p class="text-sm text-fg-muted">
                  {{ t('common.confirmContinue') }}
                </p>
              </slot>
            </div>

            <div
              v-if="$slots.footer || showCancel || showConfirm"
              class="modal-chrome-footer px-6 py-3.5 flex justify-end items-center gap-2.5 shrink-0"
            >
              <slot name="footer">
                <button
                  v-if="showCancel"
                  class="px-4 py-2 bg-transparent hover:bg-hover border border-line hover:border-line-strong text-fg-muted hover:text-fg font-medium text-sm rounded-md transition-colors"
                  @click="emit('update:show', false)"
                >
                  {{ cancelLabel }}
                </button>
                <button
                  v-if="showConfirm"
                  :class="
                    confirmVariant === 'danger'
                      ? 'bg-transparent border border-red-500/40 text-red-500 dark:text-red-400 hover:bg-red-500/10'
                      : 'bg-accent text-accent-fg hover:opacity-90 border border-accent'
                  "
                  :disabled="confirmDisabled || confirmLoading || Boolean(confirmKeyword && confirmInput !== confirmKeyword)"
                  :title="confirmDisabled || confirmLoading ? confirmTitle : t('actions.confirm')"
                  class="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-sm rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="handleConfirm"
                >
                  <Loader2 v-if="confirmLoading" class="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>{{ confirmLabel }}</span>
                </button>
              </slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-inner-enter-active,
.modal-inner-leave-active {
  transition: all 0.25s ease;
}

.modal-inner-enter-from,
.modal-inner-leave-to {
  opacity: 0;
  transform: translateY(50px);
}

@media (min-width: 768px) {
  .modal-inner-enter-from,
  .modal-inner-leave-to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
