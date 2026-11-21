/**
 * 剪贴板写入工具（基于现代 Clipboard API）
 * @param {string} text - 待复制文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyTextToClipboard(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(String(text ?? ''));
    return true;
  } catch {
    return false;
  }
}
