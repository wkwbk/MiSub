/**
 * Default public navigation links (Speed test, IP/Network tools, Server providers).
 */

export const PUBLIC_LINK_CATEGORIES = [
    { value: 'speedtest', labelKey: 'publicLinks.categories.speedtest' },
    { value: 'ip', labelKey: 'publicLinks.categories.ip' },
    { value: 'provider', labelKey: 'publicLinks.categories.provider' },
    { value: 'other', labelKey: 'publicLinks.categories.other' },
];

export const DEFAULT_PUBLIC_LINKS = [
    // 测速网站 (Speed Test)
    {
        id: 'fast-com',
        name: 'FAST',
        category: 'speedtest',
        description: 'Netflix 提供的极简在线宽带测速服务，快速检测当前网络下载与上传带宽。',
        url: 'https://fast.com/',
        icon: '/icons/links/fast-com.png',
        enabled: true,
    },
    {
        id: 'speedtest-cn',
        name: '测速网',
        category: 'speedtest',
        description: '专业网络测速站点，提供宽带测速、Wi-Fi 测速、5G 测速与网络质量评估。',
        url: 'https://www.speedtest.cn/',
        icon: '/icons/links/speedtest-cn.png',
        enabled: true,
    },
    {
        id: 'cloudflare-speed',
        name: 'CF测速',
        category: 'speedtest',
        description: 'Cloudflare 官方网络测速面板，提供详尽的下载/上传速率、延迟与抖动分析。',
        url: 'https://speed.cloudflare.com/',
        icon: '/icons/links/cloudflare-speed.png',
        enabled: true,
    },
    {
        id: 'speedtest-net',
        name: 'Speedtest',
        category: 'speedtest',
        description: 'Ookla 全球知名网络带宽、延迟与抖动测试工具，支持全球海量测速节点。',
        url: 'https://www.speedtest.net/',
        icon: '/icons/links/speedtest-net.png',
        enabled: true,
    },
    {
        id: 'google-fiber-speedtest',
        name: 'Google Fiber',
        category: 'speedtest',
        description: 'Google Fiber 官方光纤宽带测速工具，界面清爽，适合测试国际带宽吞吐。',
        url: 'https://gfiber.com/speedtest/',
        icon: '/icons/links/google-fiber-speedtest.png',
        enabled: true,
    },
    {
        id: 'ustc-speedtest',
        name: '中科大测速网站',
        category: 'speedtest',
        description: '中国科学技术大学网络测速站点，支持 IPv4 / IPv6 国内与教育网带宽测速。',
        url: 'https://test.ustc.edu.cn/',
        icon: '/icons/links/ustc-speedtest.png',
        enabled: true,
    },
    {
        id: 'openspeedtest-com',
        name: 'OpenSpeedTest',
        category: 'speedtest',
        description: '基于纯 HTML5 的跨平台开源网络测速工具，无需额外插件即可精确测量带宽。',
        url: 'https://openspeedtest.com/',
        icon: '/icons/links/openspeedtest-com.png',
        enabled: true,
    },

    // IP 与网络测试 (IP & Network Test)
    {
        id: 'ip-sb',
        name: 'IP.SB',
        category: 'ip',
        description: '简洁快速的公网 IPv4 / IPv6 地址、ASN 自治系统号与地理位置查询工具。',
        url: 'https://ip.sb/',
        icon: '/icons/links/ip-sb.png',
        enabled: true,
    },
    {
        id: 'ping0-cc',
        name: 'PING0',
        category: 'ip',
        description: '专业的 IP 纯净度、风控风险值、原生/广播属性与家宽/机房类型检测工具。',
        url: 'https://ping0.cc/',
        icon: '/icons/links/ping0-cc.png',
        enabled: true,
    },
    {
        id: 'itdog-cn',
        name: 'ITDOG',
        category: 'ip',
        description: '全国及海外多节点 Ping、Tcping、网站测速、路由追踪与 DNS 解析检测平台。',
        url: 'https://www.itdog.cn/',
        icon: '/icons/links/itdog-cn.png',
        enabled: true,
    },
    {
        id: 'sukka-ip',
        name: 'Sukka',
        category: 'ip',
        description: '多源国内外分流出口 IP 查询面板，直观检验代理规则分流与各大站点连通性。',
        url: 'https://ip.skk.moe/',
        icon: '/icons/links/sukka-ip.png',
        enabled: true,
    },
    {
        id: 'ipcheck-ing',
        name: 'IPCheck.ing',
        category: 'ip',
        description: '开源全能的 IP 信息、WebRTC 泄漏、DNS 泄漏与全球站点连通性检测工具。',
        url: 'https://ipcheck.ing/#/',
        icon: '/icons/links/ipcheck-ing.png',
        enabled: true,
    },
    {
        id: 'net-coffee',
        name: 'Net.Coffee',
        category: 'ip',
        description: '多维度 IP 归属地、ASN 路由信息与网络环境检测工具。',
        url: 'https://ip.net.coffee/',
        icon: '/icons/links/net-coffee.svg',
        enabled: true,
    },
    {
        id: 'who-1ms-dog',
        name: '你是谁',
        category: 'ip',
        description: '全方位检测当前 IP 伪装度、DNS 泄漏、WebRTC 状态与浏览器指纹特征。',
        url: 'https://who.1ms.dog/zh-cn/',
        icon: '/icons/links/who-1ms-dog.png',
        enabled: true,
    },

    // 服务器厂商 (Server Providers)
    {
        id: 'dmit-io',
        name: 'DMIT',
        category: 'provider',
        description: '提供香港、东京、洛杉矶等机房高品质 CN2 GIA 与大带宽线路云服务器。',
        url: 'https://www.dmit.io/',
        icon: '/icons/links/dmit-io.png',
        enabled: true,
    },
    {
        id: 'bandwagonhost',
        name: 'Bandwagon',
        category: 'provider',
        description: '搬瓦工 VPS，老牌稳定云服务器厂商，提供多机房切换与优质国际精品线路。',
        url: 'https://bandwagonhost.com/',
        icon: '/icons/links/bandwagonhost.png',
        enabled: true,
    },
    {
        id: 'racknerd-com',
        name: 'RackNerd',
        category: 'provider',
        description: '高性价比美国多机房 KVM VPS、独立服务器与托管服务提供商。',
        url: 'https://www.racknerd.com/',
        icon: '/icons/links/racknerd-com.png',
        enabled: true,
    },
    {
        id: 'v-ps',
        name: 'V.PS',
        category: 'provider',
        description: 'xTom 旗下云服务器品牌，覆盖东京、大阪、香港、法兰克福等多地区优化线路。',
        url: 'https://v.ps/',
        icon: '/icons/links/v-ps.png',
        enabled: true,
    },
    {
        id: 'evoxt-com',
        name: 'Evoxt',
        category: 'provider',
        description: '提供高频 CPU 与多机房优质线路的云服务器提供商，支持按月灵活部署。',
        url: 'https://evoxt.com/',
        icon: '/icons/links/evoxt-com.png',
        enabled: true,
    },
    {
        id: 'cloudcone-com',
        name: 'CloudCone',
        category: 'provider',
        description: '提供美国洛杉矶机房按小时计费云服务器、VPS 与独立服务器。',
        url: 'https://cloudcone.com/',
        icon: '/icons/links/cloudcone-com.png',
        enabled: true,
    },
    {
        id: 'vultr-com',
        name: 'Vultr',
        category: 'provider',
        description: '全球数十个数据中心按小时计费云服务器提供商，支持快速部署与弹性扩展。',
        url: 'https://my.vultr.com/',
        icon: '/icons/links/vultr-com.png',
        enabled: true,
    },
    {
        id: 'aws-cloud',
        name: 'AWS',
        category: 'provider',
        description: 'Amazon Web Services 亚马逊云科技，提供 EC2 与 Lightsail 全球云计算服务。',
        url: 'https://aws.amazon.com/',
        icon: '/icons/links/aws-cloud.png',
        enabled: true,
    },
    {
        id: 'google-cloud',
        name: '谷歌云',
        category: 'provider',
        description: 'Google Cloud Platform (GCP) 全球云计算平台，提供高品质全球骨干网实例。',
        url: 'https://console.cloud.google.com/',
        icon: '/icons/links/google-cloud.png',
        enabled: true,
    },
    {
        id: 'oracle-cloud',
        name: '甲骨文云',
        category: 'provider',
        description: 'Oracle Cloud Infrastructure (OCI)，提供全球多区域云主机与免费套餐实例。',
        url: 'https://cloud.oracle.com/',
        icon: '/icons/links/oracle-cloud.png',
        enabled: true,
    },
    {
        id: 'azure-cloud',
        name: '微软云',
        category: 'provider',
        description: 'Microsoft Azure 全球云计算与虚拟机服务平台，覆盖亚太、欧美等丰富区域。',
        url: 'https://portal.azure.com/',
        icon: '/icons/links/azure-cloud.png',
        enabled: true,
    },
];

