import { describe, expect, it } from 'vitest';
import {
  determineFormatByUrl,
  determineFormatByUserAgent,
  formatBytes,
  formatDuration,
  formatNumber,
  formatPercentage,
  formatUrl,
  getProcessedUserAgent,
  isValidBase64,
  truncateText,
} from '@misub/core/utils/format-utils.js';

describe('shared/format-utils', () => {
  it('formatBytes / formatNumber / formatPercentage / formatDuration / truncateText / formatUrl 工作正常', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatPercentage(1, 4)).toBe('25.0%');
    expect(formatPercentage(1, 0)).toBe('0%');
    expect(formatDuration(90061)).toBe('1天 1小时 1分钟 1秒');
    expect(truncateText('abcdef', 3)).toBe('abc...');
    expect(formatUrl('https://example.com/sub/test?token=123', 50)).toBe('https://example.com/sub/test');
  });

  it('isValidBase64 校验有效与无效输入', () => {
    expect(isValidBase64('dm1lc3M6Ly9leGFtcGxlLmNvbQ==')).toBe(true);
    expect(isValidBase64('')).toBe(false);
    expect(isValidBase64('not valid base64!!!')).toBe(false);
  });

  it('determineFormatByUserAgent 与 determineFormatByUrl 识别格式', () => {
    expect(determineFormatByUserAgent('Clash-Verge/v2.0')).toBe('clash');
    expect(determineFormatByUserAgent('sing-box/1.10')).toBe('singbox');
    expect(determineFormatByUserAgent('v2rayN/7.23')).toBe('base64');
    expect(determineFormatByUrl(new URL('https://example.com/sub?clash'))).toBe('clash');
    expect(determineFormatByUrl(new URL('https://example.com/sub?target=singbox'))).toBe('singbox');
    expect(determineFormatByUrl(new URL('https://example.com/sub?v2ray'))).toBe('base64');
  });
});

describe('format-utils getProcessedUserAgent', () => {
  it('带 clash 参数的订阅源应使用 Clash UA 拉取', () => {
    expect(getProcessedUserAgent('ClashMeta', 'http://example.com/link/token?clash=2')).toBe('clash-verge/v2.4.3');
  });

  it('普通订阅源保持默认 v2rayN UA', () => {
    expect(getProcessedUserAgent('ClashMeta', 'http://example.com/link/token')).toBe('v2rayN/7.23');
  });
});
