import { isReservedPathRoot } from './reserved-paths.js';
import { normalizeProfileIdentifier } from './profile-link.js';

export const PROFILE_ALIAS_MAX_LENGTH = 64;
const PROFILE_ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

const EXTRA_RESERVED_ALIASES = new Set(['sub', 'profile', 'profiles', 'token', 'default', 'all']);

/**
 * 判断自定义别名是否与系统保留词或系统保留路径冲突
 * @param {string} alias
 * @returns {boolean}
 */
function isReservedProfileAlias(alias) {
  const normalized = normalizeProfileIdentifier(alias).toLowerCase();
  if (!normalized) return false;
  return EXTRA_RESERVED_ALIASES.has(normalized) || isReservedPathRoot(normalized);
}

/**
 * 校验单个订阅组的自定义别名（customId）。
 * 对历史已存在的非标准别名可传入 legacyExempt: true 豁免格式与保留词检查，
 * 但大小写不敏感唯一性冲突始终禁止。
 *
 * @param {string} rawAlias
 * @param {Object} [options]
 * @param {string} [options.currentProfileId]
 * @param {Array} [options.profiles]
 * @param {boolean} [options.legacyExempt]
 * @returns {{ valid: boolean, code?: string, alias: string, message?: string }}
 */
export function validateSingleProfileAlias(
  rawAlias,
  { currentProfileId = '', profiles = [], legacyExempt = false } = {},
) {
  const alias = normalizeProfileIdentifier(rawAlias);
  if (!alias) {
    return { valid: true, alias: '' };
  }

  const aliasLower = alias.toLowerCase();
  const safeList = Array.isArray(profiles) ? profiles : [];

  for (const other of safeList) {
    if (!other || (currentProfileId && other.id === currentProfileId)) continue;
    const otherCustom = normalizeProfileIdentifier(other.customId).toLowerCase();
    const otherActivePublic =
      otherCustom ||
      normalizeProfileIdentifier(other.linkId).toLowerCase() ||
      normalizeProfileIdentifier(other.id).toLowerCase();

    if (aliasLower === otherCustom || (otherActivePublic && aliasLower === otherActivePublic)) {
      return {
        valid: false,
        code: 'duplicate',
        alias,
        message: `自定义别名 "${alias}" 已被其他订阅组占用`,
      };
    }
  }

  if (!legacyExempt) {
    if (alias.length > PROFILE_ALIAS_MAX_LENGTH) {
      return {
        valid: false,
        code: 'too_long',
        alias,
        message: `自定义别名长度不能超过 ${PROFILE_ALIAS_MAX_LENGTH} 个字符`,
      };
    }
    if (!PROFILE_ALIAS_PATTERN.test(alias)) {
      return {
        valid: false,
        code: 'invalid_chars',
        alias,
        message: '自定义别名仅允许字母、数字、下划线(_)和连字符(-)',
      };
    }
    if (isReservedProfileAlias(alias)) {
      return {
        valid: false,
        code: 'reserved',
        alias,
        message: `"${alias}" 是系统保留名称，请使用其他自定义别名`,
      };
    }
  }

  return { valid: true, alias };
}

/**
 * 批量校验订阅组列表中的所有自定义别名。
 * 若编辑保存时未修改原本即存在的历史 customId，则自动赋予格式豁免。
 *
 * @param {Array} profiles
 * @param {Object} [options]
 * @param {Array} [options.previousProfiles]
 * @returns {{ valid: boolean, code?: string, alias?: string, profileId?: string, message?: string }}
 */
export function validateProfileAliases(profiles = [], { previousProfiles = [] } = {}) {
  if (!Array.isArray(profiles)) {
    return { valid: true };
  }

  const prevById = new Map(
    (Array.isArray(previousProfiles) ? previousProfiles : []).filter((p) => p && p.id).map((p) => [p.id, p]),
  );

  for (const profile of profiles) {
    if (!profile) continue;
    const prev = profile.id ? prevById.get(profile.id) : null;
    const prevCustom = normalizeProfileIdentifier(prev?.customId);
    const nextCustom = normalizeProfileIdentifier(profile.customId);
    const legacyExempt = Boolean(prevCustom && prevCustom === nextCustom);

    const check = validateSingleProfileAlias(nextCustom, {
      currentProfileId: profile.id || '',
      profiles,
      legacyExempt,
    });
    if (!check.valid) {
      return {
        ...check,
        profileId: profile.id || '',
      };
    }
  }

  return { valid: true };
}
