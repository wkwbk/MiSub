import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useDataStore } from '@/stores/useDataStore.js';

vi.mock('@/stores/toast.js', () => ({
    useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/utils/ping.js', () => ({
    pingNode: vi.fn(),
}));

describe('useManualNodes tag normalization & first-tag prefix sync', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
    });

    it('保存单个手动节点时规范化标签并同步首个标签至 group', async () => {
        const markDirty = vi.fn();
        const dataStore = useDataStore();
        const { addNode, updateNode } = useManualNodes(markDirty);

        addNode({
            id: 'n1',
            name: 'node1',
            url: 'ss://example',
            enabled: true,
            tags: [' S5 ', ' 家宽 ', 'S5'],
        });
        expect(dataStore.subscriptions[0].tags).toEqual(['S5', '家宽']);
        expect(dataStore.subscriptions[0].group).toBe('S5');

        updateNode({ ...dataStore.subscriptions[0], tags: [' FreezeHost '] });
        expect(dataStore.subscriptions[0].tags).toEqual(['FreezeHost']);
        expect(dataStore.subscriptions[0].group).toBe('FreezeHost');
    });

    it('批量导入和批量打标时规范化标签', async () => {
        const markDirty = vi.fn();
        const dataStore = useDataStore();
        const { addNodesFromBulk, batchUpdateTags } = useManualNodes(markDirty);

        addNodesFromBulk(
            [
                { id: 'n1', name: 'node1', url: 'ss://example1', enabled: true, tags: ['家宽'] },
                { id: 'n2', name: 'node2', url: 'ss://example2', enabled: true },
            ],
            [' S5 ']
        );

        expect(dataStore.subscriptions.map((node) => node.tags)).toEqual([
            ['S5', '家宽'],
            ['S5'],
        ]);

        batchUpdateTags(['n1', 'n2'], { mode: 'replace', tags: [' FreezeHost ', '解锁'] });
        await nextTick();

        expect(dataStore.subscriptions.map((node) => node.tags)).toEqual([
            ['FreezeHost', '解锁'],
            ['FreezeHost', '解锁'],
        ]);
        expect(dataStore.subscriptions.map((node) => node.group)).toEqual([
            'FreezeHost',
            'FreezeHost',
        ]);
    });
});
