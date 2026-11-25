import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { SETTINGS_KEYS } from '../../storage/d1-schema.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

export const STORAGE_KEY_RULE_TEMPLATES = SETTINGS_KEYS.RULE_TEMPLATES;
const MAX_TEMPLATE_COUNT = 50;
const MAX_TEMPLATE_CONTENT_LENGTH = 128 * 1024;

export interface RuleTemplateItem {
  id: string;
  name: string;
  description: string;
  type: 'ini';
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleTemplateSourceRef {
  kind?: string;
  value?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeId(value = ''): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function createId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `rule-template-${Date.now().toString(36)}-${random}`;
}

function hasIniShape(content: string): boolean {
  return /\[(custom|proxy\s*group|rule|ruleset|proxy)\]/i.test(content);
}

export function normalizeCustomRuleTemplates(input: unknown[] = []): RuleTemplateItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: RuleTemplateItem[] = [];

  for (const item of input.slice(0, MAX_TEMPLATE_COUNT)) {
    if (!isRecord(item)) continue;

    const content = typeof item.content === 'string' ? item.content.trim() : '';
    if (!content || content.length > MAX_TEMPLATE_CONTENT_LENGTH || !hasIniShape(content)) continue;

    let id = sanitizeId(typeof item.id === 'string' ? item.id : '') || createId();
    while (seen.has(id)) {
      id = `${id}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 80);
    }
    seen.add(id);

    const name =
      String(item.name || '')
        .trim()
        .slice(0, 80) || '未命名规则模板';
    const rawCreatedAt = typeof item.createdAt === 'string' ? item.createdAt : '';
    const createdAt = rawCreatedAt && !Number.isNaN(Date.parse(rawCreatedAt)) ? rawCreatedAt : nowIso();

    normalized.push({
      id,
      name,
      description: String(item.description || '')
        .trim()
        .slice(0, 300),
      type: 'ini',
      content,
      enabled: item.enabled !== false,
      createdAt,
      updatedAt: nowIso(),
    });
  }

  return normalized;
}

async function getStorageAdapter(env: Env): Promise<StorageAdapter> {
  if (env?.__TEST_STORAGE_ADAPTER && typeof env.__TEST_STORAGE_ADAPTER === 'object') {
    return env.__TEST_STORAGE_ADAPTER as StorageAdapter;
  }
  return StorageFactory.createAdapter(env) as unknown as StorageAdapter;
}

export async function listRuleTemplates(storageAdapter: StorageAdapter): Promise<RuleTemplateItem[]> {
  const raw = await storageAdapter.get(STORAGE_KEY_RULE_TEMPLATES);
  return normalizeCustomRuleTemplates(Array.isArray(raw) ? raw : []);
}

export async function resolveRuleTemplateSource(
  storageAdapter: StorageAdapter,
  templateSource: RuleTemplateSourceRef | null | undefined,
): Promise<(RuleTemplateItem & { format: string }) | null> {
  if (!templateSource || templateSource.kind !== 'custom') return null;
  const templateId = sanitizeId(templateSource.value);
  if (!templateId) return null;

  const templates = await listRuleTemplates(storageAdapter);
  const template = templates.find((item) => item.enabled !== false && item.id === templateId);
  if (!template) return null;

  return {
    ...template,
    content: template.content,
    format: template.type || 'ini',
  };
}

export async function handleRuleTemplatesRequest(request: Request, env: Env): Promise<Response> {
  try {
    const storageAdapter = await getStorageAdapter(env);

    if (request.method === 'GET') {
      const templates = await listRuleTemplates(storageAdapter);
      return createJsonResponse({ success: true, data: templates });
    }

    if (request.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.normal)) as unknown;
        body = isRecord(rawBody) ? rawBody : {};
      } catch (e: unknown) {
        if (isRecord(e) && e.status === 413) {
          const message = typeof e.message === 'string' ? e.message : 'Request body too large';
          return createJsonResponse({ success: false, message, error: message }, 413);
        }
        return createJsonResponse({ success: false, message: '请求数据格式错误' }, 400);
      }

      const rawTemplates = Array.isArray(body?.templates)
        ? body.templates
        : Array.isArray(body?.data)
          ? body.data
          : [];
      const templates = normalizeCustomRuleTemplates(rawTemplates);
      await storageAdapter.put(STORAGE_KEY_RULE_TEMPLATES, templates);
      return createJsonResponse({
        success: true,
        message: '自定义规则模板已保存',
        data: templates,
      });
    }

    return createErrorResponse('Method Not Allowed', 405);
  } catch (error: unknown) {
    console.error('[RuleTemplates] request failed:', error);
    const message = error instanceof Error && error.message ? error.message : '服务器内部错误';
    return createJsonResponse(
      {
        success: false,
        message: `自定义规则模板操作失败: ${message}`,
      },
      500,
    );
  }
}
