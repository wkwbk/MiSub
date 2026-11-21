import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/utils/clipboard.js';

describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('writes stringified text via navigator.clipboard.writeText and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const result = await copyTextToClipboard('https://example.com/sub');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/sub');
  });

  it('returns false when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    expect(await copyTextToClipboard('hello')).toBe(false);
  });

  it('returns false when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    expect(await copyTextToClipboard('hello')).toBe(false);
  });
});
