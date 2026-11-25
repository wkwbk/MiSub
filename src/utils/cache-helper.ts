const isDev = import.meta.env.DEV;

export interface StorageCache<T = unknown> {
  get: () => T | null;
  set: (data: T) => void;
  clear: () => void;
}

export function createStorageCache<T = unknown>(keyBase: string, ttlMs: number): StorageCache<T> {
  const DATA_KEY = keyBase;
  const TS_KEY = `${keyBase}_ts`;

  function get(): T | null {
    try {
      const timestamp = sessionStorage.getItem(TS_KEY);
      if (!timestamp) return null;

      const age = Date.now() - parseInt(timestamp, 10);
      if (age > ttlMs) {
        clear();
        return null;
      }

      const raw = sessionStorage.getItem(DATA_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn(`[Cache] Failed to read ${DATA_KEY}`, e);
      return null;
    }
  }

  function set(data: T): void {
    try {
      sessionStorage.setItem(DATA_KEY, JSON.stringify(data));
      sessionStorage.setItem(TS_KEY, String(Date.now()));
    } catch (e) {
      if (isDev) console.warn(`[Cache] Failed to write ${DATA_KEY}`, e);
    }
  }

  function clear(): void {
    try {
      sessionStorage.removeItem(DATA_KEY);
      sessionStorage.removeItem(TS_KEY);
    } catch {}
  }

  return { get, set, clear };
}
