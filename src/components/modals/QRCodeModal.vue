<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';
import { computed, nextTick, ref, watch } from 'vue';
import { Download } from '@lucide/vue';
import QRCode from 'qrcode';
import Modal from '@/components/ui/Modal.vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { shadowrocketQrPayload } from '@misub/core/domain/shadowrocket-links.js';
import { downloadDataUrlFile } from '@/utils/import-file.js';

const { t } = useI18n();

const { showToast } = useToastStore();

const props = withDefaults(
  defineProps<{
    show?: boolean;
    url: string;
    title?: string;
    subscription?: boolean;
  }>(),
  {
    show: false,
    // 默认值不能用 t()：defineProps 的对象字面量会被提升到模块级，
    // 此时 setup 作用域的 t 尚不存在。改由模板兜底。
    title: '',
    subscription: false,
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const importMode = ref('universal');

const payload = computed(() =>
  props.subscription ? shadowrocketQrPayload(props.url, importMode.value, props.title) : props.url,
);

const importHint = computed(() =>
  importMode.value === 'shadowrocket-config'
    ? t('qr.shadowrocketConfigHint')
    : importMode.value === 'shadowrocket-nodes'
      ? t('qr.shadowrocketNodesHint')
      : t('qr.universalHint'),
);

const generateQRCode = async () => {
  if (!props.url || !canvasRef.value) return;
  if (typeof canvasRef.value.getContext !== 'function' || !canvasRef.value.getContext('2d')) return;
  try {
    await QRCode.toCanvas(canvasRef.value, payload.value, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (err) {
    // 生成失败时画布是空白的，必须告知用户，否则只会看到一个空框
    console.error('QR Code generation failed', err);
    showToast(t('qr.generateFailed'), 'error');
  }
};

watch(
  () => [props.show, props.url, importMode.value],
  async ([newShow, newUrl]) => {
    if (newShow && newUrl) {
      await nextTick();
      generateQRCode();
    }
  },
  { immediate: true },
);

watch(
  () => [props.show, props.url],
  () => {
    importMode.value = 'universal';
  },
);

const downloadQRCode = () => {
  if (!canvasRef.value) return;
  downloadDataUrlFile(
    canvasRef.value.toDataURL('image/png'),
    `${props.title || 'qrcode'}${props.subscription ? `-${importMode.value}` : ''}.png`,
  );
};
</script>

<template>
  <Modal :show="show" :show-confirm="false" @update:show="emit('update:show', $event)">
    <template #title>
      <h3 class="text-base font-semibold text-fg">
        {{ title || t('qr.title') }}
      </h3>
    </template>
    <template #body>
      <div class="flex flex-col items-center gap-5 py-4">
        <div v-if="subscription" class="w-full space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted" for="qr-import-mode">
            {{ t('qr.importMode') }}
          </label>
          <select
            id="qr-import-mode"
            v-model="importMode"
            class="w-full rounded-md border border-line bg-inset px-3 py-2 text-xs text-fg focus-visible:outline-hidden focus-visible:border-line-strong"
          >
            <option value="universal">{{ t('qr.universal') }}</option>
            <option value="shadowrocket-config">{{ t('copyLink.shadowrocketConfig') }}</option>
            <option value="shadowrocket-nodes">{{ t('copyLink.shadowrocketNodes') }}</option>
          </select>
          <p class="text-xs text-fg-subtle leading-relaxed">{{ importHint }}</p>
        </div>

        <div class="bg-white p-3 rounded-md border border-line shadow-none">
          <canvas ref="canvasRef" class="w-64 h-64 rounded-sm"></canvas>
        </div>

        <p class="text-xs font-mono text-center text-fg-subtle max-w-xs break-all">
          {{ subscription ? t('qr.privateLinkHint') : url }}
        </p>

        <button
          class="flex items-center gap-2 px-5 py-2 bg-accent hover:opacity-90 text-accent-fg rounded-md text-xs font-medium transition-colors shadow-none"
          @click="downloadQRCode"
        >
          <Download class="h-4 w-4" />
          {{ t('qr.saveImage') }}
        </button>
      </div>
    </template>
  </Modal>
</template>
