<script setup lang="ts">
import { computed } from 'vue';
import type { EditableProfile } from '@/composables/useProfiles.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import { ChevronDown, Globe, Network, RotateCcw, SlidersHorizontal } from '@lucide/vue';
import { getActivePinia } from 'pinia';
import TransformSchemeEditor from '@/components/forms/TransformSchemeEditor.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import Input from '@/components/ui/Input.vue';
import ConfirmPopover from '@/components/ui/ConfirmPopover.vue';
import Select from '@/components/ui/Select.vue';
import TagInput from '@/components/ui/TagInput.vue';
import Textarea from '@/components/ui/Textarea.vue';
import OperatorChain from '@/components/operators/OperatorChain.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore, type ToastType } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import {
  getProfileShareIdentifier,
  normalizeProfileIdentifier,
  rotateProfileLinkId,
} from '@misub/core/domain/profile-link.js';
import { PROFILE_ALIAS_MAX_LENGTH, validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import { normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';

interface ToggleOption {
  label: string;
  value: boolean | null;
}

interface ProfileFormUiText {
  prefixTitle?: string;
  manualPrefixLabel?: string;
  manualPrefixToggle?: string;
  subscriptionPrefixToggle?: string;
  enable?: string;
  disable?: string;
  [key: string]: string | undefined;
}

type ProfileGlobalSettings = Partial<AppSettingsConfig>;

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    localProfile: EditableProfile;
    showAdvanced?: boolean;
    showPortal?: boolean;
    showMultiSocks?: boolean;
    uiText: ProfileFormUiText;
    prefixToggleOptions?: ToggleOption[];
    tagPrefixToggleOptions?: ToggleOption[];
    globalSettings?: ProfileGlobalSettings;
    profileTags?: string[];
    originalCustomId?: string;
  }>(),
  {
    showAdvanced: false,
    showPortal: false,
    showMultiSocks: false,
    prefixToggleOptions: () => [],
    tagPrefixToggleOptions: () => [],
    globalSettings: () => ({}),
    profileTags: () => [],
    originalCustomId: '',
  },
);

const emit = defineEmits<{
  'toggle-advanced': [];
  'toggle-portal': [];
  'toggle-multi-socks': [];
  'update:localProfile': [value: EditableProfile];
}>();

const updateLocalProfile = (patch: Partial<EditableProfile>) => {
  emit('update:localProfile', {
    ...props.localProfile,
    ...patch,
  });
};

const updatePrefixSettings = (patch: NonNullable<EditableProfile['prefixSettings']>) => {
  updateLocalProfile({
    prefixSettings: {
      ...props.localProfile.prefixSettings,
      ...patch,
    },
  });
};

const activePinia = getActivePinia();
const dataStore = activePinia ? useDataStore() : null;
const toastStore = activePinia ? useToastStore() : null;
const showToast = (msg: string, type: ToastType = 'info') => toastStore?.showToast?.(msg, type);

const customIdError = computed(() => {
  const currentAlias = normalizeProfileIdentifier(props.localProfile?.customId);
  if (!currentAlias) return '';
  const origAlias = normalizeProfileIdentifier(props.originalCustomId);
  const legacyExempt = Boolean(props.localProfile?.id && origAlias && origAlias === currentAlias);
  const check = validateSingleProfileAlias(currentAlias, {
    currentProfileId: props.localProfile?.id || '',
    profiles: dataStore?.profiles || [],
    legacyExempt,
  });
  if (check.valid) return '';
  if (check.code === 'duplicate') return t('profiles.customIdExists', { id: check.alias });
  if (check.code === 'too_long') return t('profiles.customIdTooLong', { max: PROFILE_ALIAS_MAX_LENGTH });
  if (check.code === 'invalid_chars') return t('profiles.customIdInvalidChars');
  if (check.code === 'reserved') return t('profiles.customIdReserved', { id: check.alias });
  return check.message || '';
});

const activeShareSuffix = computed(() => {
  const subPath = normalizeSubPath(props.globalSettings?.profileToken || '', 'sub');
  const identifier =
    getProfileShareIdentifier({
      id: props.localProfile?.id,
      customId: props.localProfile?.customId,
      linkId: props.localProfile?.linkId,
    }) || 'link-id';
  return `/${subPath}/${identifier}`;
});

