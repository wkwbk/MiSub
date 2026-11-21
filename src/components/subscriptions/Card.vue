<script setup>
import { computed, ref } from 'vue';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Lock,
  MessageSquare,
  Pencil,
  QrCode,
  RefreshCw,
  Trash2,
} from '@lucide/vue';
import { formatBytes } from '@shared/format-utils.js';
import { getItemTags } from '@/utils/tags.js';
import { inferAirportRootDomain } from '@shared/airport-domain.js';
import { lookupDomainName } from '@/utils/domain-name-memory.js';
import { api } from '@/lib/http.js';
import { TIMING } from '@/constants/timing.js';
import { useToastStore } from '@/stores/toast.js';
import Switch from '@/components/ui/Switch.vue';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const props = defineProps({
  misub: {
    type: Object,
    required: true,
  },
  isSelectionMode: {
    type: Boolean,
    default: false,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'delete',
  'change',
  'update',
  'edit',
  'preview',
  'qrcode',
  'applyDetectedName',
  'filter-tag',
  'toggle-select',
]);
const { t } = useI18n();
const { showToast } = useToastStore();

const copiedUrl = ref(false);
const copySubscriptionUrl = async () => {
  if (!props.misub?.url) return;
  const copied = await copyTextToClipboard(props.misub.url);
  if (copied) {
    copiedUrl.value = true;
    showToast(t('notices.copied'), 'success');
    setTimeout(() => {
      copiedUrl.value = false;
    }, 1500);
  } else {
    showToast(t('notices.copyFailed'), 'error');
  }
};

const subTags = computed(() => getItemTags(props.misub));
const visibleTags = computed(() => subTags.value.slice(0, 2));
const overflowCount = computed(() => Math.max(0, subTags.value.length - 2));

const getProtocol = (url) => {
  try {
    if (!url) return 'unknown';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('https://')) return 'https';
    if (lowerUrl.startsWith('http://')) return 'http';
    if (lowerUrl.includes('clash')) return 'clash';
  } catch {
    return 'unknown';
  }
  return 'unknown';
};

const protocol = computed(() => getProtocol(props.misub.url));

// 机场自报名称（订阅响应头的 Profile-Title / Content-Disposition），仅用于展示提示
const detectedName = computed(() => {
  const value = props.misub?.detectedName;
  return typeof value === 'string' ? value.trim() : '';
});

// 机场主域名（可点击访问官网）
const rootDomain = computed(() => inferAirportRootDomain(props.misub?.url));

// 按需识别：仅在用户点击时抓取官网标题，避免常规刷新时的额外请求
const detecting = ref(false);
const localDetectedName = ref('');

// 该域名记住的名称（用户此前确认过），优先级高于自动识别
const rememberedName = computed(() => (rootDomain.value ? lookupDomainName(rootDomain.value) : ''));

// 展示优先级：用户记住的名称 > 响应头自报名称 > 本次识别结果
const effectiveDetectedName = computed(() => rememberedName.value || detectedName.value || localDetectedName.value);

const handleDetect = async () => {
  if (detecting.value || !rootDomain.value) return;
  detecting.value = true;
  try {
    const result = await api.post('/api/detect_airport_name', { url: props.misub.url });
    const name = String(result?.name || '').trim();
    if (name) {
      localDetectedName.value = name;
      emit('applyDetectedName', name);
    }
  } catch {
    /* 识别失败静默处理，不影响其他功能 */
  } finally {
    detecting.value = false;
  }
};

const protocolStyle = computed(() => {
  const p = protocol.value;
  switch (p) {
    case 'https':
      return {
        text: 'HTTPS',
        dot: 'bg-emerald-500',
        style: 'border-line bg-transparent text-fg-muted',
      };
    case 'clash':
      return {
        text: 'CLASH',
        dot: 'bg-sky-500',
        style: 'border-line bg-transparent text-fg-muted',
      };
    case 'http':
      return {
        text: 'HTTP',
        dot: 'bg-amber-500',
        style: 'border-line bg-transparent text-fg-muted',
      };
    default:
      return {
        text: 'SUB',
        dot: 'bg-zinc-500',
        style: 'border-line bg-transparent text-fg-muted',
      };
  }
});

