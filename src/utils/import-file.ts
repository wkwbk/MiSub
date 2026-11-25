/**
 * 文件导入与下载导出辅助：统一收口 FileReader、隐式 <input type="file"> 选择器与 Blob/DataURL 下载副作用。
 */
import { t } from '@/i18n/index.js';

/** 单个文件大小上限（字节）——后端 JSON body 限制为 2MB，留出余量。 */
const MAX_IMPORT_FILE_SIZE = 1.5 * 1024 * 1024;

/** 允许的扩展名 / MIME 提示（仅用于 文件选择框 过滤，不做强校验）。 */
export const IMPORT_FILE_ACCEPT = ['.txt', '.yaml', '.yml', '.json', '.conf', '.config', '.ini', '.list', '.text'].join(
  ',',
);

export interface ReadFilesResult {
  text: string;
  fileCount: number;
  byteSize: number;
}

export interface PickLocalFileOptions {
  accept?: string;
  multiple?: boolean;
}

/**
 * 把 File 读成文本。
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(t('fileImport.readFailed')));
    reader.readAsText(file);
  });
}

/**
 * 把 File 读成 DataURL（常用于本地图标上传预览）。
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error(t('fileImport.readFailed')));
    reader.readAsDataURL(file);
  });
}

/**
 * 校验文件大小，超限时抛出可展示的错误。
 */
function assertFileSize(file: File): void {
  if (file && typeof file.size === 'number' && file.size > MAX_IMPORT_FILE_SIZE) {
    const mb = (MAX_IMPORT_FILE_SIZE / 1024 / 1024).toFixed(1);
    throw new Error(
      t('fileImport.tooLarge', {
        size: (file.size / 1024 / 1024).toFixed(1),
        limit: mb,
      }),
    );
  }
}

/**
 * 把多个文件的内容合并成一个文本块（后端逐行解析，天然支持多文件追加）。
 */
export async function readFilesAsText(files: FileList | File[]): Promise<ReadFilesResult> {
  const list = Array.from(files || []);
  const chunks: string[] = [];
  let byteSize = 0;

  for (const file of list) {
    assertFileSize(file);
    const text = await readFileAsText(file);
    byteSize += file.size || text.length;
    chunks.push(text.trim());
  }

  return {
    text: chunks.filter(Boolean).join('\n'),
    fileCount: list.length,
    byteSize,
  };
}

/**
 * 通过瞬态 <input type="file"> 唤起本地文件选择。
 * 用户取消选择时返回空数组。
 */
export function pickLocalFile(options: PickLocalFileOptions = {}): Promise<File[]> {
  if (typeof document === 'undefined') {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) {
      input.accept = options.accept;
    }
    if (options.multiple) {
      input.multiple = true;
    }

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.onchange = null;
      input.remove();
      resolve(files);
    };

    input.onchange = () => {
      finish(Array.from(input.files || []));
    };
    input.addEventListener('cancel', () => finish([]), { once: true });

    input.style.display = 'none';
    document.body?.appendChild(input);
    input.click();
  });
}

/**
 * 唤起本地文件选择并将首个文件解析为 JSON 对象。
 * 用户取消选择时返回 null；JSON 解析失败时抛出异常。
 */
export async function pickAndReadJsonFile<T = unknown>(
  accept = 'application/json',
): Promise<{ file: File; data: T } | null> {
  const files = await pickLocalFile({ accept, multiple: false });
  const file = files[0];
  if (!file) return null;

  const rawText = await readFileAsText(file);
  const data = JSON.parse(rawText) as T;
  return { file, data };
}

/**
 * 触发浏览器下载 Blob 文件并自动回收 ObjectURL。
 */
export function downloadBlobFile(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body?.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * 将对象序列化为格式化 JSON 并触发浏览器下载。
 */
export function downloadJsonFile(data: unknown, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlobFile(blob, filename);
}

/**
 * 触发浏览器下载 DataURL 资源（如二维码 PNG）。
 */
export function downloadDataUrlFile(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined' || !dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body?.appendChild(link);
  link.click();
  link.remove();
}