const handleResetProfileLink = () => {
  const rotated = rotateProfileLinkId({
    id: props.localProfile?.id,
    customId: props.localProfile?.customId,
    linkId: props.localProfile?.linkId,
  });
  updateLocalProfile({
    linkId: rotated.linkId,
    customId: '',
  });
  showToast(t('profiles.linkResetPendingSave'), 'info');
};

const expiryPresets = computed(() => [
  { label: t('profileModal.expiresPreset7d'), days: 7 },
  { label: t('profileModal.expiresPreset30d'), days: 30 },
  { label: t('profileModal.expiresPreset90d'), days: 90 },
  { label: t('profileModal.expiresPreset1y'), years: 1 },
]);

const globalPortalModeLabel = computed(() => {
  const mode = props.globalSettings?.subPortalMode || 'portal';
  if (mode === 'redirect') return t('profileModal.portalModeRedirect');
  if (mode === 'raw') return t('profileModal.portalModeRaw');
  return t('profileModal.portalModePortal');
});

const globalMultiSocksStartPort = computed(() => {
  const raw = Number(props.globalSettings?.defaultMultiSocksStartPort);
  return Number.isInteger(raw) && raw >= 1024 && raw <= 60000 ? raw : 42001;
});

const globalMultiSocksListen = computed(() =>
  props.globalSettings?.defaultMultiSocksListen === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
);

const globalMultiSocksLabel = computed(() =>
  props.globalSettings?.defaultMultiSocksEnabled ? t('profileModal.on') : t('profileModal.off'),
);

const globalMultiSocksLiteLabel = computed(() =>
  props.globalSettings?.defaultMultiSocksLite ? t('profileModal.on') : t('profileModal.off'),
);

const portalRedirectUrlError = computed(() => {
  const val = String(props.localProfile?.portalRedirectUrl || '').trim();
  if (!val) return '';
  return isValidHttpUrlString(val) ? '' : t('profileModal.invalidHttpUrl');
});

const multiSocksStartPortError = computed(() => {
  const raw = props.localProfile?.multiSocksStartPort;
  if (raw === '' || raw === null || raw === undefined) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1024 && num <= 60000 ? '' : t('profileModal.invalidPortRange');
});

const multiSocksMaxPortsError = computed(() => {
  const raw = props.localProfile?.multiSocksMaxPorts;
  if (raw === '' || raw === null || raw === undefined) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1 && num <= 65535 ? '' : t('profileModal.invalidMaxPortsRange');
});

const effectiveStartPortPreview = computed(() => {
  const raw = props.localProfile?.multiSocksStartPort;
  if (raw !== '' && raw !== null && raw !== undefined) {
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1024 && num <= 60000) return num;
  }
  return globalMultiSocksStartPort.value;
});

const effectiveListenPreview = computed(() =>
  props.localProfile?.multiSocksListen === '127.0.0.1' || props.localProfile?.multiSocksListen === '0.0.0.0'
    ? props.localProfile.multiSocksListen
    : globalMultiSocksListen.value,
);

const effectiveMaxPortsPreview = computed(() => {
  const raw = props.localProfile?.multiSocksMaxPorts;
  if (raw !== '' && raw !== null && raw !== undefined) {
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) return num;
  }
  return 300;
});

const effectiveMultiSocksEnabledPreview = computed(() => {
  if (typeof props.localProfile?.multiSocksEnabled === 'boolean') {
    return props.localProfile.multiSocksEnabled;
  }
  return Boolean(props.globalSettings?.defaultMultiSocksEnabled);
});

const effectiveMultiSocksLitePreview = computed(() => {
  if (typeof props.localProfile?.multiSocksLite === 'boolean') {
    return props.localProfile.multiSocksLite;
  }
  return Boolean(props.globalSettings?.defaultMultiSocksLite);
});

const subscriptionBasePreviewUrl = computed(() => {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://your-domain';
  return `${origin}${activeShareSuffix.value}`;
});

