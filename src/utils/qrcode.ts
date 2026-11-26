/**
 * 二维码生成与导出文件名清洗辅助
 */

/**
 * 清洗导出二维码 PNG 的文件名，替换非法路径字符并限制长度。
 */
export function sanitizeQrFilename(name: string, fallback = 'qrcode'): string {
  const withoutControlChars = Array.from(String(name || ''), (ch) =>
    ch.charCodeAt(0) < 32 ? '_' : ch,
  ).join('');
  const cleaned = withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '')
    .slice(0, 80)
    .trim();

  return cleaned || fallback;
}

/**
 * 按需加载 qrcode 库并将文本渲染到指定 Canvas。
 * 长链接（>600 字符）自动降级为 L 级纠错以提高容量与扫码识别率。
 */
export async function renderQrCodeToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  width = 256,
): Promise<boolean> {
  if (!canvas || !text || typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) {
    return false;
  }

  const mod = await import('qrcode');
  const QRCode = mod.default ?? mod;
  const errorCorrectionLevel = text.length > 600 ? 'L' : 'M';

  await QRCode.toCanvas(canvas, text, {
    width,
    margin: 2,
    errorCorrectionLevel,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  return true;
}
