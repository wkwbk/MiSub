import { describe, expect, it } from 'vitest';
import { extractLocalChangelog, getReleaseNotesForTag } from '../../scripts/extract-release-notes.mjs';
import packageJson from '../../package.json';

describe('extract-release-notes script', () => {
  it('extracts and unescapes localChangelog template literal', () => {
    const sample = `
      const localChangelog = \`✨ **标题**
- 支持 \\\`/cron/subscriptions\\\` 调度\`;
    `;
    const notes = extractLocalChangelog(sample);
    expect(notes).toContain('✨ **标题**');
    expect(notes).toContain('`/cron/subscriptions`');
    expect(notes).not.toContain('\\`');
  });

  it('returns notes for the current package version tag and empty string for mismatched tag', () => {
    const currentNotes = getReleaseNotesForTag(`v${packageJson.version}`);
    expect(currentNotes.length).toBeGreaterThan(0);

    const mismatchedNotes = getReleaseNotesForTag('v0.0.1');
    expect(mismatchedNotes).toBe('');
  });
});
