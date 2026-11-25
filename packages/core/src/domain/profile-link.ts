/**
 * 订阅组公开分享标识（linkId）与身份解析工具。
 *
 * 将公开访问标识（linkId）与内部存储主键（id）解耦：
 * - 自定义别名（customId）存在时，作为唯一公开入口，同时隐藏 linkId 与内部 id；
 * - 未设置 customId 但存在 linkId 时，使用 linkId 作为公开入口，屏蔽内部 id；
 * - 未迁移的旧记录无 customId 与 linkId 时，兼容回退内部 id。
 */

import type { ProfileConfig } from '../types.js';

const LINK_ID_PREFIX = 'p_';

/**
 * 规范化标识符字符串
 */
export function normalizeProfileIdentifier(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 生成 12 位随机 Hex 的短随机 linkId（如 `p_1a2b3c4d5e6f`）
 */
export function generateProfileLinkId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return `${LINK_ID_PREFIX}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${LINK_ID_PREFIX}${hex}`;
    }
  }
  const fallback = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 12);
  return `${LINK_ID_PREFIX}${fallback.padEnd(12, '0')}`;
}

/**
 * 确保订阅组拥有 linkId（已有则规范化保留，缺失则生成且保证与 id 不同）
 */
export function ensureProfileLinkId<T extends Partial<ProfileConfig>>(profile: T): T {
  if (!profile || typeof profile !== 'object') return profile;
  const existingLinkId = normalizeProfileIdentifier(profile.linkId);
  if (existingLinkId) {
    return profile.linkId === existingLinkId ? profile : { ...profile, linkId: existingLinkId };
  }
  const internalId = normalizeProfileIdentifier(profile.id);
  let nextLinkId = generateProfileLinkId();
  while (internalId && nextLinkId.toLowerCase() === internalId.toLowerCase()) {
    nextLinkId = generateProfileLinkId();
  }
  return {
    ...profile,
    linkId: nextLinkId,
  };
}

/**
 * 轮换订阅组 linkId 并清空 customId，使旧公开链接立即失效
 */
export function rotateProfileLinkId(profile?: Partial<ProfileConfig> | null): Partial<ProfileConfig> {
  const prevLinkId = normalizeProfileIdentifier(profile?.linkId).toLowerCase();
  const internalId = normalizeProfileIdentifier(profile?.id).toLowerCase();
  let nextLinkId = generateProfileLinkId();
  while (nextLinkId.toLowerCase() === prevLinkId || nextLinkId.toLowerCase() === internalId) {
    nextLinkId = generateProfileLinkId();
  }
  return {
    ...(profile && typeof profile === 'object' ? profile : {}),
    linkId: nextLinkId,
    customId: '',
  };
}

/**
 * 获取对外展示和拼接链接的标识：customId > linkId > id
 */
export function getProfileShareIdentifier(profile: Partial<ProfileConfig> | null | undefined): string {
  return (
    normalizeProfileIdentifier(profile?.customId) ||
    normalizeProfileIdentifier(profile?.linkId) ||
    normalizeProfileIdentifier(profile?.id)
  );
}

/**
 * 判断公开订阅请求路径标识是否匹配该订阅组（严格执行降级失效隔离）。
 */
export function matchesPublicProfileIdentifier(
  profile: Partial<ProfileConfig> | null | undefined,
  identifier: string,
): boolean {
  const target = normalizeProfileIdentifier(identifier);
  if (!target || !profile || typeof profile !== 'object') return false;
  const targetLower = target.toLowerCase();

  const customId = normalizeProfileIdentifier(profile.customId);
  if (customId) {
    return customId.toLowerCase() === targetLower;
  }

  const linkId = normalizeProfileIdentifier(profile.linkId);
  if (linkId) {
    return linkId.toLowerCase() === targetLower;
  }

  const internalId = normalizeProfileIdentifier(profile.id);
  return Boolean(internalId) && internalId.toLowerCase() === targetLower;
}

/**
 * 从订阅组列表中按公开入口规则查找匹配项
 */
export function resolvePublicProfile<T extends Partial<ProfileConfig>>(profiles: T[], identifier: string): T | null {
  if (!Array.isArray(profiles) || !identifier) return null;
  return profiles.find((profile) => matchesPublicProfileIdentifier(profile, identifier)) || null;
}
