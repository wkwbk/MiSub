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

declare module 'cloudflare:sockets' {
  export interface SocketAddress {
    hostname: string;
    port: number;
  }
  export interface SocketOptions {
    secureTransport?: 'off' | 'on' | 'starttls';
    allowHalfOpen?: boolean;
  }
  export interface SocketInfo {
    remoteAddress?: string;
    localAddress?: string;
  }
  export interface CloudflareSocket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<SocketInfo>;
    closed: Promise<void>;
    close(): Promise<void>;
  }
  export function connect(address: string | SocketAddress, options?: SocketOptions): CloudflareSocket;
}

declare module 'js-yaml' {
  interface DumpOptions {
    quotingType?: "'" | '"';
  }
}
