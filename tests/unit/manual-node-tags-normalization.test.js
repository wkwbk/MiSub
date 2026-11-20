import { describe, expect, it } from 'vitest';
import { collectTags, normalizeTagList, normalizeTagName } from '@/utils/tags.js';

describe('manual node tag normalization', () => {
  it('规范化标签名时去掉首尾空白', () => {
    expect(normalizeTagName('  S5  ')).toBe('S5');
    expect(normalizeTagName('\tFreezeHost\n')).toBe('FreezeHost');
    expect(normalizeTagName(null)).toBe('');
  });

  it('收集节点标签时按 trim 后的名称去重，并保留首次出现顺序', () => {
    const tags = collectTags([
      { id: 'n1', tags: ['S5', ' 家宽 '] },
      { id: 'n2', tags: [' S5 '] },
      { id: 'n3', tags: ['FreezeHost'] },
      { id: 'n4', tags: [] },
    ]);

    expect(tags).toEqual(['S5', '家宽', 'FreezeHost']);
    expect(normalizeTagList('S5, 家宽，S5')).toEqual(['S5', '家宽']);
  });
});
