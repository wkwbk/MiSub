import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function normalizeVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '');
}

/**
 * 从 src/stores/useVersionStore.js 源码中提取 localChangelog 模板字符串文本。
 * @param {string} source
 * @returns {string}
 */
export function extractLocalChangelog(source) {
  if (typeof source !== 'string' || !source) return '';
  const match = source.match(/const\s+localChangelog\s*=\s*`((?:\\[\s\S]|[^`\\])*)`/);
  if (!match) return '';

  return match[1]
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * 读取与目标 tag 匹配的本地更新日志；版本不匹配时返回空字符串，以便回退到自动生成。
 * @param {string} targetTag
 * @param {string} [rootDir]
 * @returns {string}
 */
export function getReleaseNotesForTag(targetTag, rootDir = ROOT_DIR) {
  const normalizedTarget = normalizeVersion(targetTag);
  const pkgPath = path.join(rootDir, 'package.json');
  const versionStorePath = path.join(rootDir, 'src', 'stores', 'useVersionStore.js');

  if (!fs.existsSync(pkgPath) || !fs.existsSync(versionStorePath)) {
    return '';
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pkgVersion = normalizeVersion(pkg.version);

  if (normalizedTarget && pkgVersion && normalizedTarget !== pkgVersion) {
    return '';
  }

  const versionStoreSource = fs.readFileSync(versionStorePath, 'utf8');
  return extractLocalChangelog(versionStoreSource);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const targetTag = process.argv[2] || '';
  const notes = getReleaseNotesForTag(targetTag);
  if (notes) {
    process.stdout.write(`${notes}\n`);
  }
}
