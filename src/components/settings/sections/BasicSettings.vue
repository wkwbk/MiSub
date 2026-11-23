<script setup>
import { Globe, Info, Languages, RefreshCw, SlidersHorizontal } from '@lucide/vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import { computed, ref, watch } from 'vue';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/index.js';
import { getPathRootSegment, isReservedPathRoot, isReservedSubPath } from '@shared/reserved-paths.js';

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
  disguiseConfig: {
    type: Object,
    required: true,
  },
  highlightedFocusId: {
    type: String,
    default: '',
  },
});

const { showToast } = useToastStore();
const { t } = useI18n();

const hasInvalidTokenChars = (value) => /[\s/?#]/.test(value);

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

const handleGenerateToken = (field) => {
  props.settings[field] = generateUuidToken();
  showToast(t('settings.tokenGenerated'), 'success');
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
      props.settings.customLoginPath = sanitized;
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

const QUICK_INTERVAL_VALUES = [0, 30, 60];
const MIN_CUSTOM_INTERVAL = 5;

const isCustomInterval = computed(() => !QUICK_INTERVAL_VALUES.includes(Number(props.settings.autoUpdateInterval)));

const customIntervalInput = ref(isCustomInterval.value ? String(props.settings.autoUpdateInterval ?? '') : '');

watch(
  () => props.settings.autoUpdateInterval,
  (val) => {
    if (QUICK_INTERVAL_VALUES.includes(Number(val))) {
      customIntervalInput.value = '';
    } else if (val !== undefined && val !== null) {
      customIntervalInput.value = String(val);
    }
  },
);

const handleCustomIntervalInput = (event) => {
  const raw = event.target.value;
  customIntervalInput.value = raw;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= MIN_CUSTOM_INTERVAL) {
    props.settings.autoUpdateInterval = parsed;
  }
};

const handleCustomIntervalBlur = () => {
  const parsed = Number.parseInt(customIntervalInput.value, 10);
  if (customIntervalInput.value === '' || Number.isNaN(parsed)) {
    customIntervalInput.value = isCustomInterval.value ? String(props.settings.autoUpdateInterval) : '';
    return;
  }
  if (parsed < MIN_CUSTOM_INTERVAL) {
    props.settings.autoUpdateInterval = MIN_CUSTOM_INTERVAL;
    customIntervalInput.value = String(MIN_CUSTOM_INTERVAL);
  }
};

const QUICK_PROFILE_INTERVAL_VALUES = [0, 12, 24, 48];
const MIN_CUSTOM_PROFILE_INTERVAL = 1;

const isCustomProfileInterval = computed(
  () => !QUICK_PROFILE_INTERVAL_VALUES.includes(Number(props.settings.profileUpdateInterval ?? 24)),
);

const customProfileIntervalInput = ref(
  isCustomProfileInterval.value ? String(props.settings.profileUpdateInterval ?? '') : '',
);

watch(
  () => props.settings.profileUpdateInterval,
  (val) => {
    if (QUICK_PROFILE_INTERVAL_VALUES.includes(Number(val))) {
      customProfileIntervalInput.value = '';
    } else if (val !== undefined && val !== null) {
      customProfileIntervalInput.value = String(val);
    }
  },
);

const handleCustomProfileIntervalInput = (event) => {
  const raw = event.target.value;
  customProfileIntervalInput.value = raw;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= MIN_CUSTOM_PROFILE_INTERVAL) {
    props.settings.profileUpdateInterval = parsed;
  }
};

const handleCustomProfileIntervalBlur = () => {
  const parsed = Number.parseInt(customProfileIntervalInput.value, 10);
  if (customProfileIntervalInput.value === '' || Number.isNaN(parsed)) {
    customProfileIntervalInput.value = isCustomProfileInterval.value
      ? String(props.settings.profileUpdateInterval ?? 24)
      : '';
    return;
  }
  if (parsed < MIN_CUSTOM_PROFILE_INTERVAL) {
    props.settings.profileUpdateInterval = MIN_CUSTOM_PROFILE_INTERVAL;
    customProfileIntervalInput.value = String(MIN_CUSTOM_PROFILE_INTERVAL);
  }
};

const QUICK_SUB_FETCH_INTERVAL_VALUES = [0, 15, 30, 60];
const MIN_CUSTOM_SUB_FETCH_INTERVAL = 1;
const MAX_CUSTOM_SUB_FETCH_INTERVAL = 1440;

const isCustomSubFetchInterval = computed(
  () => !QUICK_SUB_FETCH_INTERVAL_VALUES.includes(Number(props.settings.subFetchMinInterval ?? 15)),
);

const customSubFetchIntervalInput = ref(
  isCustomSubFetchInterval.value ? String(props.settings.subFetchMinInterval ?? '') : '',
);