export const DEFAULT_PUBLIC_LINKS_CONFIG = {
    enabled: true,
    items: DEFAULT_PUBLIC_LINKS,
};

const DEFAULT_ICON_BY_ID = DEFAULT_PUBLIC_LINKS.reduce((map, item) => {
    map[item.id] = item.icon;
    return map;
}, {});

const LEGACY_V1_DEFAULT_IDS = new Set([
    'fast-com',
    'speedtest-net',
    'cloudflare-speed',
    'ustc-speedtest',
    'ip-sb',
    'ping0-cc',
    'itdog-cn',
    'sukka-ip',
    'ipcheck-ing',
    'pixelscan-net',
    'dmit-io',
    'bandwagonhost',
    'racknerd-com',
    'v-ps',
    'vultr-com',
    'tencent-cloud',
]);

function isUnmodifiedLegacyV1Defaults(items) {
    if (!Array.isArray(items) || items.length !== LEGACY_V1_DEFAULT_IDS.size) return false;
    return items.every((item) => item && LEGACY_V1_DEFAULT_IDS.has(item.id));
}

function isLegacyLowResBookmarkIcon(icon) {
    if (typeof icon !== 'string') return false;
    // Chrome bookmark 16x16 PNG data URL prefix, legacy emoji, or replaced SVG paths
    return (
        icon.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQ') ||
        icon === '🖥️' ||
        icon === '/icons/links/net-coffee.png' ||
        icon === '/icons/links/who-1ms-dog.svg' ||
        icon === '/icons/links/dmit-io.svg' ||
        icon === '/icons/links/ping0-cc.svg' ||
        icon === '/icons/links/oracle-cloud.svg' ||
        icon === '/icons/links/google-fiber-speedtest.svg'
    );
}

