<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n/index.js';
import Select from '@/components/ui/Select.vue';
import Textarea from '@/components/ui/Textarea.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const dnsModeOptions = computed(() => [
  { value: 'clean', label: t('settings.dnsModeClean') },
  { value: 'polluted', label: t('settings.dnsModePolluted') },
]);

const dnsModeModel = computed({
  get: () => (props.settings.dnsMode === 'polluted' ? 'polluted' : 'clean'),
  set: (value: string) => {
    emit('update:settings', {
      ...props.settings,
      dnsMode: value === 'polluted' ? 'polluted' : 'clean',
    });
  },
});

const inputValue = computed({
  get() {
    return props.settings.customDnsOverride || '';
  },
  set(value: string) {
    emit('update:settings', {
      ...props.settings,
      customDnsOverride: value,
    });
  },
});

const jsonError = ref('');
let validateSeq = 0;

function detectFormat(raw: string): 'json' | 'yaml' {
  if (/^\s*\{/.test(raw)) return 'json';
  return 'yaml';
}

async function validateInput(): Promise<void> {
  const seq = ++validateSeq;
  const raw = inputValue.value.trim();
  if (!raw) {
    jsonError.value = '';
    return;
  }
  const format = detectFormat(raw);
  try {
    let parsed: unknown;
    if (format === 'json') {
      parsed = JSON.parse(raw);
    } else {
      const yaml = await import('js-yaml');
      if (seq !== validateSeq) return;
      parsed = yaml.load(raw);
    }
    if (seq !== validateSeq) return;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      jsonError.value = t('settings.dnsOverrideInvalidObject');
    } else {
      jsonError.value = '';
    }
  } catch {
    if (seq !== validateSeq) return;
    jsonError.value = format === 'json' ? t('settings.dnsOverrideInvalidJson') : t('settings.dnsOverrideInvalidYaml');
  }
}

const hasValue = computed(() => inputValue.value.trim().length > 0);
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg-muted">
        {{ t('settings.dnsModeLabel') }}
      </label>
      <Select v-model="dnsModeModel" :options="dnsModeOptions" size="sm" />
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between gap-2">
        <label class="block text-xs font-medium uppercase tracking-wider text-fg-muted">
          {{ t('settings.dnsOverrideLabel') }}
        </label>
        <span v-if="hasValue" class="badge-success">
          {{ t('settings.dnsOverrideActive') }}
        </span>
      </div>
      <Textarea
        v-model="inputValue"
        :invalid="Boolean(jsonError)"
        :placeholder="t('settings.dnsOverridePlaceholder')"
        class="px-3 py-2.5 font-mono text-xs leading-relaxed"
        rows="8"
        spellcheck="false"
        @blur="validateInput"
      />
      <p v-if="jsonError" class="mt-2 text-xs text-status-danger">
        {{ jsonError }}
      </p>
      <p v-else class="mt-2 text-xs leading-relaxed text-fg-muted">
        {{ t('settings.dnsOverrideHint') }}
      </p>
    </div>
  </div>
</template>
