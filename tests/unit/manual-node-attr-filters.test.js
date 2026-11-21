import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  collectNodeAttributeOptions,
  filterManualNodes,
  getManualNodeProtocol,
} from '@/composables/manual-nodes/filters.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useDataStore } from '@/stores/useDataStore.js';

vi.mock('@/stores/toast.js', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/utils/ping.js', () => ({
  pingNode: vi.fn(),
}));

describe('manual node dynamic attribute filtering', () => {
  const nodes = [
    { id: 'n1', name: 'EUSA|HY2', url: 'hysteria2://pass@1.1.1.1:443#EUSA', tags: ['Evoxt'], enabled: true },
    { id: 'n2', name: 'EUSA|CDN', url: 'vless://uuid@cf.libk.top:443?type=xhttp#CDN', tags: ['Evoxt'], enabled: true },
    { id: 'n3', name: 'AJPA|TU5', url: 'tuic://uuid:pass@54.65.1.1:443#AJPA', tags: ['AWS'], enabled: true },
    { id: 'n4', name: 'CN-Relay', url: 'trojan://pass@114.114.114.114:443#Relay', tags: ['AWS'], enabled: true },
  ];

  const inspectMap = {
    n1: { ip: '23.27.142.180', countryCode: 'US', country: '美国', flag: '🇺🇸', networkType: 'direct', isRelay: false },
    n2: { ip: '172.64.146.66', countryCode: 'CA', country: '加拿大', flag: '🇨🇦', networkType: 'cdn', isRelay: false },
    n3: { ip: '54.65.1.1', countryCode: 'JP', country: '日本', flag: '🇯🇵', networkType: 'direct', isRelay: false },
    n4: { ip: '114.114.114.114', countryCode: 'CN', country: '中国', flag: '🇨🇳', networkType: 'relay', isRelay: true },
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('collects protocol, network, and non-relay country options accurately', () => {
    expect(getManualNodeProtocol('hy2://pass@1.1.1.1:443')).toBe('hysteria2');
    expect(getManualNodeProtocol('vless://u@a.com:443')).toBe('vless');

    const opts = collectNodeAttributeOptions(nodes, inspectMap);
    expect(opts.protocols.map((p) => p.value).sort()).toEqual(['hysteria2', 'trojan', 'tuic', 'vless']);
    expect(opts.networks).toEqual([
      { value: 'direct', count: 2 },
      { value: 'cdn', count: 1 },
      { value: 'relay', count: 1 },
    ]);
    // Relay (CN) should not appear in country chips since it is represented under network=relay
    expect(opts.countries.map((c) => c.value).sort()).toEqual(['CA', 'JP', 'US']);
  });

  it('filters nodes by combinations of tags, protocol, country, network, and resolved IP search', () => {
    expect(
      filterManualNodes(nodes, '', ['Evoxt'], { protocol: 'hysteria2', country: 'US', network: 'direct' }, inspectMap).map(
        (n) => n.id,
      ),
    ).toEqual(['n1']);

    expect(filterManualNodes(nodes, '', [], { network: 'cdn' }, inspectMap).map((n) => n.id)).toEqual(['n2']);
    expect(filterManualNodes(nodes, '', [], { network: 'relay' }, inspectMap).map((n) => n.id)).toEqual(['n4']);
    expect(filterManualNodes(nodes, '', [], { country: 'JP' }, inspectMap).map((n) => n.id)).toEqual(['n3']);

    // Search by resolved IP or detected country name
    expect(filterManualNodes(nodes, '172.64.146.66', [], {}, inspectMap).map((n) => n.id)).toEqual(['n2']);
    expect(filterManualNodes(nodes, '日本', [], {}, inspectMap).map((n) => n.id)).toEqual(['n3']);
  });

  it('hydrates inspect cache from localStorage on init and toggles attribute filters without mutating node.tags', () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    localStorage.setItem(
      'misub_node_inspect_cache_v1',
      JSON.stringify({
        [nodes[0].url]: { data: inspectMap.n1, expiresAt },
        [nodes[1].url]: { data: inspectMap.n2, expiresAt },
      }),
    );

    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions(nodes);

    const {
      nodeInspectMap,
      attrFilters,
      paginatedManualNodes,
      toggleProtocolFilter,
      toggleCountryFilter,
      toggleNetworkFilter,
      clearAttrFilters,
    } = useManualNodes(() => {});

    expect(nodeInspectMap.value.n1?.ip).toBe('23.27.142.180');
    expect(nodeInspectMap.value.n2?.networkType).toBe('cdn');

    toggleNetworkFilter('cdn');
    expect(attrFilters.value.network).toBe('cdn');
    expect(paginatedManualNodes.value.map((n) => n.id)).toEqual(['n2']);

    // Toggling same filter again clears it
    toggleNetworkFilter('cdn');
    expect(attrFilters.value.network).toBe('');
    expect(paginatedManualNodes.value).toHaveLength(4);

    toggleProtocolFilter('hysteria2');
    toggleCountryFilter('US');
    expect(paginatedManualNodes.value.map((n) => n.id)).toEqual(['n1']);

    clearAttrFilters();
    expect(paginatedManualNodes.value).toHaveLength(4);
    // Original node tags remain completely untouched
    expect(dataStore.subscriptions[0].tags).toEqual(['Evoxt']);
  });
});
