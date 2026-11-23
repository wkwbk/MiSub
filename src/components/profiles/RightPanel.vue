<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { ArrowRight, Check, Copy, Link2, Loader2, QrCode } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { useToastStore } from '@/stores/toast.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import { createShortLink } from '@/lib/api.js';
import { isReservedSubPath, normalizeSubPath } from '@shared/reserved-paths.js';

const props = defineProps({
  config: Object,
  profiles: Array,
  compact: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['qrcode']);

const { showToast } = useToastStore();
const dataStore = useDataStore();
const { t } = useI18n();

const copied = ref(false);
const shortCopied = ref(false);
const customSlug = ref('');
const isGeneratingShortLink = ref(false);
const generatedShortLink = ref('');
let copyTimeout = null;
let shortCopyTimeout = null;

const formats = ['universal', 'Base64', 'Clash', 'Sing-Box', 'Surge', 'Loon'];
const selectedFormat = ref('universal');
const selectedId = ref('default');

const formatLabel = (format) => (format === 'universal' ? t('dashboard.linkCard.universalFormat') : format);
const isStableToken = (value) => typeof value === 'string' && value.trim() === value && /^[a-zA-Z0-9-_]+$/.test(value);

const hasProfiles = computed(() => (props.profiles || []).length > 0);
const rawSubPath = computed(() =>
  typeof props.config?.profileToken === 'string' ? props.config.profileToken.trim() : '',
);
const effectiveSubPath = computed(() => normalizeSubPath(rawSubPath.value, 'sub'));
const subPathReady = computed(
  () => isStableToken(effectiveSubPath.value) && !isReservedSubPath(effectiveSubPath.value),
);
const mainTokenReady = computed(() => isStableToken(props.config?.myToken));

const setupTasks = computed(() => {
  const tasks = [];
  if (!subPathReady.value) {
    tasks.push({
      id: 'profile-token',
      title: t('dashboard.linkCard.profileTokenTitle'),
      description: t('dashboard.linkCard.profileTokenDesc'),
      to: '/dashboard/settings?focus=profileToken',
    });
  }
  if (!mainTokenReady.value) {
    tasks.push({
      id: 'main-token',
      title: t('dashboard.linkCard.mainTokenTitle'),
      description: t('dashboard.linkCard.mainTokenDesc'),
      to: '/dashboard/settings?focus=mytoken',
    });
  }
  if (!hasProfiles.value) {
    tasks.push({
      id: 'profile',
      title: t('dashboard.linkCard.profileTitle'),
      description: t('dashboard.linkCard.profileDesc'),
      to: '/dashboard/subscriptions?focus=profiles',
    });
  }
  return tasks;
});

const hasSetupTasks = computed(() => setupTasks.value.length > 0);

const requiredToken = computed(() => {
  if (!subPathReady.value) {
    return {
      type: 'profileToken',
      value: rawSubPath.value,
      name: t('dashboard.linkCard.tokenNameShare'),
    };
  }
  return selectedId.value === 'default'
    ? {
        type: 'mytoken',
        value: props.config?.myToken,
        name: t('dashboard.linkCard.tokenNameMain'),
      }
    : {
        type: 'profileToken',
        value: effectiveSubPath.value,
        name: t('dashboard.linkCard.tokenNameShare'),
      };
});

const isLinkValid = computed(() =>
  selectedId.value === 'default' ? subPathReady.value && mainTokenReady.value : subPathReady.value,
);

const subLink = computed(() => {
  if (!isLinkValid.value) {
    return t('dashboard.linkCard.configureTokenFirst', { name: requiredToken.value.name });
  }

  const origin = window.location.origin;
  const identifier = selectedId.value === 'default' ? props.config.myToken : selectedId.value;
  const baseUrl = `${origin}/${effectiveSubPath.value}/${identifier}`;

  if (selectedFormat.value === 'universal') {
    return baseUrl;
  }

  const targetMapping = { 'Sing-Box': 'singbox', QuanX: 'quanx' };
  const formatKey = targetMapping[selectedFormat.value] || selectedFormat.value.toLowerCase();
  return `${baseUrl}?${formatKey}`;
});

const copyToClipboard = async () => {
  if (!isLinkValid.value) {
    showToast(t('notices.linkInvalid'), 'error');
    return;
  }
  const isCopied = await copyTextToClipboard(subLink.value);
  if (!isCopied) {
    showToast(t('notices.copyFailed'), 'error');
    return;
  }
  showToast(t('notices.copied'), 'success');
  copied.value = true;
  clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    copied.value = false;
  }, 2000);
};

const selectedProfile = computed(() => {
  if (selectedId.value === 'default') return null;
  return (props.profiles || []).find((p) => (p.customId || p.id) === selectedId.value) || null;
});

const shortLinkEnabled = computed(() =>
  Boolean(props.config?.shortLink?.enabled && String(props.config?.shortLink?.apiUrl || '').trim()),
);

