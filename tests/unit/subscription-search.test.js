import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';

describe('subscription list search', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('filters airport subscriptions by name, note, and URL', async () => {
    const dataStore = useDataStore();
    dataStore.subscriptions = [
      { id: 's1', name: '香港主力', remark: '低延迟', url: 'https://hk.example/sub' },
      { id: 's2', name: '日本备用', note: '流媒体', url: 'https://jp.example/sub' },
      { id: 'n1', name: '手动节点', url: 'ss://example' },
    ];

    const { filteredSubscriptions, searchQuery } = useSubscriptions(vi.fn());

    searchQuery.value = '流媒体';
    await nextTick();

    expect(filteredSubscriptions.value.map((item) => item.id)).toEqual(['s2']);

    searchQuery.value = 'hk.example';
    expect(filteredSubscriptions.value.map((item) => item.id)).toEqual(['s1']);
  });

  it('preserves all filtered airport subscriptions without page slicing', () => {
    const dataStore = useDataStore();
    dataStore.subscriptions = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `other-${i}`,
        name: `Other ${i}`,
        url: `https://other${i}.net/sub`,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `airport-${i}`,
        name: `Airport ${i}`,
        url: `https://api.airport.example.com/sub/${i}`,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `tail-${i}`,
        name: `Tail ${i}`,
        url: `https://tail${i}.org/sub`,
      })),
    ];

    const { filteredSubscriptions } = useSubscriptions(vi.fn());
    expect(filteredSubscriptions.value.map((item) => item.id)).toHaveLength(12);
  });

  it('filters my subscriptions by name, description, and custom ID', () => {
    const dataStore = useDataStore();
    dataStore.profiles = [
      { id: 'p1', name: '家庭订阅', description: '电视和手机', customId: 'home' },
      { id: 'p2', name: '游戏订阅', description: '低延迟线路', customId: 'gaming' },
    ];

    const { filteredProfiles, searchQuery } = useProfiles(vi.fn());

    searchQuery.value = 'gaming';
    expect(filteredProfiles.value.map((item) => item.id)).toEqual(['p2']);

    searchQuery.value = '电视';
    expect(filteredProfiles.value.map((item) => item.id)).toEqual(['p1']);
  });
});