const trafficInfo = computed(() => {
  const info = props.misub.userInfo;
  const REASONABLE_TRAFFIC_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 * 1024 * 1024;
  if (
    !info ||
    info.total === undefined ||
    info.download === undefined ||
    info.upload === undefined ||
    info.total >= REASONABLE_TRAFFIC_LIMIT_BYTES
  ) {
    return null;
  }
  const total = info.total;
  const used = info.download + info.upload;
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return {
    used: formatBytes(used),
    total: formatBytes(total),
    percentage: percentage,
  };
});

const expiryInfo = computed(() => {
  const expireTimestamp = props.misub.userInfo?.expire;
  if (!expireTimestamp) return null;
  const REASONABLE_EXPIRY_LIMIT_DAYS = 365 * 10;
  const expiryDate = new Date(expireTimestamp * TIMING.SECOND_IN_MS);
  const now = new Date();
  expiryDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  if (diffDays > REASONABLE_EXPIRY_LIMIT_DAYS) {
    return null;
  }
  let style = 'text-fg-muted';
  let dot = 'bg-zinc-500';
  if (diffDays < 0) {
    style = 'text-red-400 font-semibold';
    dot = 'bg-red-500';
  } else if (diffDays <= 7) {
    style = 'text-amber-400 font-semibold';
    dot = 'bg-amber-500';
  }
  return {
    date: expiryDate.toLocaleDateString(),
    daysRemaining:
      diffDays < 0
        ? t('subscriptions.expired')
        : diffDays === 0
          ? t('subscriptions.expiresToday')
          : t('subscriptions.expiresInDays', { count: diffDays }),
    style,
    dot,
  };
});

const normalizeWebsiteUrl = (value) => {
  const website = (value || '').trim();
  if (!website) return null;
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
};

const websiteUrl = computed(() => {
  const explicitWebsite = normalizeWebsiteUrl(props.misub.website);
  if (explicitWebsite) return explicitWebsite;

  const notes = props.misub.notes;
  if (!notes) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = notes.match(urlRegex);
  return matches ? matches[0] : null;
});

const noteWithoutUrl = computed(() => {
  const notes = props.misub.notes;
  if (!notes) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return notes.replace(urlRegex, '').trim();
});

const hasFooterMeta = computed(() => Boolean(noteWithoutUrl.value || websiteUrl.value));
</script>

