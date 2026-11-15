<script setup>
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();
    /**
     * 文件上传导入：拖拽 / 点击选择本地文件，读取文本后走后端 /api/parse_subscription。
     * 纯 UI 组件，解析与入库由父组件处理。
     */
    import { ref, computed } from 'vue';
    import { CloudUpload, Loader2 } from 'lucide-vue-next';
    import { IMPORT_FILE_ACCEPT, readFilesAsText } from '../../../utils/importFile.js';

    const props = defineProps({
        isProcessing: {
            type: Boolean,
            default: false,
        },
        parseStatus: {
            type: String,
            default: '',
        },
        errorMessage: {
            type: String,
            default: '',
        },
        successMessage: {
            type: String,
            default: '',
        },
    });

    const emit = defineEmits(['files']);

    const isDragging = ref(false);
    const fileInput = ref(null);

    const acceptAttr = IMPORT_FILE_ACCEPT;

    const statusText = computed(() => props.parseStatus || '');

    function openPicker() {
        if (props.isProcessing) return;
        fileInput.value?.click();
    }

    function onInputChange(event) {
        const files = event.target.files;
        if (files && files.length) emit('files', files);
        // 允许重复选择同一文件
        event.target.value = '';
    }

    function onDrop(event) {
        isDragging.value = false;
        if (props.isProcessing) return;
        const files = event.dataTransfer?.files;
        if (files && files.length) emit('files', files);
    }

    function onDragOver() {
        if (!props.isProcessing) isDragging.value = true;
    }

    function onDragLeave() {
        isDragging.value = false;
    }

    defineExpose({ readFilesAsText });
</script>

<template>
    <div class="space-y-4">
        <div
            class="relative border rounded-md p-6 text-center transition-colors cursor-pointer bg-[#131515]"
            :class="[
                isDragging
                    ? 'border-zinc-500 bg-zinc-900/50'
                    : 'border-zinc-800 hover:border-zinc-700',
                isProcessing ? 'opacity-60 pointer-events-none' : '',
            ]"
            @click="openPicker"
            @drop.prevent="onDrop"
            @dragover.prevent="onDragOver"
            @dragleave.prevent="onDragLeave"
        >
            <input
                ref="fileInput"
                type="file"
                multiple
                class="hidden"
                :accept="acceptAttr"
                @change="onInputChange"
                aria-hidden="true"
            />
            <div class="flex flex-col items-center gap-2">
                <CloudUpload class="h-7 w-7 text-zinc-400" />
                <p class="text-xs font-medium text-zinc-200">
                    {{ t('fileImport.dropHint') }}
                </p>
                <p class="text-xs text-zinc-500">
                    {{ t('fileImport.supportedTypes') }}
                </p>
            </div>
        </div>

        <div class="bg-transparent border border-zinc-800 rounded-md p-3">
            <h4 class="text-xs font-semibold text-zinc-200 mb-2">
                {{ t('fileImport.detectedHeading') }}
            </h4>
            <ul class="text-xs text-zinc-400 space-y-1">
                <li>
                    • <strong class="text-zinc-200">{{ t('fileImport.fmtPlainText') }}</strong
                    >：{{ t('fileImport.fmtPlainTextDesc') }}
                </li>
                <li>
                    • <strong class="text-zinc-200">{{ t('fileImport.fmtBase64') }}</strong
                    >：{{ t('fileImport.fmtBase64Desc') }}
                </li>
                <li>
                    • <strong class="text-zinc-200">{{ t('fileImport.fmtClash') }}</strong
                    >：{{ t('fileImport.fmtClashDesc') }}
                </li>
                <li>
                    • <strong class="text-zinc-200">{{ t('fileImport.fmtSurge') }}</strong
                    >：{{ t('fileImport.fmtSurgeDesc') }}
                </li>
                <li>
                    • <strong class="text-zinc-200">{{ t('fileImport.fmtJson') }}</strong
                    >：{{ t('fileImport.fmtJsonDesc') }}
                </li>
            </ul>
        </div>

        <div v-if="statusText" class="flex items-center gap-2 text-xs text-zinc-300">
            <Loader2 class="h-4 w-4 animate-spin text-zinc-400" />
            <span>{{ statusText }}</span>
        </div>

        <div
            v-if="errorMessage"
            class="flex items-center gap-2 text-xs text-red-400 bg-transparent border border-zinc-800 rounded-md p-2.5"
        >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"></span>
            <span>{{ errorMessage }}</span>
        </div>
        <div
            v-if="successMessage"
            class="flex items-center gap-2 text-xs text-emerald-400 bg-transparent border border-zinc-800 rounded-md p-2.5"
        >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
            <span>{{ successMessage }}</span>
        </div>
    </div>
</template>