watch(
  [selectedId, selectedFormat, () => selectedProfile.value?.shortLink],
  () => {
    if (selectedProfile.value && selectedFormat.value === 'universal' && selectedProfile.value.shortLink) {
      generatedShortLink.value = selectedProfile.value.shortLink;
    } else {
      generatedShortLink.value = '';
    }
    customSlug.value = '';
  },
  { immediate: true },
);

const handleGenerateShortLink = async () => {
  if (!isLinkValid.value || isGeneratingShortLink.value) return;
  isGeneratingShortLink.value = true;
  try {
    const shouldSaveToProfile = Boolean(selectedProfile.value && selectedFormat.value === 'universal');
    const result = await createShortLink({
      url: subLink.value,
      slug: customSlug.value.trim(),
      profileId: shouldSaveToProfile ? selectedProfile.value.id : '',
      saveToProfile: shouldSaveToProfile,
    });

    if (!result?.success || !result.shortUrl) {
      showToast(result?.message || result?.error || t('dashboard.linkCard.shortLinkFailed'), 'error');
      return;
    }

    generatedShortLink.value = result.shortUrl;
    customSlug.value = '';

    if (result.savedToProfile && selectedProfile.value) {
      const target = (dataStore.profiles || []).find((p) => p.id === selectedProfile.value.id);
      if (target) {
        target.shortLink = result.shortUrl;
      }
      showToast(t('dashboard.linkCard.shortLinkCreatedAndSaved'), 'success');
    } else {
      showToast(t('dashboard.linkCard.shortLinkCreated'), 'success');
    }
  } finally {
    isGeneratingShortLink.value = false;
  }
};

const copyShortLink = async () => {
  if (!generatedShortLink.value) return;
  const isCopied = await copyTextToClipboard(generatedShortLink.value);
  if (!isCopied) {
    showToast(t('notices.copyFailed'), 'error');
    return;
  }
  showToast(t('notices.copied'), 'success');
  shortCopied.value = true;
  clearTimeout(shortCopyTimeout);
  shortCopyTimeout = setTimeout(() => {
    shortCopied.value = false;
  }, 2000);
};

onUnmounted(() => {
  clearTimeout(copyTimeout);
  clearTimeout(shortCopyTimeout);
});
</script>

