import { HttpUrlStringSchema, ManualNodeUrlSchema } from '@misub/core/schemas/entities.js';
import type { ProfileConfig } from '@misub/core/types.js';
import { t } from '@/i18n/index.js';

export interface FieldValidationRule {
  required?: boolean | string;
  type?: 'url' | 'email' | 'nodeUrl';
  minLength?: number;
  maxLength?: number;
  validator?: (value: unknown) => string | null | undefined;
}

export type ValidationRules = Record<string, FieldValidationRule>;

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
}

/**
 * 复用 @misub/core Zod Schema 验证 HTTP/HTTPS URL 格式。
 */
export function isValidHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return HttpUrlStringSchema.safeParse(url).success;
}

/**
 * 验证URL格式
 */
function isValidUrl(url: unknown): boolean {
  return isValidHttpUrl(url);
}

/**
 * 复用 @misub/core Zod Schema 验证节点URL格式
 */
function isValidNodeUrl(nodeUrl: unknown): boolean {
  if (typeof nodeUrl !== 'string') return false;
  return ManualNodeUrlSchema.safeParse(nodeUrl).success;
}

/**
 * 验证邮箱格式
 */
function isValidEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证表单字段
 */
function validateForm(formData: Record<string, unknown>, rules: ValidationRules): ValidationResult {
  const errors: Record<string, string[]> = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field];
    const fieldErrors: string[] = [];

    // 必填验证
    if (fieldRules.required && (!value || String(value).trim() === '')) {
      fieldErrors.push(
        typeof fieldRules.required === 'string'
          ? fieldRules.required
          : t('validation.fieldRequired', { field }),
      );
    }

    // 如果值为空且不是必填，跳过其他验证
    if (!value && !fieldRules.required) {
      continue;
    }

    // 类型验证
    if (fieldRules.type) {
      switch (fieldRules.type) {
        case 'url':
          if (!isValidUrl(value)) {
            fieldErrors.push(t('validation.invalidUrl'));
          }
          break;
        case 'email':
          if (!isValidEmail(value)) {
            fieldErrors.push(t('validation.invalidEmail'));
          }
          break;
        case 'nodeUrl':
          if (!isValidNodeUrl(value)) {
            fieldErrors.push(t('validation.invalidNodeUrl'));
          }
          break;
      }
    }

    // 长度验证
    const lengthValue = typeof value === 'string' || Array.isArray(value) ? value.length : String(value ?? '').length;
    if (fieldRules.minLength && lengthValue < fieldRules.minLength) {
      fieldErrors.push(t('validation.minLength', { count: fieldRules.minLength }));
    }

    if (fieldRules.maxLength && lengthValue > fieldRules.maxLength) {
      fieldErrors.push(t('validation.maxLength', { count: fieldRules.maxLength }));
    }

    // 自定义验证
    if (fieldRules.validator && typeof fieldRules.validator === 'function') {
      const customError = fieldRules.validator(value);
      if (customError) {
        fieldErrors.push(customError);
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 验证配置文件
 */
export function validateProfile(profile: Partial<ProfileConfig> | Record<string, unknown>): ValidationResult {
  const rules: ValidationRules = {
    name: {
      required: t('validation.profileNameRequired'),
      minLength: 1,
      maxLength: 100,
    },
    customId: {
      maxLength: 64,
    },
    transformConfig: {
      validator: (value: unknown) => {
        if (typeof value !== 'string' || !value) return null;

        // 允许 builtin: 和 custom: 前缀（内置/自定义模板）
        if (value.startsWith('builtin:')) {
          const templateName = value.slice(8).trim();
          if (!templateName) {
            return `builtin: ${t('validation.templateNameEmpty')}`;
          }
          return null;
        }

        if (value.startsWith('custom:')) {
          const templateName = value.slice(7).trim();
          if (!templateName) {
            return `custom: ${t('validation.templateNameEmpty')}`;
          }
          return null;
        }

        // 其他情况必须是有效的 URL
        if (!isValidUrl(value)) {
          return t('validation.invalidTransformUrl');
        }
        return null;
      },
    },
  };

  return validateForm(profile as Record<string, unknown>, rules);
}
