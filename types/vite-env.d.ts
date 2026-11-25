/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  export function toCanvas(...args: unknown[]): Promise<void>;
  const QRCode: {
    toDataURL: typeof toDataURL;
    toCanvas: typeof toCanvas;
  };
  export default QRCode;
}