<template>
  <div
    :class="[
      isSelectionMode && isSelected ? 'border-line-strong bg-active' : 'border-line bg-surface',
      {
        'opacity-60': !misub.enabled && !isSelectionMode,
        'cursor-pointer': isSelectionMode,
      },
    ]"
    class="group relative flex h-full flex-col overflow-hidden rounded-md border p-3.5 hover:-translate-y-0.5 hover:z-10 transition-all duration-200"
    @click="isSelectionMode ? emit('toggle-select') : null"
  >
    <div class="relative z-10 flex flex-col h-full">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
            <div
              :class="isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong bg-transparent'"
              class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
            >
              <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
            </div>
          </div>

          <span
            :class="protocolStyle.style"
            class="inline-flex h-5 items-center gap-1.5 shrink-0 rounded-md border px-2 text-[10px] font-mono leading-none uppercase tracking-wider"
          >
            <span :class="protocolStyle.dot" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
            {{ protocolStyle.text }}
          </span>

          <div
            v-if="subTags.length > 0"
            class="flex min-w-0 items-center gap-1.5 overflow-hidden"
            data-testid="subscription-card-tags"
          >
            <button
              v-for="tag in visibleTags"
              :key="tag"
              :title="tag"
              class="inline-flex h-5 max-w-[96px] sm:max-w-[110px] shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-[10px] font-medium leading-none text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
              data-testid="subscription-tag-badge"
              type="button"
              @click.stop="emit('filter-tag', tag)"
            >
              <span class="truncate">{{ tag }}</span>
            </button>
            <span
              v-if="overflowCount > 0"
              :title="subTags.join(', ')"
              class="inline-flex h-5 shrink-0 items-center rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none text-fg-subtle"
            >
              +{{ overflowCount }}
            </span>
          </div>

          <span
            v-if="expiryInfo"
            :class="expiryInfo.style"
            class="inline-flex h-5 items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 text-[10px] font-mono leading-none"
          >
            <span :class="expiryInfo.dot" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
            {{ expiryInfo.daysRemaining }}
          </span>
        </div>

        <div
          v-if="!isSelectionMode"
          class="shrink-0 flex items-center gap-0.5 opacity-100 md:opacity-65 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200"
        >
          <button
            :aria-label="t('actions.previewNodes')"
            :title="t('actions.previewNodes')"
            class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
            @click.stop="emit('preview')"
          >
            <Eye class="w-4 h-4" />
          </button>
          <button
            :aria-label="t('actions.showQrCode')"
            :title="t('actions.showQrCode')"
            class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
            @click.stop="emit('qrcode')"
          >
            <QrCode class="w-4 h-4" stroke-width="1.5" />
          </button>
          <button
            :aria-label="t('actions.edit')"
            :title="t('actions.edit')"
            class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-line-strong hover:bg-hover text-fg-muted hover:text-fg transition-colors"
            @click.stop="emit('edit')"
          >
            <Pencil class="w-4 h-4" />
          </button>
          <button
            :aria-label="t('actions.delete')"
            :title="t('actions.delete')"
            class="flex h-8 w-8 md:h-7 md:w-7 items-center justify-center rounded-md border border-transparent hover:border-red-900/60 hover:bg-red-950/40 text-fg-muted hover:text-red-400 transition-colors"
            @click.stop="emit('delete')"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <h3
        :title="misub.name || t('subscriptions.unnamed')"
        class="mt-2 truncate text-base font-semibold leading-snug text-fg"
      >
        {{ misub.name || t('subscriptions.unnamed') }}
      </h3>

      <div
        v-if="rootDomain || (effectiveDetectedName && effectiveDetectedName !== misub.name)"
        class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted"
      >
        <!-- 机场主域名：可点击访问官网 -->
        <a
          v-if="rootDomain"
          :href="`https://${rootDomain}`"
          :title="t('subscriptions.visitSite', { domain: rootDomain })"
          class="inline-flex min-w-0 items-center gap-1 font-mono text-fg-muted hover:text-fg"
          rel="noopener noreferrer"
          target="_blank"
          @click.stop
        >
          <ExternalLink class="h-3 w-3 shrink-0" />
          <span class="truncate">{{ rootDomain }}</span>
        </a>
        <!-- 机场识别结果：优先响应头自报名称，其次官网标题。仅作提示，不覆盖用户命名。 -->
        <template v-if="effectiveDetectedName && effectiveDetectedName !== misub.name">
          <span v-if="rootDomain" aria-hidden="true" class="text-fg-subtle">·</span>
          <div
            :title="t('subscriptions.detectedNameHint')"
            class="inline-flex min-w-0 items-center gap-1 text-fg-muted"
          >
            <Lock aria-hidden="true" class="h-3 w-3 shrink-0" />
            <span class="truncate">{{ effectiveDetectedName }}</span>
            <button
              :title="t('subscriptions.applyDetectedName')"
              class="shrink-0 font-medium text-fg hover:text-fg-muted underline underline-offset-2 transition-colors"
              type="button"
              @click.stop="emit('applyDetectedName', effectiveDetectedName)"
            >
              {{ t('subscriptions.applyDetectedNameShort') }}
            </button>
          </div>
        </template>
        <!-- 未识别到名称时：提供手动触发识别（抓官网标题），按需请求 -->
        <template v-else-if="rootDomain && !localDetectedName">
          <span aria-hidden="true" class="text-fg-subtle">·</span>
          <button
            :disabled="detecting"
            :title="t('subscriptions.detectNameHint')"
            class="shrink-0 text-fg-subtle hover:text-fg transition-colors"
            type="button"
            @click.stop="handleDetect"
          >
            {{ detecting ? t('subscriptions.detecting') : t('subscriptions.detectName') }}
          </button>
        </template>
      </div>

      <div
        :class="{ 'pointer-events-none': isSelectionMode }"
        class="mt-2.5 mb-2.5 flex items-center gap-1.5 rounded-md border border-line/70 bg-transparent px-2.5 py-1.5 transition-colors hover:border-line-strong"
      >
        <Link2 class="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span
          :aria-label="t('subscriptions.urlLabel')"
          :title="misub.url"
          class="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted select-all"
        >
          {{ misub.url }}
        </span>
        <button
          :aria-label="t('actions.copyLink')"
          :title="t('actions.copyLink')"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          type="button"
          @click.stop="copySubscriptionUrl"
        >
          <Check v-if="copiedUrl" class="h-3.5 w-3.5 text-emerald-500" stroke-width="2.5" />
          <Copy v-else class="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        v-if="trafficInfo"
        class="mb-2.5 grid gap-2 rounded-md border border-line bg-transparent px-3 py-2.5"
      >
        <div class="space-y-1.5">
          <div class="flex items-end justify-between text-xs">
            <span class="text-fg-muted"
              >{{ t('subscriptions.usedTraffic') }}
              <span class="font-mono font-semibold text-fg">{{ trafficInfo.used }}</span></span
            >
            <span class="font-mono text-fg-muted">{{ trafficInfo.total }}</span>
          </div>
          <div class="h-1 w-full overflow-hidden rounded-none bg-active">
            <div
              :style="{ width: trafficInfo.percentage + '%' }"
              class="h-full bg-accent transition-all duration-500"
            ></div>
          </div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-fg-muted">{{ t('subscriptions.nodeCountLabel') }}</span>
          <span class="font-mono font-semibold text-fg">
            {{
              misub.isUpdating
                ? t('subscriptions.updating')
                : t('subscriptions.nodeCount', { count: misub.nodeCount || 0 })
            }}
          </span>
        </div>
      </div>
      <div
        v-else
        class="mb-2.5 flex items-center justify-between gap-2 rounded-md border border-line/70 bg-transparent px-3 py-2 text-xs"
      >
        <span class="text-fg-subtle">{{ t('subscriptions.noTrafficData') }}</span>
        <span class="font-mono font-semibold text-fg">
          {{
            misub.isUpdating
              ? t('subscriptions.updating')
              : t('subscriptions.nodeCount', { count: misub.nodeCount || 0 })
          }}
        </span>
      </div>

      <div
        :class="{ 'pointer-events-none': isSelectionMode }"
        class="mt-auto flex items-center justify-between gap-3 border-t border-line pt-2.5"
      >
        <Switch
          v-model="misub.enabled"
          :label="misub.enabled ? t('common.enabled') : t('common.disabled')"
          @change="emit('change')"
        />

        <div class="flex items-center gap-2">
          <button
            :aria-label="misub.isUpdating ? t('subscriptions.updating') : t('subscriptions.updateNodeInfo')"
            :disabled="misub.isUpdating"
            :title="misub.isUpdating ? t('subscriptions.updating') : t('subscriptions.updateNodeInfo')"
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:opacity-50"
            @click.stop="emit('update')"
          >
            <RefreshCw :class="{ 'animate-spin text-fg': misub.isUpdating }" class="w-3.5 h-3.5" />
            <span>
              {{ misub.isUpdating ? t('subscriptions.updating') : t('subscriptions.updateNodeInfo') }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-if="hasFooterMeta"
        class="mt-3 flex items-center gap-1 truncate text-[10px] text-fg-muted"
        data-testid="subscription-footer-meta"
      >
        <MessageSquare class="w-3 h-3 shrink-0" />
        <a
          v-if="websiteUrl"
          :href="websiteUrl"
          :title="t('subscriptions.visitWebsite')"
          class="flex items-center gap-0.5 font-mono text-fg hover:text-fg-muted underline underline-offset-2 transition-colors cursor-pointer"
          data-testid="subscription-website-link"
          rel="noopener noreferrer"
          target="_blank"
          @click.stop
        >
          {{ t('subscriptions.website') }}
          <ExternalLink class="w-2.5 h-2.5" />
        </a>
        <span v-if="noteWithoutUrl" class="truncate" data-testid="subscription-notes">{{ noteWithoutUrl }}</span>
      </div>
    </div>
  </div>
</template>
