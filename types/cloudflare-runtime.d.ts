export {};

declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
    props: any;
  }

  interface ScheduledController {
    scheduledTime: number;
    cron: string;
    noRetry(): void;
  }

  interface RequestInit {
    cf?: Record<string, any>;
  }

  interface CacheStorage {
    readonly default?: Cache;
  }

  interface SubtleCrypto {
    timingSafeEqual(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean;
  }

  const Buffer: {
    from(input: any, encoding?: string): Uint8Array & { toString(encoding?: string): string };
    concat(list: Uint8Array[]): Uint8Array;
    isBuffer(obj: any): boolean;
  };
}

declare module 'js-yaml' {
  interface DumpOptions {
    quotingType?: "'" | '"';
  }
}
