import { describe, expect, it } from 'vitest';
import {
    collectTags,
    matchesTagFilter,
    normalizeTagList,
    normalizeTagName,
    UNTAGGED_KEY,
} from '@/utils/tags.js';

describe('空标签名与无标签处理一致性', () => {
    it('normalizeTagName 应将空值、空字符串、纯空格及无标签哨兵规范化为空字符串', () => {
        expect(normalizeTagName('')).toBe('');
        expect(normalizeTagName('   ')).toBe('');
        expect(normalizeTagName(null)).toBe('');
        expect(normalizeTagName(undefined)).toBe('');
        expect(normalizeTagName(UNTAGGED_KEY)).toBe('');
    });

    it('collectTags 应跳过无标签或空标签项', () => {
        const nodes = [
            { id: 'n1', url: 'ss://test1', tags: ['USA', '家宽'] },
            { id: 'n2', url: 'ss://test2', tags: [] },
            { id: 'n3', url: 'ss://test3', tags: ['   ', null] },
            { id: 'n4', url: 'ss://test4' },
            { id: 'n5', url: 'ss://test5', tags: ['Japan'] },
        ];

        const tags = collectTags(nodes);
        expect(tags).toEqual(['USA', '家宽', 'Japan']);
        expect(tags).not.toContain('');
    });

    it('matchesTagFilter 支持无标签哨兵与多标签交集匹配', () => {
        const nodes = [
            { id: 'n1', url: 'ss://test1', tags: ['HK', '家宽', '解锁'] },
            { id: 'n2', url: 'ss://test2', tags: ['HK'] },
            { id: 'n3', url: 'ss://test3', tags: [] },
            { id: 'n4', url: 'ss://test4', tags: ['   '] },
        ];

        const untagged = nodes.filter((n) => matchesTagFilter(n, [UNTAGGED_KEY]));
        expect(untagged.map((n) => n.id)).toEqual(['n3', 'n4']);

        const hkOnly = nodes.filter((n) => matchesTagFilter(n, ['HK']));
        expect(hkOnly.map((n) => n.id)).toEqual(['n1', 'n2']);

        const intersection = nodes.filter((n) => matchesTagFilter(n, ['HK', '家宽']));
        expect(intersection.map((n) => n.id)).toEqual(['n1']);
    });

    it('自定义标签顺序不应包含空字符串', () => {
        const nodes = [
            { id: 'n1', url: 'ss://test1', tags: ['USA'] },
            { id: 'n2', url: 'ss://test2', tags: [] },
            { id: 'n3', url: 'ss://test3', tags: ['Japan'] },
        ];

        const customOrder = ['Japan', '', 'USA'];
        const tags = collectTags(nodes, customOrder);

        expect(tags).not.toContain('');
        expect(tags).toEqual(['Japan', 'USA']);
        expect(normalizeTagList([' A ', '', 'A', 'B'])).toEqual(['A', 'B']);
    });
});