watch(
  () => props.settings.subFetchMinInterval,
  (val) => {
    if (QUICK_SUB_FETCH_INTERVAL_VALUES.includes(Number(val))) {
      customSubFetchIntervalInput.value = '';
    } else if (val !== undefined && val !== null) {
      customSubFetchIntervalInput.value = String(val);
    }
  },
);

const handleCustomSubFetchIntervalInput = (event) => {
  const raw = event.target.value;
  customSubFetchIntervalInput.value = raw;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= MIN_CUSTOM_SUB_FETCH_INTERVAL) {
    props.settings.subFetchMinInterval = Math.min(MAX_CUSTOM_SUB_FETCH_INTERVAL, parsed);
  }
};

const handleCustomSubFetchIntervalBlur = () => {
  const parsed = Number.parseInt(customSubFetchIntervalInput.value, 10);
  if (customSubFetchIntervalInput.value === '' || Number.isNaN(parsed)) {
    customSubFetchIntervalInput.value = isCustomSubFetchInterval.value
      ? String(props.settings.subFetchMinInterval ?? 15)
      : '';
    return;
  }
  const clamped = Math.min(MAX_CUSTOM_SUB_FETCH_INTERVAL, Math.max(MIN_CUSTOM_SUB_FETCH_INTERVAL, parsed));
  props.settings.subFetchMinInterval = clamped;
  customSubFetchIntervalInput.value = String(clamped);
};
</script>

