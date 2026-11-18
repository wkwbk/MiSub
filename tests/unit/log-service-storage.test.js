import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAdapter = vi.fn();
const getStorageType = vi.fn();

vi.mock('../../functions/storage-adapter.js', () => ({
    StorageFactory: {
        createAdapter: (...args) => createAdapter(...args),
        getStorageType: (...args) => getStorageType(...args),
    },
    STORAGE_TYPES: {
        D1: 'd1',
    },
}));

function createMemoryStorage(type) {
    const store = new Map();

    return {
        type,
        store,
        async get(key) {
            return store.has(key) ? store.get(key) : null;
        },
        async put(key, value) {
            store.set(key, value);
            return true;
        },
        async delete(key) {
            store.delete(key);
            return true;
        },
    };
}

describe('LogService storage selection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
        vi.resetModules();

        createAdapter.mockReset();
        getStorageType.mockReset();

        getStorageType.mockResolvedValue('d1');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('writes access logs into D1-backed storage', async () => {
        const d1Storage = createMemoryStorage('d1');
        createAdapter.mockReturnValue(d1Storage);

        const { LogService } = await import('../../functions/services/log-service.js');

        const addLogPromise = LogService.addLog(
            { MISUB_DB: {} },
            {
                status: 'success',
                type: 'profile',
                token: 'profile-token',
                format: 'builtin-clash',
                domain: 'sub.example.com',
                summary: '生成 10 个节点 (成功: 10, 失败: 0)',
            }
        );

        await vi.advanceTimersByTimeAsync(500);
        await addLogPromise;

        expect(Array.from(d1Storage.store.keys())).toContain('misub_system_logs:index');

        const logs = await LogService.getLogs({ MISUB_DB: {} });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            token: expect.stringMatching(/^profile:[a-f0-9]{12}$/),
            format: 'builtin-clash',
            domain: 'sub.example.com',
        });
        expect(JSON.stringify(logs)).not.toContain('profile-token');
    });

    it('clears D1 log buckets cleanly', async () => {
        const d1Storage = createMemoryStorage('d1');

        d1Storage.store.set('misub_system_logs:index', ['misub_system_logs:2026-04-15']);
        d1Storage.store.set('misub_system_logs:2026-04-15', [
            { id: 'd1-log', timestamp: Date.now() },
        ]);

        createAdapter.mockReturnValue(d1Storage);

        const { LogService } = await import('../../functions/services/log-service.js');

        const result = await LogService.clearLogs({ MISUB_DB: {} });

        expect(result).toBe(true);
        expect(d1Storage.store.size).toBe(0);
    });
});
