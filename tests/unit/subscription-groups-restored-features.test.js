import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('03e7c6e feature wiring regressions', () => {
    it('Dashboard applies detected names through the complete subscription object and remembers the root domain', () => {
        const source = read('src/components/features/Dashboard/Dashboard.vue');
        expect(source).toContain('updateSubscription({ ...subscription, name: target })');
        expect(source).toContain('rememberDomainName(domain, target)');
        expect(source).toContain('@applyDetectedName="handleApplyDetectedName"');
    });
});