const subscriptionOverridePreviewUrl = computed(() => {
  const mode = effectiveMultiSocksLitePreview.value ? 'multi-socks-lite' : 'multi-socks';
  return `${subscriptionBasePreviewUrl.value}?mode=${mode}&startPort=${effectiveStartPortPreview.value}&listen=${effectiveListenPreview.value}`;
});
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <Input
        id="profile-name"
        :model-value="localProfile.name"
        :label="t('profiles.nameLabel')"
        :placeholder="t('profiles.namePlaceholder')"
        @update:model-value="updateLocalProfile({ name: String($event ?? '') })"
      />
    </div>
    <div>
      <Input
        id="profile-custom-id"
        :model-value="localProfile.customId"
        :error="customIdError"
        :label="t('profiles.customIdLabel')"
        :placeholder="t('profiles.customIdPlaceholder')"
        @update:model-value="updateLocalProfile({ customId: String($event ?? '') })"
      >
        <template #suffix>
          <ConfirmPopover
            :confirm-text="t('profiles.resetLinkConfirmAction')"
            :description="t('profiles.resetLinkConfirmDesc')"
            :title="t('profiles.resetLinkConfirmTitle')"
            @confirm="handleResetProfileLink"
          >
            <template #trigger="{ toggle }">
              <button
                :aria-label="t('profiles.resetLinkTitle')"
                :title="t('profiles.resetLinkTitle')"
                class="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg transition-colors"
                data-testid="reset-profile-link-btn"
                type="button"
                @click.stop="toggle"
              >
                <RotateCcw class="h-3.5 w-3.5" />
              </button>
            </template>
          </ConfirmPopover>
        </template>
      </Input>
      <p class="text-xs text-fg-subtle mt-1">
        {{ t('profiles.customIdHint') }}
        <span class="font-mono text-fg-muted ml-1">({{ activeShareSuffix }})</span>
      </p>
    </div>
  </div>

  <div class="mt-4">
    <label class="block text-xs font-medium text-fg-muted mb-1.5">
      {{ t('profiles.tagsLabel') }}
    </label>
    <TagInput
      :model-value="localProfile.tags"
      :placeholder="t('profiles.tagsPlaceholder')"
      :suggestions="profileTags"
      @update:model-value="updateLocalProfile({ tags: $event })"
    />
  </div>

  <div class="bg-transparent rounded-md p-4 border border-line mt-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center">
        <input
          id="profile-is-public"
          :checked="Boolean(localProfile.isPublic)"
          class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
          type="checkbox"
          @change="updateLocalProfile({ isPublic: ($event.target as HTMLInputElement).checked })"
        />
        <label class="ml-2 block text-xs font-medium text-fg" for="profile-is-public">
          {{ t('profiles.publicDisplay') }}
        </label>
      </div>
      <span
        v-if="localProfile.isPublic"
        class="inline-flex items-center gap-1.5 text-xs text-fg-muted border border-line bg-transparent px-2 py-0.5 rounded-md"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
        <span>{{ t('profiles.publicVisible') }}</span>
      </span>
    </div>

    <div v-if="localProfile.isPublic" class="animate-fade-in-down space-y-3">
      <Textarea
        id="profile-description"
        :model-value="localProfile.description"
        :placeholder="t('profiles.descriptionPlaceholder')"
        class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
        rows="2"
        wrapperClass="focus-within:border-line-strong focus-within:ring-0"
        @update:model-value="updateLocalProfile({ description: String($event ?? '') })"
      />
      <div v-if="globalSettings?.shortLink?.enabled || localProfile.shortLink">
        <Input
          id="profile-short-link"
          :model-value="localProfile.shortLink"
          :label="t('profiles.shortLinkLabel')"
          :placeholder="t('profiles.shortLinkPlaceholder')"
          @update:model-value="updateLocalProfile({ shortLink: String($event ?? '') })"
        />
        <p class="text-xs text-fg-subtle mt-1">
          {{ t('profiles.shortLinkHint') }}
        </p>
      </div>
    </div>
    <div v-else class="text-xs text-fg-subtle">
      {{ t('profiles.publicDisplayHint') }}
    </div>
  </div>

  <div class="rounded-md border border-line bg-transparent mt-4 overflow-hidden">
    <button
      :aria-expanded="showAdvanced"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      type="button"
      @click="emit('toggle-advanced')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <SlidersHorizontal class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profiles.advancedTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{ t('profiles.advancedDesc') }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showAdvanced }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showAdvanced" class="border-t border-line p-4 space-y-6 animate-fade-in-down">
      <!-- === 区块 A：渲染核心配置 (Core Logic) === -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.coreConfig') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.coreConfigDesc') }}</span>
        </div>

        <TransformSchemeEditor
          :global-settings="globalSettings"
          :model="localProfile"
          scope="profile"
          @update:model="emit('update:localProfile', $event as EditableProfile)"
        />
      </div>

      <!-- === 区块 B：参数微调与后处理 (Parameter Tuning) === -->
      <div class="space-y-3 border-t border-line pt-5">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.tuningTitle') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.tuningDesc') }}</span>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- 到期时间 -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('profileModal.expiresLabel') }}</label>
            <DatePicker
              :model-value="localProfile.expiresAt"
              :aria-label="t('profileModal.expiresLabel')"
              :placeholder="t('profileModal.expiresPlaceholder')"
              :presets="expiryPresets"
              size="sm"
              @update:model-value="updateLocalProfile({ expiresAt: $event })"
            />
          </div>

          <!-- 最小拉取间隔（分钟） -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchMinIntervalLabel')
            }}</label>
            <input
              :value="localProfile.fetchMinInterval ?? ''"
              :placeholder="t('profileModal.fetchMinIntervalPlaceholder')"
              class="block h-8 w-full px-2.5 bg-inset border border-line rounded-md font-mono text-xs text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong focus-visible:outline-hidden transition-colors duration-200"
              max="1440"
              min="0"
              type="number"
              @input="updateLocalProfile({ fetchMinInterval: ($event.target as HTMLInputElement).value })"
            />
          </div>

          <!-- 超频处理方式 -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchLimitModeLabel')
            }}</label>
            <Select
              :model-value="localProfile.fetchLimitMode ?? ''"
              :options="[
                { value: '', label: t('profileModal.followGlobal') },
                { value: 'cache', label: t('profileModal.fetchLimitCache') },
                { value: 'strict', label: t('profileModal.fetchLimitStrict') },
              ]"
              size="sm"
              @update:model-value="updateLocalProfile({ fetchLimitMode: ($event as '' | 'cache' | 'strict') ?? '' })"
            />
          </div>

          <!-- 节点前缀设置 (合并) -->
          <div class="sm:col-span-2 space-y-3 pt-3 border-t border-line">
            <label class="block text-xs font-semibold text-fg-muted uppercase tracking-wider">{{
              t('profileModal.nodeNameVisibility')
            }}</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- 手动节点文本前缀 -->
              <Input
                :model-value="localProfile.prefixSettings?.manualNodePrefix ?? ''"
                :label="t('profileModal.manualPrefixText')"
                :placeholder="t('profileModal.followGlobalEmpty')"
                size="sm"
                @update:model-value="updatePrefixSettings({ manualNodePrefix: String($event ?? '') })"
              />

              <!-- {{ t('profileModal.manualNodeDisplay') }}开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.manualNodeDisplay') }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.enableManualNodes ?? null"
                  :options="prefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ enableManualNodes: $event as boolean | null })"
                />
              </div>

              <!-- 机场订阅展示开关 (自动机场名) -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{
                  t('profileModal.subscriptionPrefix')
                }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.enableSubscriptions ?? null"
                  :options="prefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ enableSubscriptions: $event as boolean | null })"
                />
              </div>

              <!-- 首个标签前缀开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.tagPrefix') }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.prependTagName ?? null"
                  :options="tagPrefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ prependTagName: $event as boolean | null })"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- === 区块 C：处理管道 (Process Workflow) === -->
      <div class="space-y-3 border-t border-line pt-5">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.pipelineTitle') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.pipelineDesc') }}</span>
        </div>

        <OperatorChain
          :model-value="localProfile.operators || []"
          @update:model-value="updateLocalProfile({ operators: $event })"
        />
      </div>
    </div>
  </div>

  <!-- === 浏览器访问与门户配置折叠区 === -->
  <div class="rounded-md border border-line bg-transparent mt-4 overflow-hidden">
    <button
      :aria-expanded="showPortal"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      data-testid="toggle-portal-btn"
      type="button"
      @click="emit('toggle-portal')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <Globe class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profileModal.portalSectionTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{ t('profileModal.portalSectionDesc') }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showPortal }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showPortal" class="border-t border-line p-4 space-y-4 animate-fade-in-down">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 浏览器打开行为 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.portalModeLabel') }}</label>
          <Select
            :model-value="localProfile.portalMode ?? 'inherit'"
            :options="[
              { value: 'inherit', label: t('profileModal.portalModeInherit') },
              { value: 'portal', label: t('profileModal.portalModePortal') },
              { value: 'redirect', label: t('profileModal.portalModeRedirect') },
              { value: 'raw', label: t('profileModal.portalModeRaw') },
            ]"
            size="sm"
            @update:model-value="
              updateLocalProfile({ portalMode: ($event as 'inherit' | 'portal' | 'redirect' | 'raw') ?? 'inherit' })
            "
          />
          <div v-if="(localProfile.portalMode ?? 'inherit') === 'inherit'" class="flex items-center gap-1.5 mt-1">
            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <span class="text-xs text-fg-muted">
              {{ t('profileModal.currentGlobal', { value: globalPortalModeLabel }) }}
            </span>
          </div>
        </div>

        <!-- 自定义跳转网址 -->
        <div>
          <Input
            id="profile-portal-redirect-url"
            :error="portalRedirectUrlError"
            :label="t('profileModal.portalRedirectUrlLabel')"
            :model-value="localProfile.portalRedirectUrl ?? ''"
            :placeholder="t('profileModal.portalRedirectUrlPlaceholder')"
            size="sm"
            type="url"
            @update:model-value="updateLocalProfile({ portalRedirectUrl: String($event ?? '') })"
          />
        </div>

        <!-- 单订阅组专属公告 -->
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-fg-muted mb-1.5" for="profile-portal-notice">
            {{ t('profileModal.portalNoticeLabel') }}
          </label>
          <Textarea
            id="profile-portal-notice"
            :model-value="localProfile.portalNotice ?? ''"
            :placeholder="t('profileModal.portalNoticePlaceholder')"
            class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
            rows="2"
            @update:model-value="updateLocalProfile({ portalNotice: String($event ?? '') })"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- === Mihomo 多端口 SOCKS5 出站折叠配置区 === -->
  <div class="rounded-md border border-line bg-transparent mt-4 overflow-hidden">
    <button
      :aria-expanded="showMultiSocks"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      data-testid="toggle-multisocks-btn"
      type="button"
      @click="emit('toggle-multi-socks')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <Network class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profileModal.multiSocksSectionTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{
          t('profileModal.multiSocksSectionDesc')
        }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showMultiSocks }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showMultiSocks" class="border-t border-line p-4 space-y-4 animate-fade-in-down">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 多端口 SOCKS5 开关 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.multiSocksEnabledLabel') }}</label>
          <Select
            :model-value="localProfile.multiSocksEnabled ?? null"
            :options="[
              { value: null, label: t('profileModal.followGlobal') },
              { value: true, label: t('profileModal.on') },
              { value: false, label: t('profileModal.off') },
            ]"
            size="sm"
            @update:model-value="updateLocalProfile({ multiSocksEnabled: ($event as boolean | null) ?? null })"
          />
          <div
            v-if="localProfile.multiSocksEnabled === null || localProfile.multiSocksEnabled === undefined"
            class="flex items-center gap-1.5 mt-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <span class="text-xs text-fg-muted">
              {{ t('profileModal.currentGlobal', { value: globalMultiSocksLabel }) }}
            </span>
          </div>
        </div>

        <!-- 轻量模式 (Lite) -->
        <div class="space-y-1.5 sm:col-span-2">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.multiSocksLiteLabel') }}</label>
          <Select
            :model-value="localProfile.multiSocksLite ?? null"
            :options="[
              { value: null, label: t('profileModal.followGlobal') },
              { value: true, label: t('profileModal.on') },
              { value: false, label: t('profileModal.off') },
            ]"
            data-testid="profile-multisocks-lite-select"
            size="sm"
            @update:model-value="updateLocalProfile({ multiSocksLite: ($event as boolean | null) ?? null })"
          />
          <p class="text-xs text-fg-subtle">
            {{
              localProfile.multiSocksLite === null || localProfile.multiSocksLite === undefined
                ? `${t('profileModal.currentGlobal', { value: globalMultiSocksLiteLabel })} · ${t('profileModal.multiSocksLiteHint')}`
                : t('profileModal.multiSocksLiteHint')
            }}
          </p>
        </div>

        <!-- 监听地址 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.multiSocksListenLabel') }}</label>
          <Select
            :model-value="localProfile.multiSocksListen ?? ''"
            :options="[
              { value: '', label: t('profileModal.multiSocksListenInherit', { listen: globalMultiSocksListen }) },
              { value: '127.0.0.1', label: '127.0.0.1' },
              { value: '0.0.0.0', label: '0.0.0.0' },
            ]"
            size="sm"
            @update:model-value="
              updateLocalProfile({ multiSocksListen: ($event as '' | '127.0.0.1' | '0.0.0.0') ?? '' })
            "
          />
        </div>

        <!-- 起始端口 -->
        <div>
          <Input
            id="profile-multisocks-start-port"
            :error="multiSocksStartPortError"
            :label="t('profileModal.multiSocksStartPortLabel')"
            :model-value="localProfile.multiSocksStartPort ?? ''"
            :placeholder="t('profileModal.multiSocksStartPortPlaceholder', { port: globalMultiSocksStartPort })"
            size="sm"
            type="number"
            @update:model-value="updateLocalProfile({ multiSocksStartPort: String($event ?? '') })"
          />
        </div>

        <!-- 最大端口数 -->
        <div>
          <Input
            id="profile-multisocks-max-ports"
            :error="multiSocksMaxPortsError"
            :label="t('profileModal.multiSocksMaxPortsLabel')"
            :model-value="localProfile.multiSocksMaxPorts ?? ''"
            :placeholder="t('profileModal.multiSocksMaxPortsPlaceholder')"
            size="sm"
            type="number"
            @update:model-value="updateLocalProfile({ multiSocksMaxPorts: String($event ?? '') })"
          />
        </div>

        <!-- 可选鉴权账号密码 -->
        <div>
          <Input
            id="profile-multisocks-username"
            :label="t('profileModal.multiSocksUsernameLabel')"
            :model-value="localProfile.multiSocksUsername ?? ''"
            :placeholder="t('profileModal.multiSocksUsernamePlaceholder')"
            size="sm"
            @update:model-value="updateLocalProfile({ multiSocksUsername: String($event ?? '') })"
          />
        </div>
        <div>
          <Input
            id="profile-multisocks-password"
            :label="t('profileModal.multiSocksPasswordLabel')"
            :model-value="localProfile.multiSocksPassword ?? ''"
            :placeholder="t('profileModal.multiSocksPasswordPlaceholder')"
            size="sm"
            type="text"
            @update:model-value="updateLocalProfile({ multiSocksPassword: String($event ?? '') })"
          />
        </div>
      </div>

      <!-- 实时订阅地址与多端口参数预览 -->
      <div class="rounded-md bg-inset/60 p-3 space-y-1.5">
        <p class="text-xs font-medium text-fg">{{ t('profileModal.subscriptionPreviewLabel') }}</p>
        <p class="font-mono text-xs text-fg-muted break-all">{{ subscriptionBasePreviewUrl }}</p>
        <p v-if="effectiveMultiSocksEnabledPreview" class="text-xs text-emerald-500 dark:text-emerald-400">
          {{
            t('profileModal.subscriptionPreviewMultiSocksHint', {
              listen: effectiveListenPreview,
              start: effectiveStartPortPreview,
              max: effectiveMaxPortsPreview,
            })
          }}
        </p>
        <p class="font-mono text-xs text-fg-subtle break-all">
          {{ t('profileModal.subscriptionPreviewTempOverrideHint', { url: subscriptionOverridePreviewUrl }) }}
        </p>
      </div>
    </div>
  </div>
</template>
