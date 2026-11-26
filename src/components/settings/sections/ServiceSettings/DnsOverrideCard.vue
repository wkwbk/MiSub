<script setup lang="ts">
import { computed, ref } from 'vue';
import { Globe } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import SettingCard from '@/components/settings/SettingCard.vue';
import Textarea from '@/components/ui/Textarea.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

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
  <SettingCard :description="t('settings.dnsOverrideDesc')" :title="t('settings.dnsOverrideTitle')">
    <template #icon>
      <Globe class="h-4 w-4" />
    </template>
    <template v-if="hasValue" #actions>
      <span class="badge-success">
        {{ t('settings.dnsOverrideActive') }}
      </span>
    </template>

    <div>
      <label class="mb-2 block text-xs font-medium uppercase tracking-wider text-fg-muted">
        {{ t('settings.dnsOverrideLabel') }}
      </label>
      <Textarea
        v-model="inputValue"
        :invalid="Boolean(jsonError)"
        :placeholder="t('settings.dnsOverridePlaceholder')"
        class="px-3 py-2.5 font-mono text-xs leading-relaxed"
        rows="16"
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
  </SettingCard>
</template>
