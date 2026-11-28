<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AdvancedBaseConfig } from '@misub/core/types.js';
import { Trash2 } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import { useI18n } from '@/i18n/index.js';
import { normalizeAdvancedBaseConfig } from '@misub/core/domain/visual-rules-catalog.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const advanced = computed<AdvancedBaseConfig>(() => normalizeAdvancedBaseConfig(props.settings?.advancedBaseConfig));

function patchAdvanced(patch: Partial<AdvancedBaseConfig>): void {
  emit('update:settings', {
    ...props.settings,
    advancedBaseConfig: {
      ...advanced.value,
      ...patch,
    },
  });
}

type BaseConfigTarget = 'singbox' | 'clash' | 'surge';
const activeBaseConfigTarget = ref<BaseConfigTarget>('singbox');

const baseConfigTargetOptions = [
  { value: 'singbox', label: 'Sing-Box' },
  { value: 'clash', label: 'Clash / Mihomo' },
  { value: 'surge', label: 'Surge' },
];

const activeBaseConfigText = computed({
  get: () => advanced.value.baseConfig?.[activeBaseConfigTarget.value] || '',
  set: (val: string) => {
    const baseConfig = advanced.value.baseConfig || { singbox: '', clash: '', surge: '' };
    patchAdvanced({
      baseConfig: {
        ...baseConfig,
        [activeBaseConfigTarget.value]: val,
      },
    });
  },
});

const baseConfigValidationError = ref('');
let baseConfigValidateSeq = 0;

watch(
  [activeBaseConfigText, activeBaseConfigTarget],
  async ([rawText, target]) => {
    const seq = ++baseConfigValidateSeq;
    const raw = String(rawText || '').trim();
    if (!raw) {
      baseConfigValidationError.value = '';
      return;
    }
    if (target === 'singbox') {
      try {
        const parsed = JSON.parse(raw);
        baseConfigValidationError.value =
          !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
            ? t('settings.visualBaseConfigMustBeObject')
            : '';
      } catch {
        baseConfigValidationError.value = t('settings.dnsOverrideInvalidJson');
      }
      return;
    }
    if (target === 'clash') {
      try {
        const yaml = await import('js-yaml');
        if (seq !== baseConfigValidateSeq) return;
        const parsed = yaml.load(raw);
        if (seq !== baseConfigValidateSeq) return;
        baseConfigValidationError.value =
          !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
            ? t('settings.visualBaseConfigMustBeObject')
            : '';
      } catch {
        if (seq !== baseConfigValidateSeq) return;
        baseConfigValidationError.value = t('settings.dnsOverrideInvalidYaml');
      }
      return;
    }
    baseConfigValidationError.value = '';
  },
  { immediate: true },
);

function clearActiveBaseConfig(): void {
  activeBaseConfigText.value = '';
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-6">
        <div class="space-y-1">
          <p class="text-sm font-medium text-fg">{{ t('settings.visualEnableClashApi') }}</p>
          <p class="text-xs leading-relaxed text-fg-muted">
            {{ t('settings.visualEnableClashApiDesc') }}
          </p>
        </div>
        <Switch
          :model-value="Boolean(advanced.enableClashApi)"
          class="shrink-0"
          data-testid="clash-api-switch"
          @update:model-value="patchAdvanced({ enableClashApi: Boolean($event) })"
        />
      </div>

      <div
        v-if="advanced.enableClashApi"
        class="grid grid-cols-1 gap-4 border-t border-line-subtle pt-4 md:grid-cols-2"
      >
        <div>
          <label class="mb-1.5 block text-xs font-medium text-fg-muted">
            {{ t('settings.visualExternalController') }}
          </label>
          <input
            :value="advanced.externalController"
            class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg shadow-none focus:border-line-strong"
            placeholder="0.0.0.0:9090"
            type="text"
            @input="patchAdvanced({ externalController: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-fg-muted">
            {{ t('settings.visualExternalUiUrl') }}
          </label>
          <input
            :placeholder="t('settings.visualExternalUiUrlPlaceholder')"
            :value="advanced.externalUiDownloadUrl"
            class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg shadow-none focus:border-line-strong"
            type="text"
            @input="patchAdvanced({ externalUiDownloadUrl: ($event.target as HTMLInputElement).value })"
          />
        </div>
      </div>
    </div>

    <div class="space-y-2.5 border-t border-line pt-5" data-testid="visual-advanced-editor">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-0.5">
          <h4 class="text-sm font-medium text-fg">{{ t('settings.visualBaseConfigTitle') }}</h4>
          <p class="text-xs leading-relaxed text-fg-muted">{{ t('settings.visualBaseConfigDesc') }}</p>
        </div>
        <div class="w-full sm:w-44">
          <Select v-model="activeBaseConfigTarget" :options="baseConfigTargetOptions" size="sm" />
        </div>
      </div>

      <textarea
        v-model="activeBaseConfigText"
        :placeholder="t('settings.visualBaseConfigPlaceholder')"
        class="block min-h-[130px] w-full rounded-md border border-line bg-inset p-3 font-mono text-xs text-fg focus:border-line-strong"
      />
      <div class="flex items-center justify-between gap-2">
        <p v-if="baseConfigValidationError" class="text-xs text-status-danger">
          {{ baseConfigValidationError }}
        </p>
        <p v-else class="text-xs text-fg-muted">
          {{ t('settings.visualBaseConfigHint') }}
        </p>
        <button
          v-if="activeBaseConfigText"
          class="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-transparent px-2.5 py-1 text-xs font-medium text-status-danger transition-colors hover:bg-status-danger-bg hover:border-status-danger-border"
          type="button"
          @click="clearActiveBaseConfig"
        >
          <Trash2 class="h-3 w-3" />
          {{ t('settings.visualBaseConfigClear') }}
        </button>
      </div>
    </div>
  </div>
</template>
