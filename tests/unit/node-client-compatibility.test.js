import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import {
    getNodeClientCompatibility,
    parseNodeFeatures,
} from '@/utils/node-client-compatibility.js';
import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';
import ManualNodeCard from '@/components/nodes/ManualNodeCard.vue';
import { createI18n } from '@/i18n/index.js';

function toSupportMap(url) {
    const result = getNodeClientCompatibility(url);
    return Object.fromEntries(result.clients.map((c) => [c.id, c.supported]));
}

describe('node client compatibility analyzer', () => {
    it('identifies VLESS + xhttp + Reality as supported by Xray/Mihomo/Loon and unsupported by Sing-box/Surge/QuanX', () => {
        const url =
            'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=xhttp&security=reality&pbk=abc123&sni=example.com#XHTTP-Node';
        const features = parseNodeFeatures(url);
        expect(features.protocol).toBe('vless');
        expect(features.transport).toBe('xhttp');
        expect(features.security).toBe('reality');

        expect(toSupportMap(url)).toEqual({
            xray: true,
            singbox: false,
            mihomo: true,
            surge: false,
            loon: true,
            quanx: false,
        });

        const compat = getNodeClientCompatibility(url);
        const singbox = compat.clients.find((c) => c.id === 'singbox');
        expect(singbox?.reasonKey).toBe('clientCompat.reasons.unsupportedTransport');
        expect(singbox?.reasonParams).toEqual({ transport: 'xhttp' });
    });

    it('identifies VLESS + mKCP as Xray-only', () => {
        const url =
            'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=kcp&security=none#KCP';
        expect(toSupportMap(url)).toEqual({
            xray: true,
            singbox: false,
            mihomo: false,
            surge: false,
            loon: false,
            quanx: false,
        });
    });

    it('identifies VLESS Encryption as unsupported by Sing-box, Surge, Loon, QuanX', () => {
        const url =
            'vless://11111111-1111-1111-1111-111111111111@example.com:443?encryption=mlkem768x25519plus.native.0rtt.test&type=tcp&security=none#VLESS-Enc';
        expect(toSupportMap(url)).toEqual({
            xray: true,
            singbox: false,
            mihomo: true,
            surge: false,
            loon: false,
            quanx: false,
        });
    });

    it('identifies VLESS + TCP + Reality as unsupported only by Surge', () => {
        const url =
            'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=tcp&security=reality&pbk=abc&flow=xtls-rprx-vision#Reality';
        expect(toSupportMap(url)).toEqual({
            xray: true,
            singbox: true,
            mihomo: true,
            surge: false,
            loon: true,
            quanx: true,
        });
    });

    it('identifies Hysteria2 as supported by Sing-box/Mihomo/Surge/Loon and unsupported by Xray/QuanX', () => {
        const url = 'hy2://password@example.com:443?sni=example.com#HY2';
        expect(toSupportMap(url)).toEqual({
            xray: false,
            singbox: true,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: false,
        });
    });

    it('identifies Snell as supported by Mihomo/Surge/Loon and unsupported by Xray/Sing-box/QuanX', () => {
        const url = 'snell://psk@example.com:443?version=4#Snell';
        expect(toSupportMap(url)).toEqual({
            xray: false,
            singbox: false,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: false,
        });
    });

    it('identifies AnyTLS and NaiveProxy accurately', () => {
        expect(toSupportMap('anytls://pass@example.com:443?sni=example.com#AnyTLS')).toEqual({
            xray: false,
            singbox: true,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: true,
        });

        expect(toSupportMap('naive+https://user:pass@example.com:443#Naive')).toEqual({
            xray: false,
            singbox: true,
            mihomo: false,
            surge: false,
            loon: false,
            quanx: false,
        });
    });

    it('distinguishes Shadowsocks AEAD vs SS-2022 for QuanX', () => {
        const aeadUser = btoa('aes-128-gcm:password');
        const ss2022User = btoa('2022-blake3-aes-128-gcm:secretkey');

        expect(toSupportMap(`ss://${aeadUser}@example.com:8388#SS`)).toEqual({
            xray: true,
            singbox: true,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: true,
        });

        expect(toSupportMap(`ss://${ss2022User}@example.com:8388#SS2022`)).toEqual({
            xray: true,
            singbox: true,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: false,
        });
    });

    it('parses VMess base64 JSON transport accurately', () => {
        const wsConfig = btoa(JSON.stringify({ v: '2', add: 'example.com', port: '443', net: 'ws', tls: 'tls' }));
        const grpcConfig = btoa(JSON.stringify({ v: '2', add: 'example.com', port: '443', net: 'grpc', tls: 'tls' }));

        expect(toSupportMap(`vmess://${wsConfig}`)).toEqual({
            xray: true,
            singbox: true,
            mihomo: true,
            surge: true,
            loon: true,
            quanx: true,
        });

        expect(toSupportMap(`vmess://${grpcConfig}`)).toEqual({
            xray: true,
            singbox: true,
            mihomo: true,
            surge: false,
            loon: false,
            quanx: false,
        });
    });

    it('returns empty clients for unknown or empty URLs', () => {
        expect(getNodeClientCompatibility('').clients).toEqual([]);
        expect(getNodeClientCompatibility('invalid-link').clients).toEqual([]);
    });
});

describe('NodeClientBadges & ManualNodeCard rendering', () => {
    it('renders supported and unsupported badges with clear visual states and tooltips', () => {
        const url =
            'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=xhttp&security=reality&pbk=abc#XHTTP';
        const wrapper = mount(NodeClientBadges, {
            props: { url },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
            },
        });

        const xrayBadge = wrapper.get('[data-testid="client-badge-xray"]');
        const singboxBadge = wrapper.get('[data-testid="client-badge-singbox"]');

        expect(xrayBadge.attributes('data-supported')).toBe('true');
        expect(xrayBadge.attributes('title')).toBe('Xray：支持');
        expect(xrayBadge.classes()).toContain('text-emerald-700');

        expect(singboxBadge.attributes('data-supported')).toBe('false');
        expect(singboxBadge.attributes('title')).toContain('Sing-box：不支持');
        expect(singboxBadge.attributes('title')).toContain('xhttp');
        expect(singboxBadge.classes()).toContain('line-through');
    });

    it('displays client compatibility badges on ManualNodeCard', () => {
        const wrapper = mount(ManualNodeCard, {
            props: {
                node: {
                    id: 'n1',
                    name: 'HK XHTTP Reality',
                    url: 'vless://11111111-1111-1111-1111-111111111111@example.com:443?type=xhttp&security=reality&pbk=abc#HK',
                    enabled: true,
                },
            },
            global: {
                plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
            },
        });

        const compatRow = wrapper.find('[data-testid="node-client-compatibility"]');
        expect(compatRow.exists()).toBe(true);
        expect(wrapper.get('[data-testid="client-badge-xray"]').attributes('data-supported')).toBe('true');
        expect(wrapper.get('[data-testid="client-badge-singbox"]').attributes('data-supported')).toBe('false');
    });
});
