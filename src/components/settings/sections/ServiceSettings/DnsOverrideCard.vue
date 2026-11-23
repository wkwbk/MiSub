<script setup>
import { computed, ref } from 'vue';
import { Globe } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import Textarea from '@/components/ui/Textarea.vue';
import * as yaml from 'js-yaml';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

const inputValue = computed({
  get() {
    return props.settings.customDnsOverride || '';
  },
  set(value) {
    props.settings.customDnsOverride = value;
  },
});

const jsonError = ref('');

function detectFormat(raw) {
  if (/^\s*\{/.test(raw)) return 'json';
  return 'yaml';
}

function validateInput() {
  const raw = inputValue.value.trim();
  if (!raw) {
    jsonError.value = '';
    return;
  }
  const format = detectFormat(raw);
  try {
    let parsed;
    if (format === 'json') {
      parsed = JSON.parse(raw);
    } else {
      parsed = yaml.load(raw);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      jsonError.value = t('settings.dnsOverrideInvalidObject');
    } else {
      jsonError.value = '';
    }
  } catch {
    jsonError.value = format === 'json' ? t('settings.dnsOverrideInvalidJson') : t('settings.dnsOverrideInvalidYaml');
  }
}

const hasValue = computed(() => inputValue.value.trim().length > 0);
</script>

<template>
  <section class="rounded-lg border border-line bg-surface p-6">
    <SectionHeader :description="t('settings.dnsOverrideDesc')" :title="t('settings.dnsOverrideTitle')">
      <template #icon>
        <Globe class="h-4 w-4" />
      </template>
      <template v-if="hasValue" #actions>
        <span class="badge-success">
          {{ t('settings.dnsOverrideActive') }}
        </span>
      </template>
    </SectionHeader>

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
      <p v-if="jsonError" class="mt-2 text-xs text-red-400">
        {{ jsonError }}
      </p>
      <p v-else class="mt-2 text-xs leading-relaxed text-fg-muted">
        {{ t('settings.dnsOverrideHint') }}
      </p>
    </div>
  </section>
</template>
