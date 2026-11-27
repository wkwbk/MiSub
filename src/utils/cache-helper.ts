import {
  readSessionPreference,
  removeSessionPreference,
  writeSessionPreference,
} from '@/utils/session-preference.js';

const isDev = import.meta.env.DEV;

export interface StorageCacheOptions {
  maxBytes?: number;
}

export interface StorageCache<T = unknown> {
  get: () => T | null;
  set: (data: T) => void;
  clear: () => void;
}

export function createStorageCache<T = unknown>(
  keyBase: string,
  ttlMs: number,
  options: StorageCacheOptions = {},
): StorageCache<T> {
  const DATA_KEY = keyBase;
  const TS_KEY = `${keyBase}_ts`;

  function get(): T | null {
    try {
      const timestamp = readSessionPreference(TS_KEY);
      if (!timestamp) return null;

      const age = Date.now() - parseInt(timestamp, 10);
      if (age > ttlMs) {
        clear();
        return null;
      }

      const raw = readSessionPreference(DATA_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn(`[Cache] Failed to read ${DATA_KEY}`, e);
      return null;
    }
  }

  function set(data: T): void {
    try {
      const serialized = JSON.stringify(data);
      const estimatedBytes = serialized.length * 2;
      if (typeof options.maxBytes === 'number' && options.maxBytes > 0 && estimatedBytes > options.maxBytes) {
        clear();
        if (isDev) {
          console.warn(`[Cache] Skipped ${DATA_KEY}: payload ${estimatedBytes} bytes exceeds limit ${options.maxBytes}`);
        }
        return;
      }

      const wroteData = writeSessionPreference(DATA_KEY, serialized);
      const wroteTs = wroteData ? writeSessionPreference(TS_KEY, String(Date.now())) : false;
      if (!wroteData || !wroteTs) {
        clear();
      }
    } catch (e) {
      clear();
      if (isDev) console.warn(`[Cache] Failed to write ${DATA_KEY}`, e);
    }
  }

  function clear(): void {
    removeSessionPreference(DATA_KEY);
    removeSessionPreference(TS_KEY);
  }

  return { get, set, clear };
}
