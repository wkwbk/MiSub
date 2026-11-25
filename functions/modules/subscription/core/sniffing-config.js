/**
 * 客户端域名嗅探（sniffer）默认配置。
 *
 * 背景：Telegram、Google 系等应用常硬编码 IP 直连，连接不含域名，
 * 纯域名分流规则与 GEOIP 前的域名规则都无法命中，只能落进兜底代理。
 * 开启嗅探后从 TLS SNI / HTTP Host / QUIC 握手还原域名，此类流量即可
 * 命中域名分流规则；sing-box 对应 route 首条 { action: 'sniff' } 规则。
 *
 * 注意（mihomo issue #374）：override-destination 对个别强绑定 IP 的服务
 * 有误判风险，通过 skip-domain 排除米家局域网发现与 APNs 推送。
 */

const DEFAULT_SNIFFER_CONFIG = Object.freeze({
  enable: true,
  'force-dns-mapping': true,
  'parse-pure-ip': true,
  'override-destination': true,
  sniff: {
    TLS: { ports: [443, 8443] },
    HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
    QUIC: { ports: [443] },
  },
  'skip-domain': ['Mijia Cloud', '+.push.apple.com'],
});

export function cloneSnifferConfig() {
  return {
    enable: DEFAULT_SNIFFER_CONFIG.enable,
    'force-dns-mapping': DEFAULT_SNIFFER_CONFIG['force-dns-mapping'],
    'parse-pure-ip': DEFAULT_SNIFFER_CONFIG['parse-pure-ip'],
    'override-destination': DEFAULT_SNIFFER_CONFIG['override-destination'],
    sniff: {
      TLS: { ports: [...DEFAULT_SNIFFER_CONFIG.sniff.TLS.ports] },
      HTTP: {
        ports: [...DEFAULT_SNIFFER_CONFIG.sniff.HTTP.ports],
        'override-destination': DEFAULT_SNIFFER_CONFIG.sniff.HTTP['override-destination'],
      },
      QUIC: { ports: [...DEFAULT_SNIFFER_CONFIG.sniff.QUIC.ports] },
    },
    'skip-domain': [...DEFAULT_SNIFFER_CONFIG['skip-domain']],
  };
}

export const SINGBOX_SNIFF_RULE = Object.freeze({ action: 'sniff' });
