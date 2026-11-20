<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: undefined,
  },
  rows: {
    type: [Number, String],
    default: 8,
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  textareaClass: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'input']);

const isFocused = ref(false);
const scrollerRef = ref(null);
const scrollTop = ref(0);

const lineCount = computed(() => {
  const value = props.modelValue ?? '';
  if (!value) return 1;
  return value.split(/\r?\n/).length;
});

const gutterWidth = computed(() => {
  const digits = Math.max(2, String(lineCount.value).length);
  return `${digits * 0.55 + 1.25}rem`;
});

// 与 leading-5 (1.25rem) + py-3 (1.5rem) 保持一致，固定可视区高度
const viewportHeight = computed(() => {
  const rowCount = Math.max(1, Number(props.rows) || 8);
  return `${rowCount * 1.25 + 1.5}rem`;
});

// 末尾补一个空格，确保尾随空行与最右侧留白都被计入网格尺寸
const mirrorText = computed(() => `${props.modelValue ?? ''} `);

const syncScroll = () => {
  if (!scrollerRef.value) return;
  scrollTop.value = scrollerRef.value.scrollTop;
};

const handleInput = (event) => {
  emit('update:modelValue', event.target.value);
  emit('input', event);
  nextTick(syncScroll);
};

const handleFocus = (event) => {
  isFocused.value = true;
  emit('focus', event);
};

const handleBlur = (event) => {
  isFocused.value = false;
  emit('blur', event);
};

watch(
  () => props.modelValue,
  () => {
    nextTick(syncScroll);
  },
);
</script>

<template>
  <div
    :class="[isFocused ? 'border-line-strong' : 'border-line hover:border-line-strong']"
    class="relative border rounded-md transition-colors overflow-hidden bg-inset"
  >
    <slot name="overlay" />
    <div :style="{ height: viewportHeight }" class="flex">
      <div
        :style="{ width: gutterWidth }"
        aria-hidden="true"
        class="relative shrink-0 select-none border-r border-line bg-canvas font-mono text-xs leading-5 text-fg-subtle"
      >
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div :style="{ transform: `translateY(-${scrollTop}px)` }" class="py-3 px-2 text-right will-change-transform">
            <div v-for="n in lineCount" :key="n">{{ n }}</div>
          </div>
        </div>
      </div>
      <div ref="scrollerRef" class="flex-1 min-w-0 h-full overflow-x-auto overflow-y-auto" @scroll="syncScroll">
        <div class="inline-grid min-w-full min-h-full">
          <div
            :class="textareaClass"
            aria-hidden="true"
            class="col-start-1 row-start-1 invisible whitespace-pre pointer-events-none py-3 pl-3 pr-5 font-mono text-xs leading-5"
          >
            {{ mirrorText }}
          </div>
          <textarea
            :id="id"
            :class="textareaClass"
            :disabled="disabled"
            :placeholder="placeholder"
            :rows="rows"
            :value="modelValue"
            class="col-start-1 row-start-1 w-full h-full overflow-hidden bg-transparent border-0 focus-visible:ring-0 text-fg placeholder:text-fg-subtle text-xs font-mono leading-5 resize-none py-3 pl-3 pr-5 outline-none whitespace-pre"
            wrap="off"
            @blur="handleBlur"
            @focus="handleFocus"
            @input="handleInput"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>
