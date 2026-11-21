import { utf8ToBase64 } from '@shared/base64.js';

export function base64Encode(str) {
  return utf8ToBase64(str);
}
