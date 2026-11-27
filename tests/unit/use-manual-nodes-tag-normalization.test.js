import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useDataStore } from '@/stores/useDataStore.js';

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/utils/ping.js', async (importOriginal) => ({
  ...(await importOriginal()),
  pingNode: vi.fn(),
}));

vi.mock('@/lib/http.js', async () => {
  const actual = await vi.importActual('@/lib/http.js');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(async (url, body) => {
        if (url === '/api/nodes') {
          return { success: true, data: { ...body, version: 1 } };
        }
        if (url === '/api/nodes/batch') {
          return { success: true, data: (body.items || []).map((item) => ({ ...item, version: 1 })) };
        }
        if (url === '/api/nodes/batch-tags') {
          return {
            success: true,
            data: (body.updates || []).map((u) => ({
              id: u.id,
              name: u.id,
              url: `ss://${u.id}`,
              enabled: true,
              tags: u.tags,
              version: 2,
            })),
          };
        }
        return { success: true, data: body };
      }),
      patch: vi.fn(async (url, body) => ({
        success: true,
        data: { id: url.split('/').pop(), ...body, version: 2 },
      })),
      del: vi.fn(async () => ({ success: true, data: {} })),
    },
  };
});

describe('useManualNodes tag normalization', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('保存单个手动节点时规范化并去重标签数组', async () => {
    const dataStore = useDataStore();
    const { addNode, updateNode } = useManualNodes();

    await addNode({
      id: 'n1',
      name: 'node1',
      url: 'ss://example',
      enabled: true,
      tags: [' S5 ', ' 家宽 ', 'S5'],
    });
    expect(dataStore.subscriptions[0].tags).toEqual(['S5', '家宽']);
    expect(dataStore.subscriptions[0]).not.toHaveProperty('group');

    await updateNode({ ...dataStore.subscriptions[0], tags: [' FreezeHost '] });
    expect(dataStore.subscriptions[0].tags).toEqual(['FreezeHost']);
    expect(dataStore.subscriptions[0]).not.toHaveProperty('group');
  });

  it('批量导入和批量打标时规范化标签', async () => {
    const dataStore = useDataStore();
    const { addNodesFromBulk, batchUpdateTags } = useManualNodes();

    await addNodesFromBulk(
      [
        { id: 'n1', name: 'node1', url: 'ss://example1', enabled: true, tags: ['家宽'] },
        { id: 'n2', name: 'node2', url: 'ss://example2', enabled: true },
      ],
      [' S5 '],
    );

    expect(dataStore.subscriptions.map((node) => node.tags)).toEqual([['S5', '家宽'], ['S5']]);

    await batchUpdateTags(['n1', 'n2'], { mode: 'replace', tags: [' FreezeHost ', '解锁'] });
    await nextTick();

    expect(dataStore.subscriptions.map((node) => node.tags)).toEqual([
      ['FreezeHost', '解锁'],
      ['FreezeHost', '解锁'],
    ]);
  });
});
