<script setup>
import { Download, X } from '@lucide/vue';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss.js';
import { useScrollLock } from '@/composables/useScrollLock.js';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  profile: {
    type: Object,
    required: true,
  },
  isExpanded: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'download', 'register-canvas']);

const { handleBackdropPointerDown, handleBackdropClick } = useBackdropDismiss(() => emit('close'));
useScrollLock(() => props.isExpanded);
</script>

<template>
  <Teleport to="body">
    <Transition name="qr-overlay">
      <div
        v-if="isExpanded"
        :style="{ zIndex: 'var(--z-modal)' }"
        aria-modal="true"
        class="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        @pointerdown.capture="handleBackdropPointerDown"
        @click.self="handleBackdropClick"
      >
        <div class="modal-surface relative rounded-lg p-6 max-w-sm w-full mx-4 transform transition-all" @click.stop>
          <!-- Close Button -->
          <button
            :aria-label="t('common.close')"
            class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-md border border-transparent text-fg-subtle hover:border-line-strong hover:text-fg hover:bg-hover transition-colors"
            @click="emit('close')"
          >
            <X class="w-4 h-4" />
          </button>

          <div class="flex flex-col items-center pt-2">
            <h4 class="text-base font-semibold text-fg mb-1">
              {{ profile.name }}
            </h4>
            <p class="text-xs text-fg-subtle mb-5">
              {{ t('public.scanToImport') }}
            </p>

            <div
              class="bg-white p-3 rounded-md shadow-none border border-line w-64 h-64 flex items-center justify-center"
            >
              <canvas
                :ref="
                  (el) => {
                    if (el) emit('register-canvas', profile.id, el);
                  }
                "
                class="max-w-full h-auto rounded-sm"
              ></canvas>
            </div>

            <button
              class="mt-6 w-full flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-accent-fg bg-accent hover:opacity-90 rounded-md transition-colors shadow-none"
              @click="emit('download')"
            >
              <Download class="w-4 h-4" />
              {{ t('public.downloadQr') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.qr-overlay-enter-active .bg-white,
.qr-overlay-leave-active .bg-white {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.qr-overlay-enter-from {
  opacity: 0;
}

.qr-overlay-enter-from > div {
  transform: scale(0.9);
  opacity: 0;
}

.qr-overlay-leave-to {
  opacity: 0;
}

.qr-overlay-leave-to > div {
  transform: scale(0.9);
  opacity: 0;
}
</style>