/**
 * Resolve an HD icon URL for a link item.
 * If no icon is provided, falls back to Google 128px favicon service by domain.
 */
export function resolvePublicLinkIcon(link) {
    const rawIcon = String(link?.icon || '').trim();
    if (rawIcon) return rawIcon;
    try {
        const hostname = new URL(link?.url || '').hostname;
        if (hostname) {
            return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
        }
    } catch {
        // Ignore invalid URL
    }
    return '';
}

export function normalizePublicLinksConfig(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const useDefaults = !Array.isArray(raw.items) || isUnmodifiedLegacyV1Defaults(raw.items);

    const items = useDefaults
        ? DEFAULT_PUBLIC_LINKS.map((item) => ({ ...item }))
        : raw.items
              .filter((item) => item && typeof item === 'object' && String(item.name || '').trim())
              .map((item, index) => {
                  const id = String(item.id || `link-${index + 1}`).trim();
                  const rawIcon = String(item.icon || '').trim();
                  const defaultHdIcon = DEFAULT_ICON_BY_ID[id];
                  const upgradedIcon =
                      defaultHdIcon && (!rawIcon || isLegacyLowResBookmarkIcon(rawIcon))
                          ? defaultHdIcon
                          : rawIcon;

                  return {
                      id,
                      name: String(item.name || '').trim(),
                      category: String(item.category || 'other').trim() || 'other',
                      description: String(item.description || '').trim(),
                      url: String(item.url || '').trim(),
                      icon: upgradedIcon,
                      enabled: item.enabled !== false,
                  };
              });

    return {
        enabled: raw.enabled !== false,
        items,
    };
}
