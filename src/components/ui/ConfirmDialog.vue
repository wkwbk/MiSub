<script setup>
import { onMounted, onUnmounted } from 'vue';
import Modal from '@/components/forms/Modal.vue';
import { useI18n } from '@/i18n/index.js';
import { setConfirmHost, settleConfirm, useConfirmState } from '@/composables/useConfirm.js';

const { t } = useI18n();
const pending = useConfirmState();

// 标记宿主已就绪：无宿主时 confirmAction 会回退到原生 window.confirm()
onMounted(() => setConfirmHost(true));
onUnmounted(() => setConfirmHost(false));

const handleConfirm = () => settleConfirm(true);
const handleDismiss = () => settleConfirm(false);
</script>

<template>
  <Modal
    :cancel-text="pending ? pending.cancelText : ''"
    :confirm-text="pending ? pending.confirmText : ''"
    :confirm-variant="pending ? pending.variant : 'primary'"
    :show="Boolean(pending)"
    size="sm"
    z-index="var(--z-confirm)"
    @confirm="handleConfirm"
    @update:show="handleDismiss"
  >
    <template #title>
      <h3 class="text-base font-semibold text-fg">
        {{ pending && pending.title ? pending.title : t('common.confirmAction') }}
      </h3>
    </template>
    <template #body>
      <p class="text-sm leading-relaxed text-fg-muted whitespace-pre-line">
        {{ pending ? pending.message : '' }}
      </p>
    </template>
  </Modal>
</template>
