<script setup>
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();
    import { ref, watch, nextTick } from 'vue';
    import { Download } from 'lucide-vue-next';
    import QRCode from 'qrcode';
    import Modal from '../forms/Modal.vue';
    import { useToastStore } from '../../stores/toast.js';

    const { showToast } = useToastStore();

    const props = defineProps({
        show: {
            type: Boolean,
            default: false,
        },
        url: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            // 默认值不能用 t()：defineProps 的对象字面量会被提升到模块级，
            // 此时 setup 作用域的 t 尚不存在。改由模板兜底。
            default: '',
        },
    });

    const emit = defineEmits(['update:show']);

    const canvasRef = ref(null);

    const generateQRCode = async () => {
        if (!props.url || !canvasRef.value) return;
        try {
            await QRCode.toCanvas(canvasRef.value, props.url, {
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
        () => [props.show, props.url],
        async ([newShow, newUrl]) => {
            if (newShow && newUrl) {
                await nextTick();
                generateQRCode();
            }
        },
        { immediate: true }
    );

    const downloadQRCode = () => {
        if (!canvasRef.value) return;
        const link = document.createElement('a');
        link.download = `${props.title || 'qrcode'}.png`;
        link.href = canvasRef.value.toDataURL('image/png');
        link.click();
    };
</script>

<template>
    <Modal :show="show" @update:show="emit('update:show', $event)">
        <template #title>
            <h3 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {{ title || t('qr.title') }}
            </h3>
        </template>
        <template #body>
            <div class="flex flex-col items-center gap-5 py-4">
                <div
                    class="bg-white p-3 rounded-md border border-zinc-200 dark:border-zinc-800 shadow-none"
                >
                    <canvas ref="canvasRef" class="w-64 h-64 rounded-sm"></canvas>
                </div>

                <p class="text-xs font-mono text-center text-zinc-500 max-w-xs break-all">
                    {{ url }}
                </p>

                <button
                    @click="downloadQRCode"
                    class="flex items-center gap-2 px-5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-zinc-100 dark:text-zinc-900 rounded-md text-xs font-medium transition-colors shadow-none"
                >
                    <Download class="h-4 w-4" />
                    {{ t('qr.saveImage') }}
                </button>
            </div>
        </template>
    </Modal>
</template>
