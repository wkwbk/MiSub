/**
 * Default public clients (Clash Verge Rev, v2rayN, Shadowrocket, sing-box, etc.).
 * 共享单一数据源，供前端 src/ 与后端 functions/ 共同复用。
 */

export const CLIENT_PLATFORMS = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
  { value: 'HarmonyOS', label: 'HarmonyOS' },
];

export const CLIENT_PLATFORM_ORDER = CLIENT_PLATFORMS.map((p) => p.value);

const DEFAULT_PUBLIC_CLIENTS = [
  {
    id: 'clash-verge-rev',
    name: 'Clash Verge Rev',
    icon: '/icons/clients/clash-verge-rev.png',
    description: '现代化的 Clash 客户端，界面美观，功能强大，支持多平台。',
    platforms: ['windows', 'macos', 'linux'],
    url: 'https://github.com/clash-verge-rev/clash-verge-rev/releases',
    repo: 'clash-verge-rev/clash-verge-rev',
    version: null,
    enabled: true,
  },
  {
    id: 'clash-party',
    name: 'Clash-Party',
    icon: '/icons/clients/clash-party.png',
    description: '基于 Electron 的 Mihomo 图形客户端，专注于简单易用的体验。',
    platforms: ['windows', 'macos', 'linux'],
    url: 'https://github.com/mihomo-party-org/clash-party/releases',
    repo: 'mihomo-party-org/clash-party',
    version: null,
    enabled: true,
  },
  {
    id: 'v2rayn',
    name: 'v2rayN',
    icon: '/icons/clients/v2rayn.png',
    description: 'Windows 平台最流行的 V2Ray/Xray 客户端，功能强大且易于使用。',
    platforms: ['windows', 'linux'],
    url: 'https://github.com/2dust/v2rayN/releases',
    repo: '2dust/v2rayN',
    version: null,
    enabled: true,
  },
  {
    id: 'v2rayng',
    name: 'v2rayNG',
    icon: '/icons/clients/v2rayng.png',
    description: 'Android 平台上最流行的通用代理工具，支持多种协议。',
    platforms: ['android'],
    url: 'https://github.com/2dust/v2rayNG/releases',
    repo: '2dust/v2rayNG',
    version: null,
    enabled: true,
  },
  {
    id: 'shadowrocket',
    name: 'Shadowrocket',
    icon: '/icons/clients/shadowrocket.png',
    description: 'iOS 平台功能强大的网络工具，需使用非中国区 Apple ID 下载。',
    platforms: ['ios'],
    url: 'https://apps.apple.com/us/app/shadowrocket/id932747118',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'hiddify',
    name: 'Hiddify',
    icon: '/icons/clients/hiddify.png',
    description: '新一代通用客户端，支持 Sing-box 核心，全平台兼容。',
    platforms: ['windows', 'macos', 'linux', 'android', 'ios'],
    url: 'https://github.com/hiddify/hiddify-next/releases',
    repo: 'hiddify/hiddify-next',
    version: null,
    enabled: true,
  },
  {
    id: 'sing-box',
    name: 'sing-box',
    icon: '/icons/clients/singbox.png',
    description: 'sing-box 官方全平台图形客户端（SFA / SFI / SFM / SFL），与内核同仓发布。',
    platforms: ['windows', 'macos', 'linux', 'android', 'ios'],
    url: 'https://github.com/SagerNet/sing-box/releases',
    repo: 'SagerNet/sing-box',
    version: null,
    enabled: true,
  },
  {
    id: 'nekobox',
    name: 'NekoBox',
    icon: '/icons/clients/nekobox.png',
    description: '功能丰富的全能代理客户端，支持 Sing-box 和 Xray 核心。',
    platforms: ['android', 'windows'],
    url: 'https://github.com/MatsuriDayo/NekoBoxForAndroid/releases',
    repo: 'MatsuriDayo/NekoBoxForAndroid',
    version: null,
    enabled: true,
  },
  {
    id: 'stash',
    name: 'Stash',
    icon: '/icons/clients/stash.jpg',
    description: 'iOS 平台上强大的基于规则的代理实用工具，支持多种协议。',
    platforms: ['ios', 'macos'],
    url: 'https://apps.apple.com/us/app/stash-rule-based-proxy/id1596063349',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'loon',
    name: 'Loon',
    icon: '/icons/clients/loon.jpg',
    description: 'iOS 平台功能强大的网络工具，界面简洁优雅，支持插件扩展。',
    platforms: ['ios', 'macos'],
    url: 'https://apps.apple.com/us/app/loon/id1373567447',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'egern',
    name: 'Egern',
    icon: '/icons/clients/egern.jpg',
    description: 'iOS 平台的规则代理客户端，支持通过订阅链接快速导入配置。',
    platforms: ['ios'],
    url: 'https://apps.apple.com/us/app/egern/id1616105820',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'surge',
    name: 'Surge',
    icon: '/icons/clients/surge.png',
    description: 'iOS/macOS 平台的高级网络工具，拥有强大的性能和丰富的功能。',
    platforms: ['ios', 'macos'],
    url: 'https://apps.apple.com/us/app/surge-6/id1442620678',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'flclash',
    name: 'FlClash',
    icon: '/icons/clients/flclash.png',
    description: '基于 Flutter 开发的多平台 Clash 客户端，界面美观流畅。',
    platforms: ['windows', 'linux', 'android'],
    url: 'https://github.com/chen08209/FlClash/releases',
    repo: 'chen08209/FlClash',
    version: null,
    enabled: true,
  },
  {
    id: 'clashmi',
    name: 'ClashMI',
    icon: '/icons/clients/clashmi.png',
    description: '基于 Mihomo 内核的多平台客户端，简单易用，支持全平台。',
    platforms: ['windows', 'macos', 'linux', 'android', 'ios'],
    url: 'https://github.com/KaringX/clashmi/releases',
    repo: 'KaringX/clashmi',
    version: null,
    enabled: true,
  },
  {
    id: 'flyclash',
    name: 'FlyClash',
    icon: '/icons/clients/flyclash.png',
    description: '基于 ClashMeta 内核的轻量级客户端，专注于速度和稳定性。',
    platforms: ['windows', 'android'],
    url: 'https://github.com/GtxFury/FlyClash/releases',
    repo: 'GtxFury/FlyClash',
    version: null,
    enabled: true,
  },
  {
    id: 'karing',
    name: 'Karing',
    icon: '/icons/clients/karing.png',
    description: '简单的兼容 Clash/V2ray/Sing-box 的全平台客户端。',
    platforms: ['windows', 'macos', 'linux', 'android', 'ios'],
    url: 'https://github.com/KaringX/karing/releases',
    repo: 'KaringX/karing',
    version: null,
    enabled: true,
  },
  {
    id: 'quantumultx',
    name: 'Quantumult X',
    icon: '/icons/clients/quantumultx.png',
    description: 'iOS 平台功能强大的网络工具，界面精美，支持脚本。',
    platforms: ['ios'],
    url: 'https://apps.apple.com/us/app/quantumult-x/id1443988620',
    repo: null,
    version: null,
    enabled: true,
  },
  {
    id: 'clashbox',
    name: 'ClashBox',
    icon: '/icons/clients/clashbox.png',
    description: 'HarmonyOS NEXT 平台的原生 Clash 客户端，界面美观，性能强大。',
    platforms: ['HarmonyOS'],
    url: 'https://github.com/xiaobaigroup/ClashBox/releases',
    repo: 'xiaobaigroup/ClashBox',
    version: null,
    enabled: true,
  },
];

