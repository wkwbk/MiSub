export {};

declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
    props: Record<string, unknown>;
  }

  interface ScheduledController {
    scheduledTime: number;
    cron: string;
    noRetry(): void;
  }

  interface RequestInit {
    cf?: Record<string, unknown>;
    duplex?: 'half';
  }

  interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: boolean;
    meta?: Record<string, unknown>;
    error?: string;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(): Promise<T[]>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<{ count: number; duration: number }>;
  }

  interface AssetsBinding {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }

  interface CacheStorage {
    readonly default?: Cache;
  }

  interface SubtleCrypto {
    timingSafeEqual(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean;
  }

  const Buffer: {
    from(input: unknown, encoding?: string): Uint8Array & { toString(encoding?: string): string };
    concat(list: Uint8Array[]): Uint8Array;
    isBuffer(obj: unknown): boolean;
  };
}

declare module 'js-yaml' {
  interface DumpOptions {
    quotingType?: "'" | '"';
  }
}
