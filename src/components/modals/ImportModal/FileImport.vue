<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';
/**
 * 文件上传导入：拖拽 / 点击选择本地文件，读取文本后走后端 /api/parse_subscription。
 * 纯 UI 组件，解析与入库由父组件处理。
 */
import { computed, ref } from 'vue';
import { CloudUpload, Loader2 } from '@lucide/vue';
import { IMPORT_FILE_ACCEPT, readFilesAsText } from '@/utils/import-file.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    isProcessing?: boolean;
    parseStatus?: string;
    errorMessage?: string;
    successMessage?: string;
  }>(),
  {
    isProcessing: false,
    parseStatus: '',
    errorMessage: '',
    successMessage: '',
  },
);

const emit = defineEmits<{
  files: [files: FileList];
}>();

const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const acceptAttr = IMPORT_FILE_ACCEPT;

const statusText = computed(() => props.parseStatus || '');

function openPicker() {
  if (props.isProcessing) return;
  fileInput.value?.click();
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files && files.length) emit('files', files);
  // 允许重复选择同一文件
  input.value = '';
}

function onDrop(event: DragEvent) {
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
      :class="[
        isDragging ? 'border-line-strong bg-elevated-card' : 'border-line hover:border-line-strong',
        isProcessing ? 'opacity-60 pointer-events-none' : '',
      ]"
      class="relative border rounded-md p-6 text-center transition-colors cursor-pointer bg-inset"
      @click="openPicker"
      @drop.prevent="onDrop"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
    >
      <input
        ref="fileInput"
        :accept="acceptAttr"
        aria-hidden="true"
        class="hidden"
        multiple
        type="file"
        @change="onInputChange"
      />
      <div class="flex flex-col items-center gap-2">
        <CloudUpload class="h-7 w-7 text-fg-muted" />
        <p class="text-xs font-medium text-fg">
          {{ t('fileImport.dropHint') }}
        </p>
        <p class="text-xs text-fg-subtle">
          {{ t('fileImport.supportedTypes') }}
        </p>
      </div>
    </div>

    <div class="bg-transparent border border-line rounded-md p-3">
      <h4 class="text-xs font-semibold text-fg mb-2">
        {{ t('fileImport.detectedHeading') }}
      </h4>
      <ul class="text-xs text-fg-muted space-y-1">
        <li>
          • <strong class="text-fg">{{ t('fileImport.fmtPlainText') }}</strong>：{{ t('fileImport.fmtPlainTextDesc') }}
        </li>
        <li>
          • <strong class="text-fg">{{ t('fileImport.fmtBase64') }}</strong>：{{ t('fileImport.fmtBase64Desc') }}
        </li>
        <li>
          • <strong class="text-fg">{{ t('fileImport.fmtClash') }}</strong>：{{ t('fileImport.fmtClashDesc') }}
        </li>
        <li>
          • <strong class="text-fg">{{ t('fileImport.fmtSurge') }}</strong>：{{ t('fileImport.fmtSurgeDesc') }}
        </li>
        <li>
          • <strong class="text-fg">{{ t('fileImport.fmtJson') }}</strong>：{{ t('fileImport.fmtJsonDesc') }}
        </li>
      </ul>
    </div>

    <div v-if="statusText" class="flex items-center gap-2 text-xs text-fg-muted">
      <Loader2 class="h-4 w-4 animate-spin text-fg-muted" />
      <span>{{ statusText }}</span>
    </div>

    <div
      v-if="errorMessage"
      class="flex items-center gap-2 text-xs text-red-400 bg-transparent border border-line rounded-md p-2.5"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"></span>
      <span>{{ errorMessage }}</span>
    </div>
    <div
      v-if="successMessage"
      class="flex items-center gap-2 text-xs text-emerald-400 bg-transparent border border-line rounded-md p-2.5"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span>
      <span>{{ successMessage }}</span>
    </div>
  </div>
</template>
