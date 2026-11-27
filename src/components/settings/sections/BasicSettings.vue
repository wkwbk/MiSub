<script setup lang="ts">
import type { TokenAutoRotateConfig } from '@misub/core/types.js';
import { Globe, Info, Languages, RefreshCw, RotateCw, SlidersHorizontal } from '@lucide/vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import Textarea from '@/components/ui/Textarea.vue';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';
import { computed, reactive, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { useToastStore } from '@/stores/useToastStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { resolveComponentQueryClient } from '@/lib/query-client.js';
import { syncSettingsSnapshotToCache } from '@/queries/useAppDataQueries.js';
import { rotateMyToken } from '@/lib/api.js';
import { useI18n } from '@/i18n/index.js';
import { getPathRootSegment, isReservedPathRoot, isReservedSubPath } from '@misub/core/domain/reserved-paths.js';
import type { DisguiseConfig } from '@/composables/useSettingsLogic.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import { extractErrorMessage } from '@/utils/error-handler.js';

const props = defineProps<{
  settings: AppSettingsConfig;
  disguiseConfig: DisguiseConfig;
  highlightedFocusId?: string;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
  'update:disguiseConfig': [value: DisguiseConfig];
}>();

const { showToast } = useToastStore();
const { t } = useI18n();
const capturedQueryClient = getActivePinia() ? resolveComponentQueryClient() : null;

const hasInvalidTokenChars = (value: string) => /[\s/?#]/.test(value);

const patchSettings = (patch: Partial<AppSettingsConfig>): void => {
  emit('update:settings', {
    ...props.settings,
    ...patch,
  });
};

const patchDisguiseConfig = (patch: Partial<DisguiseConfig>): void => {
  emit('update:disguiseConfig', {
    ...props.disguiseConfig,
    ...patch,
  });
};

const tokenAutoRotate = computed<TokenAutoRotateConfig>(() => {
  const current = props.settings?.tokenAutoRotate;
  return {
    enabled: current?.enabled ?? false,
    intervalDays: current?.intervalDays ?? 2,
    lastRotatedAt: current?.lastRotatedAt ?? null,
  };
});

const patchTokenAutoRotate = (patch: Partial<TokenAutoRotateConfig>): void => {
  patchSettings({
    tokenAutoRotate: {
      ...tokenAutoRotate.value,
      ...patch,
    },
  });
};

const generateUuidToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const handleGenerateToken = (field: 'myToken' | 'profileToken') => {
  patchSettings({ [field]: generateUuidToken() });
  showToast(t('settings.tokenGenerated'), 'success');
};

const isRotatingNow = ref(false);
const formattedLastRotated = computed(() => {
  const raw = tokenAutoRotate.value.lastRotatedAt;
  if (!raw) return '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toLocaleString() : raw;
});

const handleRotateTokenNow = async () => {
  if (isRotatingNow.value) return;
  isRotatingNow.value = true;
  try {
    const res = await rotateMyToken();
    if (res?.success && res.data?.myToken) {
      const nextTokenAutoRotate: TokenAutoRotateConfig = {
        ...tokenAutoRotate.value,
        lastRotatedAt: res.data.rotatedAt || new Date().toISOString(),
      };
      const rotatedPatch = {
        myToken: res.data.myToken,
        tokenAutoRotate: nextTokenAutoRotate,
      };
      patchSettings(rotatedPatch);
      if (getActivePinia()) {
        useSettingsStore().updateConfig(rotatedPatch);
        syncSettingsSnapshotToCache(capturedQueryClient || resolveComponentQueryClient(), rotatedPatch);
      }
      showToast(
        res.data.notified ? t('settings.rotateTokenNowSuccessNotified') : t('settings.rotateTokenNowSuccess'),
        'success',
      );
    } else {
      showToast(t('settings.rotateTokenNowFailed'), 'error');
    }
  } catch (err) {
    showToast(extractErrorMessage(err, t('settings.rotateTokenNowFailed')), 'error');
  } finally {
    isRotatingNow.value = false;
  }
};

const customLoginPathError = computed(() => {
  const value = props.settings.customLoginPath;
  if (!value) return '';

  if (/[^a-zA-Z0-9-_/]/.test(value)) {
    return t('settings.reservedPathChars');
  }

  if (isReservedPathRoot(value)) {
    return t('settings.reservedPathCustomLogin', { path: getPathRootSegment(value) });
  }

  return '';
});

const myTokenError = computed(() => {
  const value = props.settings.myToken;
  if (!value) return '';

  return hasInvalidTokenChars(value) ? t('settings.reservedTokenChars') : '';
});

const profileTokenError = computed(() => {
  const value = props.settings.profileToken;
  if (!value) return '';

  if (hasInvalidTokenChars(value)) {
    return t('settings.reservedTokenChars');
  }

  return isReservedSubPath(value) ? t('settings.reservedPathProfileToken') : '';
});

// 监听自定义登录路径，保留输入并通过提示引导修正
watch(
  () => props.settings.customLoginPath,
  (val) => {
    if (!val) return;

    // 仅允许字母、数字、下划线、中划线和斜杠
    const sanitized = val.replace(/[^a-zA-Z0-9-_/]/g, '');

    if (sanitized !== val) {
      patchSettings({ customLoginPath: sanitized });
      showToast(t('settings.reservedPathCharsToast'), 'warning');
    }
  },
);

watch(
  () => props.settings.myToken,
  (val) => {
    if (!val) return;
    if (hasInvalidTokenChars(val)) {
      showToast(t('settings.reservedTokenChars'), 'error');
    }
  },
);

watch(
  () => props.settings.profileToken,
  (val) => {
    if (!val) return;
    if (hasInvalidTokenChars(val)) {
      showToast(t('settings.reservedTokenChars'), 'error');
      return;
    }
    if (isReservedSubPath(val)) {
      showToast(t('settings.reservedPathProfileToken'), 'error');
    }
  },
);

const createIntervalControl = ({
  get,
  set,
  defaultValue,
  quickValues,
  min,
  max = Number.POSITIVE_INFINITY,
}: {
  get: () => number | undefined;
  set: (val: number) => void;
  defaultValue?: number;
  quickValues: number[];
  min: number;
  max?: number;
}) => {
  const readValue = () => (defaultValue !== undefined ? (get() ?? defaultValue) : get());
  const isCustom = computed(() => !quickValues.includes(Number(readValue())));
  const customInput = ref(isCustom.value ? String(readValue() ?? '') : '');

  watch(get, (val) => {
    if (quickValues.includes(Number(val))) {
      customInput.value = '';
    } else if (val !== undefined && val !== null) {
      customInput.value = String(val);
    }
  });

  const onInput = (event: Event) => {
    const raw = (event.target as HTMLInputElement).value;
    customInput.value = raw;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= min) {
      set(Math.min(max, parsed));
    }
  };

  const onBlur = () => {
    const parsed = Number.parseInt(customInput.value, 10);
    if (customInput.value === '' || Number.isNaN(parsed)) {
      customInput.value = isCustom.value ? String(readValue()) : '';
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    set(clamped);
    customInput.value = String(clamped);
  };

  return reactive({
    isCustom,
    customInput,
    min,
    max: Number.isFinite(max) ? max : undefined,
    readValue,
    setValue: set,
    onInput,
    onBlur,
  });
};

const intervalControls = [
  {
    key: 'autoUpdate',
    titleKey: 'settings.autoUpdateInterval',
    descKey: 'settings.autoUpdateDesc',
    unitKey: 'settings.minutes',
    quickOptions: [
      { value: 0, labelKey: 'settings.disabledOption' },
      { value: 30, labelKey: 'settings.option30Minutes' },
      { value: 60, labelKey: 'settings.option1Hour' },
    ],
    control: createIntervalControl({
      get: () => props.settings.autoUpdateInterval,
      set: (val) => patchSettings({ autoUpdateInterval: val }),
      quickValues: [0, 30, 60],
      min: 5,
    }),
  },
  {
    key: 'profileUpdate',
    titleKey: 'settings.profileUpdateInterval',
    descKey: 'settings.profileUpdateIntervalDesc',
    unitKey: 'settings.hours',
    quickOptions: [
      { value: 0, labelKey: 'settings.disabledOption' },
      { value: 12, labelKey: 'settings.option12Hours' },
      { value: 24, labelKey: 'settings.option24Hours' },
      { value: 48, labelKey: 'settings.option48Hours' },
    ],
    control: createIntervalControl({
      get: () => props.settings.profileUpdateInterval,
      set: (val) => patchSettings({ profileUpdateInterval: val }),
      defaultValue: 24,
      quickValues: [0, 12, 24, 48],
      min: 1,
    }),
  },
  {
    key: 'subFetch',
    titleKey: 'settings.subFetchMinInterval',
    descKey: 'settings.subFetchMinIntervalDesc',
    unitKey: 'settings.minutes',
    quickOptions: [
      { value: 0, labelKey: 'settings.disabledOption' },
      { value: 15, labelKey: 'settings.option15Minutes' },
      { value: 30, labelKey: 'settings.option30Minutes' },
      { value: 60, labelKey: 'settings.option1Hour' },
    ],
    control: createIntervalControl({
      get: () => props.settings.subFetchMinInterval,
      set: (val) => patchSettings({ subFetchMinInterval: val }),
      defaultValue: 15,
      quickValues: [0, 15, 30, 60],
      min: 1,
      max: 1440,
    }),
  },
];

const webAccessSwitchRows: Array<{
  key: 'enablePublicPage' | 'allowBrowserSubAccess' | 'blockCrawlerSubAccess';
  titleKey: string;
  descKey: string;
}> = [
  { key: 'enablePublicPage', titleKey: 'settings.publicPageAccessTitle', descKey: 'settings.publicPageAccessDesc' },
  { key: 'allowBrowserSubAccess', titleKey: 'settings.disguisePageTitle', descKey: 'settings.disguisePageDesc' },
  {
    key: 'blockCrawlerSubAccess',
    titleKey: 'settings.blockCrawlerSubTitle',
    descKey: 'settings.blockCrawlerSubDesc',
  },
];

const disguisePageTypeOptions: Array<{
  value: DisguiseConfig['pageType'];
  titleKey: string;
  descKey: string;
}> = [
  { value: 'default', titleKey: 'settings.disguiseDefault404', descKey: 'settings.disguiseDefault404Desc' },
  { value: 'redirect', titleKey: 'settings.disguiseRedirect', descKey: 'settings.disguiseRedirectDesc' },
];

const subPortalRedirectUrlError = computed(() => {
  const val = String(props.settings.subPortalRedirectUrl || '').trim();
  if (!val) return '';
  return isValidHttpUrlString(val) ? '' : t('settings.invalidPortalRedirectUrlError');
});
</script>

<template>
  <div class="space-y-4">
    <!-- 默认显示语言 -->
    <SettingCard
      :description="t('settings.defaultLanguageDesc')"
      :title="t('settings.defaultLanguageTitle')"
      tone="amber"
    >
      <template #icon>
        <Languages class="h-4 w-4" />
      </template>
      <div class="max-w-xs">
        <Select
          :model-value="settings.defaultLocale"
          :options="[
            { value: 'zh-CN', label: t('settings.defaultLanguageZh') },
            { value: 'en-US', label: t('settings.defaultLanguageEn') },
          ]"
          @update:model-value="patchSettings({ defaultLocale: String($event) })"
        />
      </div>
    </SettingCard>

    <!-- 订阅基本信息配置 -->
    <SettingCard
      :description="t('settings.subscriptionConfigDesc')"
      :title="t('settings.subscriptionConfigTitle')"
      tone="indigo"
    >
      <template #icon>
        <Info class="h-4 w-4" />
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <Input
            id="setting-profileToken"
            :class="{
              'ring-1 ring-line-strong rounded-md': highlightedFocusId === 'setting-profileToken',
            }"
            :error="profileTokenError"
            :label="t('settings.profileToken')"
            :model-value="settings.profileToken"
            :placeholder="t('settings.profileTokenPlaceholder')"
            class="rounded-md font-mono transition-shadow duration-300"
            @update:model-value="patchSettings({ profileToken: String($event ?? '') })"
          />
        </div>
        <div>
          <Input
            :label="t('settings.customFileName')"
            :model-value="settings.fileName"
            class="rounded-md font-mono"
            @update:model-value="patchSettings({ fileName: String($event ?? '') })"
          />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-medium text-fg-muted" for="setting-mytoken">
              {{ t('settings.customToken') }}
            </label>
            <button
              class="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
              data-testid="generate-mytoken-btn"
              type="button"
              @click="handleGenerateToken('myToken')"
            >
              <RefreshCw class="h-3 w-3" />
              <span>{{ t('settings.generateRandomToken') }}</span>
            </button>
          </div>
          <Input
            id="setting-mytoken"
            :class="{
              'ring-1 ring-line-strong rounded-md': highlightedFocusId === 'setting-mytoken',
            }"
            :error="myTokenError"
            :model-value="settings.myToken"
            :placeholder="t('settings.customTokenPlaceholder')"
            class="rounded-md font-mono transition-shadow duration-300"
            @update:model-value="patchSettings({ myToken: String($event ?? '') })"
          />
        </div>
      </div>
      <p class="mt-4 text-xs text-fg-muted leading-relaxed">
        {{ t('settings.subscriptionTokenRotationHint') }}
      </p>

      <!-- 公开站点地址 & Token 自动轮换 -->
      <div class="mt-5 pt-5 border-t border-line-subtle space-y-5">
        <div class="max-w-lg">
          <Input
            id="setting-publicUrl"
            :label="t('settings.publicUrlLabel')"
            :model-value="settings.publicUrl"
            class="rounded-md font-mono"
            placeholder="https://sub.example.com"
            @update:model-value="patchSettings({ publicUrl: String($event ?? '') })"
          />
          <p class="mt-1.5 text-xs text-fg-subtle leading-relaxed">
            {{ t('settings.publicUrlHint') }}
          </p>
        </div>

        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-fg">{{ t('settings.tokenAutoRotateTitle') }}</span>
              <span
                v-if="formattedLastRotated"
                class="inline-flex items-center rounded border border-line px-1.5 py-0.5 text-xs font-mono text-fg-subtle"
              >
                {{ t('settings.tokenLastRotated', { time: formattedLastRotated }) }}
              </span>
            </div>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.tokenAutoRotateDesc') }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3 shrink-0">
            <div class="flex items-center h-8 rounded-md border border-line bg-inset px-2.5">
              <input
                :aria-label="t('settings.tokenAutoRotateIntervalLabel')"
                :value="tokenAutoRotate.intervalDays"
                class="w-12 bg-transparent text-xs font-mono tabular-nums text-fg outline-none"
                min="1"
                type="number"
                @input="
                  patchTokenAutoRotate({
                    intervalDays: Number.parseInt(($event.target as HTMLInputElement).value, 10) || 1,
                  })
                "
              />
              <span class="text-xs text-fg-subtle pl-2 ml-1 border-l border-line whitespace-nowrap">
                {{ t('settings.daysUnit') }}
              </span>
            </div>

            <button
              :disabled="isRotatingNow"
              class="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-line bg-transparent text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg disabled:opacity-50 transition-colors"
              data-testid="rotate-mytoken-now-btn"
              type="button"
              @click="handleRotateTokenNow"
            >
              <RotateCw :class="{ 'animate-spin': isRotatingNow }" class="h-3.5 w-3.5" />
              <span>{{ isRotatingNow ? t('settings.rotatingTokenNow') : t('settings.rotateTokenNowBtn') }}</span>
            </button>

            <Switch
              :model-value="Boolean(tokenAutoRotate.enabled)"
              data-testid="token-auto-rotate-switch"
              @update:model-value="patchTokenAutoRotate({ enabled: Boolean($event) })"
            />
          </div>
        </div>
      </div>
    </SettingCard>

    <!-- 功能开关区域 -->
    <SettingCard
      :description="t('settings.featureControlDesc')"
      :title="t('settings.featureControlTitle')"
      tone="green"
    >
      <template #icon>
        <SlidersHorizontal class="h-4 w-4" />
      </template>
      <div class="divide-y divide-line-subtle">
        <div
          v-for="row in intervalControls"
          :key="row.key"
          :class="{ 'space-y-3': row.key === 'subFetch' }"
          class="py-5 first:pt-0 last:pb-0"
        >
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-sm font-medium text-fg">
                {{ t(row.titleKey) }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t(row.descKey) }}
              </p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <div
                :class="[
                  'flex items-center h-8 rounded-md border bg-inset px-2.5 transition-colors',
                  row.control.isCustom
                    ? 'border-line-strong'
                    : 'border-line hover:border-line-strong focus-within:border-line-strong',
                ]"
              >
                <input
                  :aria-label="t(row.titleKey)"
                  :max="row.control.max"
                  :min="row.control.min"
                  :placeholder="t('settings.customInterval')"
                  :value="row.control.customInput"
                  class="w-14 bg-transparent text-xs font-mono tabular-nums text-fg placeholder:text-fg-subtle outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  inputmode="numeric"
                  type="number"
                  @blur="row.control.onBlur"
                  @input="row.control.onInput"
                />
                <span class="text-xs text-fg-subtle select-none pl-2 ml-1 border-l border-line whitespace-nowrap">
                  {{ t(row.unitKey) }}
                </span>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="text-xs text-fg-subtle mr-0.5 whitespace-nowrap">{{ t('settings.quickSelect') }}</span>
                <button
                  v-for="option in row.quickOptions"
                  :key="option.value"
                  :aria-pressed="row.control.readValue() === option.value"
                  :class="[
                    'h-8 px-2.5 text-xs font-mono font-medium rounded-md border transition-colors whitespace-nowrap',
                    row.control.readValue() === option.value
                      ? 'bg-active text-fg border-line-strong font-semibold'
                      : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
                  ]"
                  type="button"
                  @click="row.control.setValue(option.value)"
                >
                  {{ t(option.labelKey) }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="row.key === 'autoUpdate' && settings.autoUpdateInterval === 0" class="callout-warning mt-2.5">
            {{ t('settings.autoUpdateDisabledHint') }}
          </p>

          <div
            v-if="row.key === 'subFetch' && (settings.subFetchMinInterval ?? 15) > 0"
            class="pl-4 border-l-2 border-line flex flex-col xl:flex-row xl:items-center justify-between gap-4"
          >
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-xs font-medium text-fg">
                {{ t('settings.subFetchLimitMode') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.subFetchLimitModeDesc') }}
              </p>
            </div>
            <div class="w-full xl:w-56 shrink-0">
              <Select
                :model-value="settings.subFetchLimitMode"
                :options="[
                  { value: 'cache', label: t('settings.subFetchLimitCache') },
                  { value: 'strict', label: t('settings.subFetchLimitStrict') },
                ]"
                size="sm"
                @update:model-value="patchSettings({ subFetchLimitMode: $event as 'cache' | 'strict' })"
              />
            </div>
          </div>
        </div>

        <!-- 访问日志 -->
        <div class="py-5 first:pt-0 last:pb-0 space-y-3">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-1">
              <p class="text-sm font-medium text-fg">
                {{ t('settings.accessLogTitle') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.accessLogDesc') }}
              </p>
            </div>
            <Switch
              :model-value="Boolean(settings.enableAccessLog)"
              class="shrink-0 mt-0.5"
              @update:model-value="patchSettings({ enableAccessLog: Boolean($event) })"
            />
          </div>
          <p class="callout-warning">
            {{ t('settings.accessLogQuotaHint') }}
          </p>

          <div
            v-if="settings.enableAccessLog"
            class="pl-4 border-l-2 border-line flex flex-col xl:flex-row xl:items-center justify-between gap-4"
          >
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-xs font-medium text-fg">
                {{ t('settings.accessLogMode') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.accessLogModeDesc') }}
              </p>
            </div>
            <div class="sm:w-56 shrink-0">
              <Select
                :model-value="settings.accessLogPersistenceMode"
                :options="[
                  { value: 'light', label: t('settings.accessLogLight') },
                  { value: 'full', label: t('settings.accessLogFull') },
                ]"
                @update:model-value="patchSettings({ accessLogPersistenceMode: String($event) })"
              />
            </div>
          </div>
        </div>

        <!-- 流量与到期时间节点 -->
        <div class="py-5 first:pt-0 last:pb-0 flex items-center justify-between gap-6">
          <div class="space-y-1">
            <p class="text-sm font-medium text-fg">
              {{ t('settings.trafficNodeTitle') }}
            </p>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.trafficNodeDesc') }}
            </p>
          </div>
          <Switch
            :model-value="Boolean(settings.enableTrafficNode)"
            @update:model-value="patchSettings({ enableTrafficNode: Boolean($event) })"
          />
        </div>

        <!-- 合并到期时间策略 -->
        <div class="py-5 first:pt-0 last:pb-0 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
            <p class="text-sm font-medium text-fg">
              {{ t('settings.mergeExpireStrategyTitle') }}
            </p>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.mergeExpireStrategyDesc') }}
            </p>
          </div>
          <div class="sm:w-56 shrink-0">
            <Select
              :model-value="settings.mergeExpireStrategy"
              :options="[
                { value: 'max', label: t('settings.mergeExpireMax') },
                { value: 'min', label: t('settings.mergeExpireMin') },
              ]"
              @update:model-value="patchSettings({ mergeExpireStrategy: $event as 'max' | 'min' })"
            />
          </div>
        </div>
      </div>
    </SettingCard>

    <!-- Web 访问控制 -->
    <SettingCard :description="t('settings.webAccessDesc')" :title="t('settings.webAccessTitle')" tone="blue">
      <template #icon>
        <Globe class="h-4 w-4" />
      </template>

      <div class="divide-y divide-line-subtle">
        <div
          v-for="row in webAccessSwitchRows"
          :key="row.key"
          :class="{ 'space-y-4': row.key === 'allowBrowserSubAccess' }"
          class="py-5 first:pt-0 last:pb-0"
        >
          <div class="flex items-center justify-between gap-6">
            <div class="space-y-1">
              <p class="text-sm font-medium text-fg">
                {{ t(row.titleKey) }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t(row.descKey) }}
              </p>
            </div>
            <Switch
              :model-value="Boolean(settings[row.key])"
              class="shrink-0"
              @update:model-value="patchSettings({ [row.key]: Boolean($event) })"
            />
          </div>

          <!-- 允许浏览器打开订阅链接时的默认门户行为（关闭时由下方拦截策略统一接管） -->
          <div
            v-if="row.key === 'allowBrowserSubAccess' && Boolean(settings.allowBrowserSubAccess)"
            class="pl-4 border-l-2 border-line space-y-4 animate-fade-in-down"
          >
            <div class="space-y-1">
              <p class="text-xs font-medium text-fg">{{ t('settings.browserPortalDefaultTitle') }}</p>
              <p class="text-xs text-fg-muted leading-relaxed">{{ t('settings.browserPortalDefaultDesc') }}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
                  t('settings.subPortalModeTitle')
                }}</label>
                <Select
                  :model-value="settings.subPortalMode || 'portal'"
                  :options="[
                    { value: 'portal', label: t('settings.subPortalModePortal') },
                    { value: 'redirect', label: t('settings.subPortalModeRedirect') },
                    { value: 'raw', label: t('settings.subPortalModeRaw') },
                  ]"
                  @update:model-value="
                    patchSettings({ subPortalMode: ($event as 'portal' | 'redirect' | 'raw') ?? 'portal' })
                  "
                />
              </div>

              <div>
                <Input
                  id="setting-subPortalTitle"
                  :label="t('settings.subPortalTitleLabel')"
                  :model-value="settings.subPortalTitle || ''"
                  :placeholder="t('settings.subPortalTitlePlaceholder')"
                  @update:model-value="patchSettings({ subPortalTitle: String($event ?? '') })"
                />
              </div>
            </div>

            <div v-if="settings.subPortalMode === 'redirect'" class="animate-fade-in-down">
              <Input
                id="setting-subPortalRedirectUrl"
                :error="subPortalRedirectUrlError"
                :label="t('settings.subPortalRedirectUrlLabel')"
                :model-value="settings.subPortalRedirectUrl || ''"
                :placeholder="t('settings.subPortalRedirectUrlPlaceholder')"
                type="url"
                @update:model-value="patchSettings({ subPortalRedirectUrl: String($event ?? '') })"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-fg-muted mb-1.5" for="setting-subPortalNotice">
                {{ t('settings.subPortalNoticeLabel') }}
              </label>
              <Textarea
                id="setting-subPortalNotice"
                :model-value="settings.subPortalNotice || ''"
                :placeholder="t('settings.subPortalNoticePlaceholder')"
                class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
                rows="2"
                @update:model-value="patchSettings({ subPortalNotice: String($event ?? '') })"
              />
            </div>
          </div>
        </div>

        <!-- 统一拦截响应方式 -->
        <div class="py-5 first:pt-0 last:pb-0 space-y-4">
          <div class="space-y-1">
            <p class="text-sm font-medium text-fg">
              {{ t('settings.disguiseStrategy') }}
            </p>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.disguiseBrowserOnlyHint') }}
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-6">
            <label
              v-for="opt in disguisePageTypeOptions"
              :key="opt.value"
              class="flex items-center cursor-pointer group"
            >
              <input
                :checked="disguiseConfig.pageType === opt.value"
                :value="opt.value"
                class="h-4 w-4 text-fg focus-visible:ring-line-strong border-line-strong bg-elevated-card"
                type="radio"
                @change="patchDisguiseConfig({ pageType: opt.value })"
              />
              <div class="ml-3 space-y-0.5">
                <span class="block text-sm font-medium text-fg group-hover:text-fg">{{ t(opt.titleKey) }}</span>
                <span class="block text-xs text-fg-muted">{{ t(opt.descKey) }}</span>
              </div>
            </label>
          </div>

          <div v-if="disguiseConfig.pageType === 'redirect'" class="animate-fade-in-down">
            <Input
              :label="t('settings.disguiseTargetUrl')"
              :model-value="disguiseConfig.redirectUrl"
              placeholder="www.example.com"
              type="url"
              @update:model-value="patchDisguiseConfig({ redirectUrl: String($event ?? '') })"
            />
          </div>
        </div>

        <!-- 自定义登录路径设置 -->
        <div class="py-5 first:pt-0 last:pb-0">
          <div>
            <!-- 隐藏的诱饵输入框，吸收浏览器自动填充 -->
            <input
              aria-hidden="true"
              autocomplete="username"
              name="fake_user_for_autofill"
              style="display: none"
              tabindex="-1"
              type="text"
            />
            <input
              aria-hidden="true"
              autocomplete="current-password"
              name="fake_pass_for_autofill"
              style="display: none"
              tabindex="-1"
              type="password"
            />
            <Input
              :error="customLoginPathError"
              :label="t('settings.customAdminPath')"
              :model-value="settings.customLoginPath"
              :placeholder="t('settings.customAdminPathPlaceholder')"
              autocomplete="off"
              name="custom_admin_path_setting_no_autofill"
              prefix="/"
              type="search"
              @update:model-value="patchSettings({ customLoginPath: String($event ?? '') })"
            />
          </div>
          <p class="text-xs text-fg-muted mt-2 leading-relaxed">
            {{ t('settings.customAdminPathHint') }}
          </p>
          <p class="callout-warning mt-2">
            {{ t('settings.reservedPathListHint') }}
          </p>
        </div>
      </div>
    </SettingCard>
  </div>
</template>

<style scoped>
.animate-fade-in-down {
  animation: fadeInDown 0.3s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
