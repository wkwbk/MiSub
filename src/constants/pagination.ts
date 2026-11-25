export const DEFAULT_LIST_PAGE_SIZE = 24;

export const LIST_PAGE_SIZE_OPTIONS = Object.freeze([12, 24, 48, 96, -1]);

export function normalizeListPageSize(value: unknown, fallback: number = DEFAULT_LIST_PAGE_SIZE): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (parsed === -1) return -1;
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}
