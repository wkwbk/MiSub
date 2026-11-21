<script setup>
import { computed, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  show: Boolean,
  profile: Object,
  clients: Array,
  profileToken: String,
});

const emit = defineEmits(['close']);
const { t } = useI18n();

// 设备检测
const detectedPlatform = ref(null);

const detectPlatform = () => {
  const ua = navigator.userAgent;
  if (/HarmonyOS|OpenHarmony/.test(ua)) return 'HarmonyOS';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux';
  return null;
};

// URL Scheme 映射表（内置）
// 桌面端 Clash/Mihomo 系客户端在导入订阅时会直接拉取这里的 url。
// 明确带上 target=clash，避免客户端/中间层使用通用 target 名称时拿到原始 Base64 节点列表。
const urlSchemeMap = {
  'clash-verge-rev': 'clash://install-config?url={url_clash}&name={name}',
  'clash-party': 'mihomo://install-config?url={url_clash}&name={name}',
  clashbox: 'clash://install-config?url={url_clash}&name={name}',
  v2rayn: 'v2rayng://install-config?url={url}',
  v2rayng: 'v2rayng://install-config?url={url}',
  shadowrocket: 'shadowrocket://add/sub://{url_base64}?remark={name}',
  hiddify: 'hiddify://import/{url}',
  nekobox: 'nekobox://install-config?name={name}&type=SUBSCRIPTION&url={url}',
  stash: 'stash://install-config?url={url}&name={name}',
  loon: 'loon://import?sub={url}&name={name}',
  egern: 'egern:/profiles/new?name={name}&url={url}',
  surge: 'surge:///install-config?url={url}',
  flclash: 'clash://install-config?url={url}&name={name}',
  clashmi: 'clash://install-config?url={url}&name={name}',
  flyclash: 'clash://install-config?url={url}&name={name}',
  karing: 'karing://install-config?url={url}&name={name}',
  quantumultx: 'quantumult-x:///add-resource?remote-resource={url_encoded}',
};

// 生成订阅链接
const getSubscriptionUrl = () => {
  if (!props.profile) return '';
  const token = props.profileToken || 'profiles';
  const identifier = props.profile.customId || props.profile.id;
  return `${window.location.origin}/${token}/${identifier}`;
};

// 生成深度链接
const withQueryParam = (url, key, value) => {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

const generateDeepLink = (client) => {
  const subUrl = getSubscriptionUrl();
  const clashSubUrl = withQueryParam(subUrl, 'target', 'clash');
  const scheme = urlSchemeMap[client.id];

  if (!scheme) return null;

  return scheme
    .replace('{url_clash}', encodeURIComponent(clashSubUrl))
    .replace('{url}', encodeURIComponent(subUrl))
    .replace('{name}', encodeURIComponent(props.profile?.name || t('quickImport.defaultName')))
    .replace('{url_base64}', btoa(subUrl))
    .replace('{url_encoded}', encodeURIComponent(subUrl));
};

// 过滤支持一键导入的客户端
const supportedClients = computed(() => {
  if (!props.clients) return [];
  return props.clients.filter((client) => urlSchemeMap[client.id]);
});

// 按平台分组并排序
const groupedClients = computed(() => {
  const platform = detectedPlatform.value;
  const clients = supportedClients.value;

  if (!platform) return clients;

  // 将当前平台的客户端置顶
  const platformClients = clients.filter((c) => c.platforms?.includes(platform));
  const otherClients = clients.filter((c) => !c.platforms?.includes(platform));

  return [...platformClients, ...otherClients];
});

// 判断客户端是否为{{ t('quickImport.recommended') }}（当前平台）
const isRecommended = (client) => {
  return detectedPlatform.value && client.platforms?.includes(detectedPlatform.value);
};

// 处理客户端点击
const handleClientClick = (client) => {
  const deepLink = generateDeepLink(client);
  if (deepLink) {
    window.location.href = deepLink;
  }
};

// 获取平台标签
const getPlatformLabel = (platform) => {
  const map = {
    ios: 'iOS',
    android: 'Android',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    HarmonyOS: 'HarmonyOS',
  };
  return map[platform] || platform;
};

const closeModal = () => {
  emit('close');
};

onMounted(() => {
  detectedPlatform.value = detectPlatform();
});
</script>

<template>
  <Modal :show="show" size="4xl" @update:show="(value) => !value && closeModal()">
    <template #title>
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ t('quickImport.title') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-subtle">
            {{ t('quickImport.subtitle') }}
          </p>
        </div>
        <button
          :aria-label="t('common.close')"
          class="w-8 h-8 flex items-center justify-center rounded-md border border-line bg-transparent text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
          @click="closeModal"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
      <div
        v-if="detectedPlatform"
        class="mt-3 flex items-center gap-2 px-3 py-2 bg-transparent border border-line rounded-md"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
        <span class="text-xs text-fg-muted">
          {{ t('quickImport.detectedPrefix') }}
          <strong class="font-mono text-fg">{{ getPlatformLabel(detectedPlatform) }}</strong>{{
            t('quickImport.detectedSuffix')
          }}
        </span>
      </div>
    </template>

    <template #body>
      <div v-if="groupedClients.length === 0" class="py-12 text-center text-sm text-fg-subtle">
        {{ t('quickImport.empty') }}
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <button
          v-for="client in groupedClients"
          :key="client.id"
          :class="
            isRecommended(client)
              ? 'bg-active border-line-strong'
              : 'bg-surface border-line hover:border-line-strong hover:bg-hover'
          "
          class="group relative flex flex-col items-center gap-3 p-4 rounded-md border transition-colors shadow-none cursor-pointer"
          @click="handleClientClick(client)"
        >
          <div
            v-if="isRecommended(client)"
            class="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent text-accent-fg text-[10px] font-medium rounded-sm shadow-none"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            {{ t('quickImport.recommended') }}
          </div>
          <div
            class="w-12 h-12 rounded-md flex items-center justify-center text-2xl bg-inset border border-line overflow-hidden"
          >
            <img
              v-if="client.icon && (client.icon.includes('/') || client.icon.startsWith('data:'))"
              :alt="client.name"
              :src="client.icon"
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover rounded-md p-1"
            />
            <span v-else>{{ client.icon }}</span>
          </div>
          <div class="text-center">
            <div class="text-xs font-semibold text-fg line-clamp-1">
              {{ client.name }}
            </div>
            <div class="mt-1 flex flex-wrap justify-center gap-1">
              <span
                v-for="platform in client.platforms?.slice(0, 2)"
                :key="platform"
                class="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border border-line bg-transparent text-fg-subtle"
              >
                {{ getPlatformLabel(platform) }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </template>

    <template #footer>
      <div class="w-full rounded-md border border-line bg-transparent px-4 py-3 text-xs text-fg-subtle">
        <div class="flex items-start gap-2.5">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-[5px]"></span>
          <div>
            <p class="font-medium text-fg">
              {{ t('quickImport.tipsTitle') }}
            </p>
            <ul class="mt-1 space-y-1 list-disc list-inside">
              <li>{{ t('quickImport.tipInstalled') }}</li>
              <li>{{ t('quickImport.tipOpenApp') }}</li>
              <li>{{ t('quickImport.tipBrowserConfirm') }}</li>
              <li class="font-medium text-fg-muted">
                {{ t('quickImport.tipDefaultApp') }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>
