/**
 * 现代 UTF-8 Base64 编解码工具（基于 TextEncoder / TextDecoder，无 Node Buffer 依赖）
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * 将 UTF-8 字符串编码为标准 Base64
 * @param {string} str
 * @returns {string}
 */
export function utf8ToBase64(str) {
  const input = String(str ?? '');
  const bytes = textEncoder.encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const base64EncodeUtf8 = utf8ToBase64;

/**
 * 规范化 Base64 字符串（兼容 URL-safe 字符与缺失 padding）
 * @param {string} str
 * @returns {string}
 */
export function normalizeBase64String(str) {
  let normalized = String(str ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (!normalized) return '';
  if (normalized.includes('%')) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // Ignore malformed percent-encoding and continue normalizing Base64 characters
    }
  }
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const mod = normalized.length % 4;
  if (mod) {
    normalized += '='.repeat(4 - mod);
  }
  return normalized;
}

/**
 * 将 Base64（含 URL-safe）解码为 UTF-8 字符串
 * @param {string} str
 * @returns {string}
 */
export function base64ToUtf8(str) {
  const binary = atob(normalizeBase64String(str));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return textDecoder.decode(bytes);
}

/**
 * 将 ArrayBuffer / Uint8Array 编码为标准 Base64
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @returns {string}
 */
export function encodeArrayBufferToBase64(buffer) {
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : ArrayBuffer.isView(buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