<template>
  <div>
    <div :class="compact ? 'p-4' : 'p-5'" class="bg-surface rounded-md border border-line">
      <h3
        :class="compact ? 'text-sm' : 'text-base'"
        class="font-semibold text-fg pb-4 mb-4 border-b border-line flex items-center gap-2 list-item-animation"
        style="--delay-index: 0"
      >
        <span :class="isLinkValid ? 'bg-emerald-500' : 'bg-amber-500'" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
        {{ t('dashboard.linkCard.title') }}
      </h3>

      <div
        v-if="hasSetupTasks"
        class="mb-4 rounded-md border border-line bg-transparent p-2.5 text-fg list-item-animation"
        style="--delay-index: 1"
      >
        <p class="text-xs font-medium text-fg flex items-center gap-2">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
          {{ t('dashboard.linkCard.setupTitle') }}
        </p>
        <div class="mt-2 grid gap-1.5">
          <router-link
            v-for="task in setupTasks"
            :key="task.id"
            :to="task.to"
            class="group/task flex items-center justify-between gap-2 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs text-fg-muted hover:border-line-strong hover:bg-hover hover:text-fg transition-colors"
          >
            <span class="min-w-0">
              <span class="block font-medium text-fg">{{ task.title }}</span>
              <span class="mt-0.5 block text-xs leading-snug text-fg-muted">{{ task.description }}</span>
            </span>
            <ArrowRight
              aria-hidden="true"
              class="h-4 w-4 shrink-0 text-fg-subtle transition-all group-hover/task:translate-x-0.5 group-hover/task:text-fg"
            />
          </router-link>
        </div>
      </div>

      <div class="mb-4 list-item-animation" style="--delay-index: 2">
        <label class="block text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5">{{
          t('dashboard.linkCard.selectContent')
        }}</label>
        <Select
          v-model="selectedId"
          :options="[
            { value: 'default', label: t('dashboard.linkCard.defaultSubscription') },
            ...(profiles || []).map((profile) => ({
              value: profile.customId || profile.id,
              label: profile.name,
            })),
          ]"
          trigger-class="font-mono"
        />
      </div>

      <div class="mb-4 list-item-animation" style="--delay-index: 3">
        <label class="block text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">{{
          t('dashboard.linkCard.selectFormat')
        }}</label>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="(format, index) in formats"
            :key="format"
            :aria-pressed="selectedFormat === format"
            :class="[
              selectedFormat === format
                ? 'bg-active text-fg border-line-strong font-semibold'
                : 'bg-transparent text-fg-muted border-line hover:bg-hover hover:text-fg',
            ]"
            :style="{ '--delay-index': index }"
            class="min-h-9 px-2 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors flex justify-center items-center text-center shadow-none list-item-animation"
            @click="selectedFormat = format"
          >
            {{ formatLabel(format) }}
          </button>
        </div>
      </div>

      <div class="relative list-item-animation" style="--delay-index: 4">
        <input
          :aria-label="t('dashboard.linkCard.linkField')"
          :class="{
            'cursor-not-allowed text-fg-subtle': !isLinkValid,
          }"
          :disabled="!isLinkValid"
          :value="subLink"
          class="w-full min-h-11 text-xs sm:text-sm text-fg bg-transparent rounded-md pl-3 pr-22 py-2.5 border border-line focus-visible:outline-hidden focus-visible:border-line-strong font-mono shadow-none"
          readonly
          type="text"
        />
        <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            :aria-label="t('dashboard.linkCard.showQrCode')"
            :class="isLinkValid ? 'hover:text-fg hover:bg-hover' : 'cursor-not-allowed opacity-50'"
            :disabled="!isLinkValid"
            :title="t('dashboard.linkCard.showQrCode')"
            class="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted transition-colors duration-200 shadow-none"
            @click="$emit('qrcode', subLink, t('dashboard.linkCard.qrTitle'))"
          >
            <QrCode class="h-4 w-4" stroke-width="1.5" />
          </button>
          <button
            :aria-label="t('dashboard.linkCard.copyLink')"
            :class="
              isLinkValid
                ? 'bg-accent text-accent-fg border-accent hover:opacity-90'
                : 'border-line bg-transparent text-fg-muted cursor-not-allowed opacity-50'
            "
            :disabled="!isLinkValid"
            :title="t('dashboard.linkCard.copyLink')"
            class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-200 shadow-none"
            @click="copyToClipboard"
          >
            <Transition mode="out-in" name="fade">
              <Check v-if="copied" class="h-4 w-4" stroke-width="2.5" />
              <Copy v-else class="h-4 w-4" stroke-width="1.5" />
            </Transition>
          </button>
        </div>
      </div>

      <!-- 短链生成与展示 -->
      <div
        v-if="(shortLinkEnabled || generatedShortLink) && isLinkValid"
        class="mt-3 pt-3 border-t border-line space-y-2.5 list-item-animation"
        style="--delay-index: 5"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Link2 class="h-3.5 w-3.5" />
            {{ t('dashboard.linkCard.shortLinkTitle') }}
          </span>
        </div>

        <div v-if="shortLinkEnabled" class="flex items-center gap-1.5">
          <input
            v-model="customSlug"
            :placeholder="t('dashboard.linkCard.shortLinkSlugPlaceholder')"
            class="flex-1 min-w-0 h-9 px-2.5 text-xs font-mono text-fg bg-inset border border-line rounded-md focus-visible:outline-hidden focus-visible:border-line-strong"
            type="text"
            @keyup.enter="handleGenerateShortLink"
          />
          <button
            :disabled="isGeneratingShortLink"
            class="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md border border-line bg-transparent text-fg hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            type="button"
            @click="handleGenerateShortLink"
          >
            <Loader2 v-if="isGeneratingShortLink" class="h-3.5 w-3.5 animate-spin" />
            <span>{{
              isGeneratingShortLink
                ? t('dashboard.linkCard.shortLinkGenerating')
                : t('dashboard.linkCard.shortLinkGenerate')
            }}</span>
          </button>
        </div>

        <div v-if="generatedShortLink" class="relative">
          <input
            :aria-label="t('dashboard.linkCard.shortLinkTitle')"
            :value="generatedShortLink"
            class="w-full min-h-10 text-xs sm:text-sm text-fg bg-inset rounded-md pl-3 pr-20 py-2 border border-line focus-visible:outline-hidden focus-visible:border-line-strong font-mono shadow-none"
            readonly
            type="text"
          />
          <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              :aria-label="t('dashboard.linkCard.showQrCode')"
              :title="t('dashboard.linkCard.showQrCode')"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted hover:text-fg hover:bg-hover transition-colors"
              type="button"
              @click="$emit('qrcode', generatedShortLink, t('dashboard.linkCard.shortLinkQrTitle'))"
            >
              <QrCode class="h-3.5 w-3.5" stroke-width="1.5" />
            </button>
            <button
              :aria-label="t('dashboard.linkCard.shortLinkCopy')"
              :title="t('dashboard.linkCard.shortLinkCopy')"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-accent bg-accent text-accent-fg hover:opacity-90 transition-colors"
              type="button"
              @click="copyShortLink"
            >
              <Check v-if="shortCopied" class="h-3.5 w-3.5" stroke-width="2.5" />
              <Copy v-else class="h-3.5 w-3.5" stroke-width="1.5" />
            </button>
          </div>
        </div>
      </div>

      <p
        v-if="!isLinkValid && !hasSetupTasks"
        class="text-xs text-fg-muted mt-3 flex items-start gap-2 list-item-animation"
        style="--delay-index: 5"
      >
        <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
        <span>
          {{ t('dashboard.linkCard.hintPrefix') }}
          <span>
            {{ t('dashboard.linkCard.fixedTokenHint', { name: requiredToken.name }) }}
            <router-link
              class="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg-muted"
              to="/dashboard/settings"
              >{{ t('dashboard.linkCard.settingsLink') }}</router-link
            >
            {{
              t('dashboard.linkCard.fixedTokenHintSuffix', {
                name: requiredToken.name,
              })
            }}
          </span>
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
