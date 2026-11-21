import { describe, expect, it } from 'vitest';
import { base64ToUtf8, normalizeBase64String, utf8ToBase64 } from '@shared/base64.js';

describe('shared/base64', () => {
  it('encodes and decodes ASCII and UTF-8 (Chinese + emoji) round-trip', () => {
    const samples = ['hello world', '香港节点 🇭🇰 01', '{"ps":"新加坡 🇸🇬","add":"1.2.3.4"}'];
    for (const sample of samples) {
      const encoded = utf8ToBase64(sample);
      expect(base64ToUtf8(encoded)).toBe(sample);
    }
  });

  it('decodes URL-safe base64 without padding', () => {
    const original = '日本节点+测试/内容?a=1';
    const urlSafe = utf8ToBase64(original).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64ToUtf8(urlSafe)).toBe(original);
  });

  it('normalizes whitespace and padding', () => {
    expect(normalizeBase64String(' aGVsbG8 ')).toBe('aGVsbG8=');
  });
});
