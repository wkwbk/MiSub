import { NODE_PROTOCOL_PREFIXES } from '@/constants/node-protocols.js';
import { t } from '@/i18n/index.js';

/**
 * 验证工具函数
 * @author MiSub Team
 */

/**
 * 验证URL格式
 * @param {string} url - 要验证的URL
 * @returns {boolean} 是否为有效的URL
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * 验证节点URL格式
 * @param {string} nodeUrl - 节点URL
 * @returns {boolean} 是否为有效的节点URL
 */
export function isValidNodeUrl(nodeUrl) {
  if (!nodeUrl || typeof nodeUrl !== 'string') return false;

  // 检查是否为支持的协议
  return NODE_PROTOCOL_PREFIXES.some((protocol) => nodeUrl.startsWith(protocol));
}

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否为有效的邮箱格式
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证表单字段
 * @param {Object} formData - 表单数据
 * @param {Object} rules - 验证规则
 * @returns {Object} 验证结果
 */
export function validateForm(formData, rules) {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field];
    const fieldErrors = [];

    // 必填验证
    if (fieldRules.required && (!value || value.toString().trim() === '')) {
      fieldErrors.push(fieldRules.required || t('validation.fieldRequired', { field }));
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
    if (fieldRules.minLength && value.length < fieldRules.minLength) {
      fieldErrors.push(t('validation.minLength', { count: fieldRules.minLength }));
    }

    if (fieldRules.maxLength && value.length > fieldRules.maxLength) {
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
 * @param {Object} profile - 配置文件
 * @returns {Object} 验证结果
 */
export function validateProfile(profile) {
  const rules = {
    name: {
      required: t('validation.profileNameRequired'),
      minLength: 1,
      maxLength: 100,
    },
    customId: {
      maxLength: 50,
    },
    transformConfig: {
      validator: (value) => {
        if (!value) return null;

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

  return validateForm(profile, rules);
}
