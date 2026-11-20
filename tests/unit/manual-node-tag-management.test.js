import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes } from '@/composables/useManualNodes.js';

describe('手动节点标签管理与批量操作', () => {
  let dataStore;
  let markDirty;
  let manualNodes;

  beforeEach(() => {
    setActivePinia(createPinia());
    dataStore = useDataStore();
    markDirty = () => {};

    dataStore.subscriptions = [
      { id: 'n1', url: 'ss://test1', name: 'Node1', tags: ['USA', '家宽'], enabled: true },
      { id: 'n2', url: 'ss://test2', name: 'Node2', tags: ['USA'], enabled: true },
      { id: 'n3', url: 'ss://test3', name: 'Node3', tags: ['Japan'], enabled: true },
      { id: 'n4', url: 'ss://test4', name: 'Node4', tags: ['HK'], enabled: true },
    ];

    manualNodes = useManualNodes(markDirty);
  });

  it('标签顺序默认按首次出现顺序推导', () => {
    expect(manualNodes.manualNodeTags.value).toEqual(['USA', '家宽', 'Japan', 'HK']);
  });

  it('可以调整标签顺序且新标签自动追加到末尾', () => {
    manualNodes.reorderTags(['HK', 'Japan', 'USA', '家宽']);
    expect(manualNodes.manualNodeTags.value).toEqual(['HK', 'Japan', 'USA', '家宽']);

    dataStore.addSubscription({
      id: 'n5',
      url: 'ss://test5',
      name: 'Node5',
      tags: ['Singapore'],
      enabled: true,
    });
    expect(manualNodes.manualNodeTags.value).toEqual(['HK', 'Japan', 'USA', '家宽', 'Singapore']);
  });

  it('删除标签时仅移除该标签并保留节点的其他标签', () => {
    manualNodes.reorderTags(['HK', 'USA', '家宽', 'Japan']);
    manualNodes.deleteTag('USA');

    expect(manualNodes.manualNodeTags.value).toEqual(['HK', '家宽', 'Japan']);
    expect(dataStore.subscriptions[0].tags).toEqual(['家宽']);
    expect(dataStore.subscriptions[1].tags).toEqual([]);
  });

  it('重命名标签时自动合并去重', () => {
    manualNodes.renameTag('USA', '家宽');
    expect(dataStore.subscriptions[0].tags).toEqual(['家宽']);
    expect(dataStore.subscriptions[1].tags).toEqual(['家宽']);
  });

  it('支持批量追加、覆盖、移除、清空标签', () => {
    manualNodes.batchUpdateTags(['n2', 'n3'], { mode: 'append', tags: ['解锁'] });
    expect(dataStore.subscriptions[1].tags).toEqual(['USA', '解锁']);
    expect(dataStore.subscriptions[2].tags).toEqual(['Japan', '解锁']);

    manualNodes.batchUpdateTags(['n2'], { mode: 'replace', tags: ['主力', '低倍率'] });
    expect(dataStore.subscriptions[1].tags).toEqual(['主力', '低倍率']);

    manualNodes.batchUpdateTags(['n2'], { mode: 'remove', tags: ['主力'] });
    expect(dataStore.subscriptions[1].tags).toEqual(['低倍率']);

    manualNodes.batchUpdateTags(['n2'], { mode: 'clear', tags: [] });
    expect(dataStore.subscriptions[1].tags).toEqual([]);
  });

  it('对子集排序时只替换可见节点顺序并保留隐藏节点和订阅', () => {
    dataStore.subscriptions = [
      { id: 'a1', url: 'ss://a1', name: 'A1', tags: ['A'], enabled: true },
      { id: 'b1', url: 'ss://b1', name: 'B1', tags: ['B'], enabled: true },
      { id: 'a2', url: 'ss://a2', name: 'A2', tags: ['A'], enabled: true },
      {
        id: 's1',
        url: 'https://subscription.example/sub',
        name: 'Remote sub',
        enabled: true,
      },
    ];

    manualNodes.reorderManualNodes([
      { id: 'a2', url: 'ss://a2', name: 'A2', tags: ['A'], enabled: true },
      { id: 'a1', url: 'ss://a1', name: 'A1', tags: ['A'], enabled: true },
    ]);

    expect(dataStore.subscriptions.map((node) => node.id)).toEqual(['a2', 'b1', 'a1', 's1']);
  });
});
