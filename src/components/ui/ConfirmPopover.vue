<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  confirmText: {
    type: String,
    default: '',
  },
  cancelText: {
    type: String,
    default: '',
  },
  variant: {
    type: String,
    default: 'danger',
    validator: (value) => ['danger', 'primary'].includes(value),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['confirm', 'cancel']);

const isOpen = ref(false);
const triggerRef = ref(null);
const popoverRef = ref(null);
const positionStyle = ref({});

const updatePosition = () => {
  const triggerEl = triggerRef.value;
  if (!triggerEl) return;

  const rect = triggerEl.getBoundingClientRect();
  const popoverWidth = 280;
  const padding = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.right - popoverWidth;
  if (left < padding) left = padding;
  if (left + popoverWidth > viewportWidth - padding) {
    left = Math.max(padding, viewportWidth - popoverWidth - padding);
  }

  const placeAbove = rect.bottom + 150 > viewportHeight && rect.top > 150;
  positionStyle.value = placeAbove
    ? {
        position: 'fixed',
        left: `${left}px`,
        bottom: `${viewportHeight - rect.top + 8}px`,
        width: `${popoverWidth}px`,
        zIndex: 'var(--z-modal-popover)',
      }
    : {
        position: 'fixed',
        left: `${left}px`,
        top: `${rect.bottom + 8}px`,
        width: `${popoverWidth}px`,
        zIndex: 'var(--z-modal-popover)',
      };
};

const openPopover = async () => {
  if (props.disabled) return;
  isOpen.value = true;
  await nextTick();
  updatePosition();
};

const closePopover = () => {
  isOpen.value = false;
};

const togglePopover = () => {
  if (isOpen.value) {
    closePopover();
  } else {
    void openPopover();
  }
};

const handleConfirm = () => {
  closePopover();
  emit('confirm');
};

const handleCancel = () => {
  closePopover();
  emit('cancel');
};

const handleDocumentPointerDown = (event) => {
  if (!isOpen.value) return;
  const target = event.target;
  if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target)) {
    return;
  }
  closePopover();
};

const handleKeydown = (event) => {
  if (isOpen.value && event.key === 'Escape') {
    event.stopPropagation();
    closePopover();
  }
};

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
  } else {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
  }
});

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
});
</script>

<template>
  <div ref="triggerRef" class="inline-flex items-center">
    <slot :is-open="isOpen" :toggle="togglePopover" name="trigger" />
  </div>

  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="isOpen"
        ref="popoverRef"
        :style="positionStyle"
        class="rounded-md border border-line-strong bg-surface p-3.5 shadow-xl text-left"
        role="dialog"
        @click.stop
      >
        <p v-if="title" class="text-xs font-semibold text-fg">
          {{ title }}
        </p>
        <p v-if="description" class="mt-1 text-xs text-fg-muted leading-relaxed">
          {{ description }}
        </p>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button
            class="px-2.5 py-1 text-xs rounded-md border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors"
            type="button"
            @click="handleCancel"
          >
            {{ cancelText || t('actions.cancel') }}
          </button>
          <button
            :class="
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-accent hover:opacity-90 text-accent-fg'
            "
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
            data-testid="confirm-popover-confirm"
            type="button"
            @click="handleConfirm"
          >
            {{ confirmText || t('actions.confirm') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
