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
