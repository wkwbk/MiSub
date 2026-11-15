import { convertVmessToUrl } from '@/utils/protocols/converters/vmess.js';
import { convertShadowsocksToUrl, convertShadowsocksRToUrl } from '@/utils/protocols/converters/shadowsocks.js';
import { convertTrojanToUrl } from '@/utils/protocols/converters/trojan.js';
import { convertVlessToUrl } from '@/utils/protocols/converters/vless.js';
import { convertHysteriaToUrl } from '@/utils/protocols/converters/hysteria.js';
import { convertAnytlsToUrl } from '@/utils/protocols/converters/anytls.js';
import { convertTuicToUrl } from '@/utils/protocols/converters/tuic.js';
import { convertSocks5ToUrl } from '@/utils/protocols/converters/socks5.js';
import { convertHttpToUrl } from '@/utils/protocols/converters/http.js';
import { convertWireguardToUrl } from '@/utils/protocols/converters/wireguard.js';

/**
 * 转换Clash代理配置为标准URL
 */
export function convertClashProxyToUrl(proxy) {
    if (!proxy || typeof proxy !== 'object' || !proxy.type) {
        return null;
    }

    const type = proxy.type.toLowerCase();

    switch (type) {
        case 'vmess':
            return convertVmessToUrl(proxy);
        case 'ss':
        case 'shadowsocks':
            return convertShadowsocksToUrl(proxy);
        case 'ssr':
        case 'shadowsocksr':
            return convertShadowsocksRToUrl(proxy);
        case 'trojan':
            return convertTrojanToUrl(proxy);
        case 'vless':
            return convertVlessToUrl(proxy);
        case 'hysteria':
        case 'hysteria2':
            return convertHysteriaToUrl(proxy);
        case 'anytls':
            return convertAnytlsToUrl(proxy);
        case 'tuic':
            return convertTuicToUrl(proxy);
        case 'socks5':
            return convertSocks5ToUrl(proxy);
        case 'http':
            return convertHttpToUrl(proxy);
        case 'wireguard':
            return convertWireguardToUrl(proxy);
        default:
            console.warn(`不支持的代理类型: ${type}`);
            return null;
    }
}
