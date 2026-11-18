import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ManualNodePanel from '@/components/nodes/ManualNodePanel.vue';
import { createI18n } from '@/i18n/index.js';

const nodes = [
    { id: 'a1', name: 'A 1', url: 'ss://a1', tags: ['A', 'X'], enabled: true },
    { id: 'b1', name: 'B 1', url: 'ss://b1', tags: ['B'], enabled: true },
    { id: 'a2', name: 'A 2', url: 'ss://a2', tags: ['A'], enabled: true },
];

const NodeTableProbe = defineComponent({
    name: 'NodeTable',
    props: {
        draggableManualNodes: { type: Array, default: () => [] },
    },
    emits: ['update:draggableManualNodes', 'sort-end'],
    setup(props, { emit }) {
        return () =>
            h('div', { 'data-testid': 'node-table-probe' }, [
                h(
                    'span',
                    { 'data-testid': 'sortable-ids' },
                    props.draggableManualNodes.map((node) => node.id).join(',')
                ),
                h(
                    'button',
                    {
                        'data-testid': 'reverse-sortable',
                        onClick: () =>
                            emit(
                                'update:draggableManualNodes',
                                [...props.draggableManualNodes].reverse()
                            ),
                    },
                    'reverse'
                ),
            ]);
    },
});

describe('manual node sorting filters', () => {
    it('uses the active multi-tag intersection subset as draggable nodes while sorting', async () => {
        const wrapper = mount(ManualNodePanel, {
            props: {
                manualNodes: nodes,
                paginatedManualNodes: nodes.filter((node) => node.tags.includes('A')),
                currentPage: 1,
                totalPages: 1,
                isSorting: true,
                searchTerm: '',
                viewMode: 'card',
                tags: ['A', 'B', 'X'],
                activeTagFilters: ['A'],
                itemsPerPage: 24,
            },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: {
                    NodeActions: true,
                    BulkOperations: true,
                    NodeTable: NodeTableProbe,
                },
            },
        });

        expect(wrapper.get('[data-testid="sortable-ids"]').text()).toBe('a1,a2');

        await wrapper.setProps({ activeTagFilters: ['A', 'X'] });
        expect(wrapper.get('[data-testid="sortable-ids"]').text()).toBe('a1');
    });
});
