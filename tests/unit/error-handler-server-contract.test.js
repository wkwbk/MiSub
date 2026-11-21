import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorHandler } from '@/utils/error-handler.js';
import { messages } from '@/i18n/messages.js';
import { setLocale } from '@/i18n/index.js';

const FUNCTIONS_ROOT = path.resolve(__dirname, '../../functions');
const zh = messages['zh-CN'].errors;
const handler = new ErrorHandler();

beforeEach(() => {
  setLocale('zh-CN');
});

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const serverSource = walk(FUNCTIONS_ROOT)
  .map((file) => stripComments(readFileSync(file, 'utf8')))
  .join('\n');

const friendly = (message, extra = {}) => handler.getUserFriendlyMessage({ message, ...extra });

const SERVER_MESSAGES = [
  {
    source: 'functions/modules/api-handler.js —— 存储写入失败',
    message: '数据保存失败: Storage write failed',
    expected: 'saveFailed',
  },
  {
    source: 'functions/modules/api-handler.js —— 未捕获异常兜底',
    message: '保存失败: 服务器内部错误，请稍后重试',
    expected: 'saveFailed',
  },
  {
    source: 'functions/storage-adapter.js —— D1 适配器抛出的原始英文错误',
    message: 'D1 database not available',
    expected: 'd1Missing',
  },
];

describe('errorHandler ↔ 服务端错误消息契约', () => {
  it.each(SERVER_MESSAGES.map((item) => [item.source, item.message, item.expected]))(
    '%s',
    (_source, message, expected) => {
      expect(friendly(message)).toBe(zh[expected]);
    },
  );

  it('记录 D1 英文错误被正确分类为 d1Missing', () => {
    expect('D1 database not available'.includes('D1 绑定')).toBe(false);
    expect('D1 database not available'.includes('MISUB_DB')).toBe(false);
    expect(friendly('D1 database not available')).toBe(zh.d1Missing);
  });

  it('扫描范围没有静默空转', () => {
    expect(serverSource.length).toBeGreaterThan(10000);
  });

  it('契约短语仍然由 functions/ 在生产（服务端改文案会在这里失败）', () => {
    const phrases = ['数据保存失败', '保存失败', 'D1 database not available'];

    for (const phrase of phrases) {
      expect(serverSource.includes(phrase), `functions/ 里已找不到「${phrase}」`).toBe(true);
    }
  });

  it('英文界面下同一批服务端消息仍能正确分类（判定不随语言漂移）', () => {
    setLocale('en-US');
    const en = messages['en-US'].errors;

    for (const { message, expected } of SERVER_MESSAGES) {
      expect(friendly(message)).toBe(en[expected]);
    }
  });

  it('客户端侧不该出现「服务端标识符」的本地化版本', () => {
    const clientSource = ['src/utils/error-handler.js']
      .map((rel) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8'))
      .join('\n');

    const occurrences = clientSource.match(/MISUB_DB/g) || [];
    expect(occurrences.length).toBeLessThanOrEqual(2);
  });
});