<template>
  <div class="space-y-4">
    <!-- 默认显示语言 -->
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.defaultLanguageDesc')"
        :title="t('settings.defaultLanguageTitle')"
        tone="amber"
      >
        <template #icon>
          <Languages class="h-4 w-4" />
        </template>
      </SectionHeader>
      <div class="max-w-xs">
        <Select
          v-model="settings.defaultLocale"
          :options="[
            { value: 'zh-CN', label: t('settings.defaultLanguageZh') },
            { value: 'en-US', label: t('settings.defaultLanguageEn') },
          ]"
        />
      </div>
    </section>

    <!-- 订阅基本信息配置 -->
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.subscriptionConfigDesc')"
        :title="t('settings.subscriptionConfigTitle')"
        tone="indigo"
      >
        <template #icon>
          <Info class="h-4 w-4" />
        </template>
      </SectionHeader>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <Input
            id="setting-profileToken"
            v-model="settings.profileToken"
            :class="{
              'ring-1 ring-line-strong rounded-md': highlightedFocusId === 'setting-profileToken',
            }"
            :error="profileTokenError"
            :label="t('settings.profileToken')"
            :placeholder="t('settings.profileTokenPlaceholder')"
            class="rounded-md font-mono transition-shadow duration-300"
          />
        </div>
        <div>
          <Input v-model="settings.fileName" :label="t('settings.customFileName')" class="rounded-md font-mono" />
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
            v-model="settings.myToken"
            :class="{
              'ring-1 ring-line-strong rounded-md': highlightedFocusId === 'setting-mytoken',
            }"
            :error="myTokenError"
            :placeholder="t('settings.customTokenPlaceholder')"
            class="rounded-md font-mono transition-shadow duration-300"
          />
        </div>
      </div>
      <p class="mt-4 text-xs text-fg-muted leading-relaxed">
        {{ t('settings.subscriptionTokenRotationHint') }}
      </p>
    </section>

    <!-- 功能开关区域 -->
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.featureControlDesc')"
        :title="t('settings.featureControlTitle')"
        tone="green"
      >
        <template #icon>
          <SlidersHorizontal class="h-4 w-4" />
        </template>
      </SectionHeader>
      <div class="divide-y divide-line-subtle">
        <!-- 订阅自动更新间隔 -->
        <div class="py-5 first:pt-0 last:pb-0">
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-sm font-medium text-fg">
                {{ t('settings.autoUpdateInterval') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.autoUpdateDesc') }}
              </p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <div
                :class="[
                  'flex items-center h-8 rounded-md border bg-inset px-2.5 transition-colors',
                  isCustomInterval
                    ? 'border-line-strong'
                    : 'border-line hover:border-line-strong focus-within:border-line-strong',
                ]"
              >
                <input
                  :aria-label="t('settings.autoUpdateInterval')"
                  :min="MIN_CUSTOM_INTERVAL"
                  :placeholder="t('settings.customInterval')"
                  :value="customIntervalInput"
                  class="w-14 bg-transparent text-xs font-mono tabular-nums text-fg placeholder:text-fg-subtle outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  inputmode="numeric"
                  type="number"
                  @blur="handleCustomIntervalBlur"
                  @input="handleCustomIntervalInput"
                />
                <span class="text-[11px] text-fg-subtle select-none pl-2 ml-1 border-l border-line whitespace-nowrap">
                  {{ t('settings.minutes') }}
                </span>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="text-xs text-fg-subtle mr-0.5 whitespace-nowrap">{{ t('settings.quickSelect') }}</span>
                <button
                  v-for="option in [
                    { value: 0, label: t('settings.disabledOption') },
                    { value: 30, label: t('settings.option30Minutes') },
                    { value: 60, label: t('settings.option1Hour') },
                  ]"
                  :key="option.value"
                  :aria-pressed="settings.autoUpdateInterval === option.value"
                  :class="[
                    'h-8 px-2.5 text-xs font-mono font-medium rounded-md border transition-colors whitespace-nowrap',
                    settings.autoUpdateInterval === option.value
                      ? 'bg-active text-fg border-line-strong font-semibold'
                      : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
                  ]"
                  type="button"
                  @click="settings.autoUpdateInterval = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
          <p v-if="settings.autoUpdateInterval === 0" class="callout-warning mt-2.5">
            {{ t('settings.autoUpdateDisabledHint') }}
          </p>
        </div>

        <!-- 客户端订阅更新周期 (Profile-Update-Interval) -->
        <div class="py-5 first:pt-0 last:pb-0">
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-sm font-medium text-fg">
                {{ t('settings.profileUpdateInterval') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.profileUpdateIntervalDesc') }}
              </p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <div
                :class="[
                  'flex items-center h-8 rounded-md border bg-inset px-2.5 transition-colors',
                  isCustomProfileInterval
                    ? 'border-line-strong'
                    : 'border-line hover:border-line-strong focus-within:border-line-strong',
                ]"
              >
                <input
                  :aria-label="t('settings.profileUpdateInterval')"
                  :min="MIN_CUSTOM_PROFILE_INTERVAL"
                  :placeholder="t('settings.customInterval')"
                  :value="customProfileIntervalInput"
                  class="w-14 bg-transparent text-xs font-mono tabular-nums text-fg placeholder:text-fg-subtle outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  inputmode="numeric"
                  type="number"
                  @blur="handleCustomProfileIntervalBlur"
                  @input="handleCustomProfileIntervalInput"
                />
                <span class="text-[11px] text-fg-subtle select-none pl-2 ml-1 border-l border-line whitespace-nowrap">
                  {{ t('settings.hours') }}
                </span>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="text-xs text-fg-subtle mr-0.5 whitespace-nowrap">{{ t('settings.quickSelect') }}</span>
                <button
                  v-for="option in [
                    { value: 0, label: t('settings.disabledOption') },
                    { value: 12, label: t('settings.option12Hours') },
                    { value: 24, label: t('settings.option24Hours') },
                    { value: 48, label: t('settings.option48Hours') },
                  ]"
                  :key="option.value"
                  :aria-pressed="(settings.profileUpdateInterval ?? 24) === option.value"
                  :class="[
                    'h-8 px-2.5 text-xs font-mono font-medium rounded-md border transition-colors whitespace-nowrap',
                    (settings.profileUpdateInterval ?? 24) === option.value
                      ? 'bg-active text-fg border-line-strong font-semibold'
                      : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
                  ]"
                  type="button"
                  @click="settings.profileUpdateInterval = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 服务端最小拉取间隔与边缘缓存防刷 -->
        <div class="py-5 first:pt-0 last:pb-0 space-y-3">
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div class="space-y-1 flex-1 min-w-0 pr-0 xl:pr-4">
              <p class="text-sm font-medium text-fg">
                {{ t('settings.subFetchMinInterval') }}
              </p>
              <p class="text-xs text-fg-muted leading-relaxed">
                {{ t('settings.subFetchMinIntervalDesc') }}
              </p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
              <div
                :class="[
                  'flex items-center h-8 rounded-md border bg-inset px-2.5 transition-colors',
                  isCustomSubFetchInterval
                    ? 'border-line-strong'
                    : 'border-line hover:border-line-strong focus-within:border-line-strong',
                ]"
              >
                <input
                  :aria-label="t('settings.subFetchMinInterval')"
                  :max="MAX_CUSTOM_SUB_FETCH_INTERVAL"
                  :min="MIN_CUSTOM_SUB_FETCH_INTERVAL"
                  :placeholder="t('settings.customInterval')"
                  :value="customSubFetchIntervalInput"
                  class="w-14 bg-transparent text-xs font-mono tabular-nums text-fg placeholder:text-fg-subtle outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  inputmode="numeric"
                  type="number"
                  @blur="handleCustomSubFetchIntervalBlur"
                  @input="handleCustomSubFetchIntervalInput"
                />
                <span class="text-[11px] text-fg-subtle select-none pl-2 ml-1 border-l border-line whitespace-nowrap">
                  {{ t('settings.minutes') }}
                </span>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="text-xs text-fg-subtle mr-0.5 whitespace-nowrap">{{ t('settings.quickSelect') }}</span>
                <button
                  v-for="option in [
                    { value: 0, label: t('settings.disabledOption') },
                    { value: 15, label: t('settings.option15Minutes') },
                    { value: 30, label: t('settings.option30Minutes') },
                    { value: 60, label: t('settings.option1Hour') },
                  ]"
                  :key="option.value"
                  :aria-pressed="(settings.subFetchMinInterval ?? 15) === option.value"
                  :class="[
                    'h-8 px-2.5 text-xs font-mono font-medium rounded-md border transition-colors whitespace-nowrap',
                    (settings.subFetchMinInterval ?? 15) === option.value
                      ? 'bg-active text-fg border-line-strong font-semibold'
                      : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
                  ]"
                  type="button"
                  @click="settings.subFetchMinInterval = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="(settings.subFetchMinInterval ?? 15) > 0"
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
                v-model="settings.subFetchLimitMode"
                :options="[
                  { value: 'cache', label: t('settings.subFetchLimitCache') },
                  { value: 'strict', label: t('settings.subFetchLimitStrict') },
                ]"
                size="sm"
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
            <Switch v-model="settings.enableAccessLog" class="shrink-0 mt-0.5" />
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
                v-model="settings.accessLogPersistenceMode"
                :options="[
                  { value: 'light', label: t('settings.accessLogLight') },
                  { value: 'full', label: t('settings.accessLogFull') },
                ]"
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
          <Switch v-model="settings.enableTrafficNode" />
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
              v-model="settings.mergeExpireStrategy"
              :options="[
                { value: 'max', label: t('settings.mergeExpireMax') },
                { value: 'min', label: t('settings.mergeExpireMin') },
              ]"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Web 访问控制 -->
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader :description="t('settings.webAccessDesc')" :title="t('settings.webAccessTitle')" tone="blue">
        <template #icon>
          <Globe class="h-4 w-4" />
        </template>
      </SectionHeader>

      <div class="divide-y divide-line-subtle">
        <!-- 公开页访问 -->
        <div class="py-5 first:pt-0 last:pb-0 flex items-center justify-between gap-6">
          <div class="space-y-1">
            <p class="text-sm font-medium text-fg">
              {{ t('settings.publicPageAccessTitle') }}
            </p>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.publicPageAccessDesc') }}
            </p>
          </div>
          <Switch v-model="settings.enablePublicPage" class="shrink-0" />
        </div>

        <!-- 允许浏览器打开订阅链接 -->
        <div class="py-5 first:pt-0 last:pb-0 flex items-center justify-between gap-6">
          <div class="space-y-1">
            <p class="text-sm font-medium text-fg">
              {{ t('settings.disguisePageTitle') }}
            </p>
            <p class="text-xs text-fg-muted leading-relaxed">
              {{ t('settings.disguisePageDesc') }}
            </p>
          </div>
          <Switch v-model="settings.allowBrowserSubAccess" class="shrink-0" />
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
            <label class="flex items-center cursor-pointer group">
              <input
                v-model="disguiseConfig.pageType"
                class="h-4 w-4 text-fg focus-visible:ring-line-strong border-line-strong bg-elevated-card"
                type="radio"
                value="default"
              />
              <div class="ml-3 space-y-0.5">
                <span class="block text-sm font-medium text-fg group-hover:text-fg">{{
                  t('settings.disguiseDefault404')
                }}</span>
                <span class="block text-xs text-fg-muted">{{ t('settings.disguiseDefault404Desc') }}</span>
              </div>
            </label>
            <label class="flex items-center cursor-pointer group">
              <input
                v-model="disguiseConfig.pageType"
                class="h-4 w-4 text-fg focus-visible:ring-line-strong border-line-strong bg-elevated-card"
                type="radio"
                value="redirect"
              />
              <div class="ml-3 space-y-0.5">
                <span class="block text-sm font-medium text-fg group-hover:text-fg">{{
                  t('settings.disguiseRedirect')
                }}</span>
                <span class="block text-xs text-fg-muted">{{ t('settings.disguiseRedirectDesc') }}</span>
              </div>
            </label>
          </div>

          <div v-if="disguiseConfig.pageType === 'redirect'" class="animate-fade-in-down">
            <Input
              v-model="disguiseConfig.redirectUrl"
              :label="t('settings.disguiseTargetUrl')"
              placeholder="www.example.com"
              type="url"
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
              v-model="settings.customLoginPath"
              :error="customLoginPathError"
              :label="t('settings.customAdminPath')"
              :placeholder="t('settings.customAdminPathPlaceholder')"
              autocomplete="off"
              name="custom_admin_path_setting_no_autofill"
              prefix="/"
              type="search"
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
    </section>
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
