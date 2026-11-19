import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('LogService D1 row-level storage', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('writes anonymized access logs into D1 access_logs table', async () => {
        const db = createMemoryD1();
        const env = { MISUB_DB: db };

        const { LogService } = await import('../../functions/services/log-service.js');

        const addLogPromise = LogService.addLog(env, {
            profileName: 'Share A',
            status: 'success',
            type: 'profile',
            token: 'profile-token',
            format: 'builtin-clash',
            domain: 'sub.example.com',
            summary: '生成 10 个节点 (成功: 10, 失败: 0)',
        });

        await vi.advanceTimersByTimeAsync(500);
        await addLogPromise;

        expect(db.tables.access_logs.size).toBe(1);

        const logs = await LogService.getLogs(env);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            profileName: 'Share A',
            token: expect.stringMatching(/^profile:[a-f0-9]{12}$/),
            format: 'builtin-clash',
            domain: 'sub.example.com',
        });
        expect(JSON.stringify(logs)).not.toContain('profile-token');
    });

    it('clears all D1 access_logs cleanly when no profileName is given', async () => {
        const db = createMemoryD1();
        const env = { MISUB_DB: db };

        const { LogService } = await import('../../functions/services/log-service.js');

        const p1 = LogService.addLog(env, {
            profileName: 'Share A',
            status: 'success',
            type: 'profile',
            token: 'token-a',
            format: 'builtin-clash',
            domain: 'sub.example.com',
            persistenceMode: 'full',
        });
        const p2 = LogService.addLog(env, {
            profileName: 'Share B',
            status: 'success',
            type: 'profile',
            token: 'token-b',
            format: 'builtin-clash',
            domain: 'sub.example.com',
            persistenceMode: 'full',
        });

        await vi.advanceTimersByTimeAsync(500);
        await Promise.all([p1, p2]);
        expect(db.tables.access_logs.size).toBe(2);

        const result = await LogService.clearLogs(env);

        expect(result).toBe(true);
        expect(db.tables.access_logs.size).toBe(0);
    });

    it('clears only the specified profile logs in D1 while keeping other profiles intact', async () => {
        const db = createMemoryD1();
        const env = { MISUB_DB: db };

        const { LogService } = await import('../../functions/services/log-service.js');

        const p1 = LogService.addLog(env, {
            profileName: 'Share A',
            status: 'success',
            type: 'profile',
            token: 'token-a',
            format: 'builtin-clash',
            domain: 'sub.example.com',
            persistenceMode: 'full',
        });
        const p2 = LogService.addLog(env, {
            profileName: 'Share B',
            status: 'success',
            type: 'profile',
            token: 'token-b',
            format: 'builtin-clash',
            domain: 'sub.example.com',
            persistenceMode: 'full',
        });

        await vi.advanceTimersByTimeAsync(500);
        await Promise.all([p1, p2]);

        const result = await LogService.clearLogs(env, { profileName: 'Share A' });

        expect(result).toBe(true);
        const remaining = await LogService.getLogs(env);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].profileName).toBe('Share B');
    });
});