export interface PublicClientItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  platforms: string[];
  url: string;
  repo: string | null;
  version: string | null;
  enabled: boolean;
}

export interface PublicClientsConfig {
  enabled: boolean;
  items: PublicClientItem[];
}

export const DEFAULT_PUBLIC_CLIENTS_CONFIG: PublicClientsConfig = {
  enabled: true,
  items: DEFAULT_PUBLIC_CLIENTS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function resolvePublicClientIcon(client: Partial<PublicClientItem> | null | undefined): string {
  const rawIcon = String(client?.icon || '').trim();
  if (rawIcon) return rawIcon;
  try {
    const hostname = new URL(client?.url || '').hostname;
    if (hostname) {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
    }
  } catch {}
  return '';
}

export function normalizePublicClientsConfig(value: unknown): PublicClientsConfig {
  if (Array.isArray(value)) {
    return normalizePublicClientsConfig({ enabled: true, items: value });
  }
  const raw = isRecord(value) ? value : {};
  const useDefaults = !Array.isArray(raw.items);

  const items: PublicClientItem[] = useDefaults
    ? DEFAULT_PUBLIC_CLIENTS.map((item) => ({ ...item, platforms: [...(item.platforms || [])] }))
    : (raw.items as unknown[])
        .filter((item): item is Record<string, unknown> => isRecord(item) && Boolean(String(item.name || '').trim()))
        .map((item, index) => {
          const id = String(item.id || `client-${index + 1}`).trim();
          const icon = String(item.icon || '').trim();
          const platforms = Array.isArray(item.platforms)
            ? item.platforms.map((p) => String(p || '').trim()).filter(Boolean)
            : [];

          return {
            id,
            name: String(item.name || '').trim(),
            icon,
            description: String(item.description || '').trim(),
            platforms,
            url: String(item.url || '').trim(),
            repo: item.repo ? String(item.repo).trim() : null,
            version: typeof item.version === 'string' && item.version ? item.version : null,
            enabled: item.enabled !== false,
          };
        });

  return {
    enabled: raw.enabled !== false,
    items,
  };
}
