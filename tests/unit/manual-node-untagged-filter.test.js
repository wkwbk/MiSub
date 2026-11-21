import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UNTAGGED_KEY } from '@/utils/tags.js';
import { filterManualNodes, isManualNodeEntry } from '@/composables/manual-nodes/filters.js';
import { messages } from '@/i18n/messages.js';
import { setLocale } from '@/i18n/index.js';

const NODES = [
  { id: 'a', name: 'untagged-1', url: 'ss://x' },
  { id: 'b', name: 'untagged-2', url: 'ss://y', tags: [] },
  { id: 'c', name: 'tagged', url: 'ss://z', tags: ['香港', '家宽'] },
];

afterEach(() => {
  setLocale('zh-CN');
});

describe('UNTAGGED_KEY 哨兵', () => {
  it('是非空固定字符串且与界面翻译文案解耦', () => {
    expect(typeof UNTAGGED_KEY).toBe('string');
    expect(UNTAGGED_KEY.length).toBeGreaterThan(0);

    for (const locale of ['zh-CN', 'en-US']) {
      const label = messages[locale].tags.untagged;
      expect(typeof label).toBe('string');
      expect(label).not.toBe(UNTAGGED_KEY);
    }
  });
});

describe('无标签过滤与语言无关', () => {
  it.each(['zh-CN', 'en-US'])('locale=%s 时都能筛出无标签节点', (locale) => {
    setLocale(locale);
    const result = filterManualNodes(NODES, '', [UNTAGGED_KEY]);
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('HTTP(S) proxy URI with credentials is listed as a manual node, not a subscription URL', () => {
    const node = {
      id: 'http-proxy',
      name: 'HTTP proxy',
      url: 'http://alice:secret@proxy.example.com:8080#node',
    };
    expect(isManualNodeEntry(node)).toBe(true);
    expect(filterManualNodes([node], '', [])).toEqual([node]);
  });

  it('ordinary HTTP(S) URLs remain subscriptions rather than manual nodes', () => {
    expect(isManualNodeEntry({ url: 'https://example.com/subscription' })).toBe(false);
    expect(isManualNodeEntry({ url: 'http://proxy.example.com:8080' })).toBe(false);
  });

  it('non-HTTP protocol node classification remains unchanged', () => {
    expect(isManualNodeEntry({ url: 'ss://cipher@proxy.example.com:443' })).toBe(true);
  });

  it('按单标签和多标签交集过滤均正常', () => {
    expect(filterManualNodes(NODES, '', ['香港']).map((n) => n.id)).toEqual(['c']);
    expect(filterManualNodes(NODES, '', ['香港', '家宽']).map((n) => n.id)).toEqual(['c']);
    expect(filterManualNodes(NODES, '', ['香港', '不存在']).map((n) => n.id)).toEqual([]);
  });

  it('TagFilterBar 统一使用 UNTAGGED_KEY 常量而非翻译值', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/shared/TagFilterBar.vue'), 'utf-8');
    expect(source).toContain('UNTAGGED_KEY');
    expect(source).not.toMatch(/=== *t\('tags\.untagged'\)/);
  });
});
