/**
 * Default public proxy cores (Xray-core, sing-box, Mihomo, Hysteria 2, etc.).
 */

export const PUBLIC_CORE_CATEGORIES = [
    { value: 'multipurpose', labelKey: 'publicCores.categories.multipurpose' },
    { value: 'rule', labelKey: 'publicCores.categories.rule' },
    { value: 'transport', labelKey: 'publicCores.categories.transport' },
    { value: 'other', labelKey: 'publicCores.categories.other' },
];

export const DEFAULT_PUBLIC_CORES = [
    {
        id: 'xray-core',
        name: 'Xray-core',
        category: 'multipurpose',
        tags: ['VLESS', 'REALITY', 'XTLS Vision', 'VMess'],
        description:
            'XTLS 官方开源的超强网络代理内核，原生支持 VLESS、REALITY、XTLS Vision 与多种传输协议。',
        url: 'https://github.com/XTLS/Xray-core/releases',
        icon: '/icons/cores/xray-core.png',
        enabled: true,
    },
    {
        id: 'sing-box',
        name: 'sing-box',
        category: 'multipurpose',
        tags: ['通用平台', 'TUN', 'Hysteria2', 'VLESS'],
        description:
            '新一代通用代理内核平台，性能卓越、架构现代，支持全主流协议与透明代理/TUN 模式。',
        url: 'https://github.com/SagerNet/sing-box/releases',
        icon: '/icons/cores/sing-box.svg',
        enabled: true,
    },
    {
        id: 'mihomo',
        name: 'Mihomo (Clash.Meta)',
        category: 'rule',
        tags: ['Clash.Meta', '规则分流', 'TUN', 'GeoSite'],
        description:
            '开源活跃的 Clash.Meta 核心（现名 Mihomo），提供强大的规则分流引擎与丰富的现代协议支持。',
        url: 'https://github.com/MetaCubeX/mihomo/releases',
        icon: '/icons/cores/mihomo.jpg',
        enabled: true,
    },
    {
        id: 'hysteria-2',
        name: 'Hysteria 2',
        category: 'transport',
        tags: ['QUIC', 'UDP 加速', 'Brutal 拥塞控制'],
        description:
            '基于 QUIC 协议的高性能抗丢包代理内核，在弱网与高丢包环境下仍能保持极佳吞吐表现。',
        url: 'https://github.com/apernet/hysteria/releases',
        icon: '/icons/cores/hysteria.png',
        enabled: true,
    },
    {
        id: 'v2ray-core',
        name: 'V2Ray-core (v2fly)',
        category: 'multipurpose',
        tags: ['VMess', 'VLESS', 'Trojan', 'Shadowsocks'],
        description:
            'V2Fly 社区维护的经典模块化代理内核，生态成熟稳定，支持多种入站与出站传输协议。',
        url: 'https://github.com/v2fly/v2ray-core/releases',
        icon: '/icons/cores/v2ray-core.png',
        enabled: true,
    },
    {
        id: 'naiveproxy',
        name: 'NaiveProxy',
        category: 'transport',
        tags: ['Chrome 网络栈', 'HTTP/2', 'QUIC', '抗审查'],
        description:
            '基于 Chromium 网络栈构建的高隐蔽性代理内核，具备与真实浏览器一致的 TLS 指纹与流量特征。',
        url: 'https://github.com/klzgrad/naiveproxy/releases',
        icon: '/icons/cores/naiveproxy.png',
        enabled: true,
    },
    {
        id: 'tuic',
        name: 'TUIC',
        category: 'transport',
        tags: ['QUIC', '0-RTT', 'UDP 中继'],
        description:
            '基于 QUIC 的轻量级低延迟代理内核，支持 0-RTT 握手与原生 UDP 无状态转发。',
        url: 'https://github.com/EAimTY/tuic/releases',
        icon: '/icons/cores/tuic.png',
        enabled: true,
    },
    {
        id: 'shadowtls',
        name: 'ShadowTLS',
        category: 'transport',
        tags: ['TLS 握手伪装', 'Shadowsocks', '无特征'],
        description:
            '通过借用真实可信域名完成 TLS 握手的轻量级传输包装内核，有效提升基础代理协议的隐蔽性。',
        url: 'https://github.com/ihciah/shadow-tls/releases',
        icon: '/icons/cores/shadowtls.jpg',
        enabled: true,
    },
];

export const DEFAULT_PUBLIC_CORES_CONFIG = {
    enabled: true,
    items: DEFAULT_PUBLIC_CORES,
};

/**
 * Normalize tags input (array or comma-separated string) into a clean string array.
 */
export function normalizeCoreTags(tags) {
    if (Array.isArray(tags)) {
        return tags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }
    if (typeof tags === 'string') {
        return tags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
}

/**
 * Resolve an icon URL for a core item.
 * If no icon is provided, falls back to Google 128px favicon service by domain.
 */
export function resolvePublicCoreIcon(core) {
    const rawIcon = String(core?.icon || '').trim();
    if (rawIcon) return rawIcon;
    try {
        const hostname = new URL(core?.url || '').hostname;
        if (hostname) {
            return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
        }
    } catch {
        // Ignore invalid URL
    }
    return '';
}

export function normalizePublicCoresConfig(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const useDefaults = !Array.isArray(raw.items);

    const items = useDefaults
        ? DEFAULT_PUBLIC_CORES.map((item) => ({ ...item, tags: [...(item.tags || [])] }))
        : raw.items
              .filter((item) => item && typeof item === 'object' && String(item.name || '').trim())
              .map((item, index) => {
                  const id = String(item.id || `core-${index + 1}`).trim();
                  const icon = String(item.icon || '').trim();

                  return {
                      id,
                      name: String(item.name || '').trim(),
                      category: String(item.category || 'other').trim() || 'other',
                      tags: normalizeCoreTags(item.tags),
                      description: String(item.description || '').trim(),
                      url: String(item.url || '').trim(),
                      icon,
                      enabled: item.enabled !== false,
                  };
              });

    return {
        enabled: raw.enabled !== false,
        items,
    };
}
