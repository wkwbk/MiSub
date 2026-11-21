/**
 * Telegram Bot API 客户端封装
 */

import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../../utils.js';
import { getTelegramPushConfig } from './storage.js';

const WEBHOOK_SECRET_REGEX = /^[A-Za-z0-9_-]{1,256}$/;
const TELEGRAM_SETUP_TIMEOUT_MS = 8000;

/**
 * Telegram Bot 命令菜单定义（用于 setMyCommands）
 */
export const TELEGRAM_BOT_COMMANDS = [
  { command: 'menu', description: '快捷菜单' },
  { command: 'list', description: '节点列表 / 机场列表' },
  { command: 'stats', description: '统计信息' },
  { command: 'info', description: '节点详情' },
  { command: 'search', description: '搜索节点' },
  { command: 'tags', description: '标签管理' },
  { command: 'bind', description: '绑定订阅组' },
  { command: 'unbind', description: '取消绑定' },
  { command: 'sub', description: '获取订阅链接' },
  { command: 'dup', description: '节点去重' },
  { command: 'sort', description: '节点排序' },
  { command: 'export', description: '导出节点' },
  { command: 'help', description: '帮助说明' },
];

export function isValidWebhookSecret(secret) {
  return typeof secret === 'string' && WEBHOOK_SECRET_REGEX.test(secret.trim());
}

/**
 * 调用 Telegram Bot API（带超时保护）
 */
async function callTelegramBotApi(botToken, method, payload, timeoutMs = TELEGRAM_SETUP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        status: response.status,
        error: data?.description || `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      ok: false,
      error: isTimeout ? `Request timeout (${timeoutMs}ms)` : error?.message || 'Network error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 注册 Telegram Bot 命令菜单（setMyCommands）
 */
export async function setTelegramMyCommands(botToken, commands = TELEGRAM_BOT_COMMANDS) {
  const token = String(botToken || '').trim();
  if (!token) {
    return { ok: false, error: 'Bot token is required' };
  }
  return await callTelegramBotApi(token, 'setMyCommands', { commands });
}

/**
 * 注册 Telegram Bot Webhook（setWebhook）
 */
export async function setTelegramWebhook(botToken, webhookUrl, webhookSecret) {
  const token = String(botToken || '').trim();
  const secret = String(webhookSecret || '').trim();
  if (!token) {
    return { ok: false, error: 'Bot token is required' };
  }
  if (!isValidWebhookSecret(secret)) {
    return { ok: false, error: 'Invalid webhook secret' };
  }
  return await callTelegramBotApi(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
  });
}

/**
 * 同步 Push Bot 的命令菜单和 Webhook
 * @param {Object} pushConfig - telegram_push_config 对象
 * @param {string} origin - 当前站点 origin，如 https://example.com
 */
export async function syncTelegramPushBot(pushConfig, origin = '') {
  const botToken = String(pushConfig?.bot_token || '').trim();
  const webhookSecret = String(pushConfig?.webhook_secret || '').trim();

  if (!pushConfig?.enabled || !botToken) {
    return {
      attempted: false,
      skipped: true,
      success: true,
    };
  }

  const normalizedOrigin = String(origin || '').replace(/\/+$/, '');
  const canSetWebhook = /^https:\/\//i.test(normalizedOrigin) && isValidWebhookSecret(webhookSecret);
  const webhookUrl = normalizedOrigin ? `${normalizedOrigin}/api/telegram/webhook` : '';

  const [commandsResult, webhookResult] = await Promise.all([
    setTelegramMyCommands(botToken),
    canSetWebhook
      ? setTelegramWebhook(botToken, webhookUrl, webhookSecret)
      : Promise.resolve({
          ok: false,
          skipped: true,
          error: !/^https:\/\//i.test(normalizedOrigin)
            ? 'Webhook requires HTTPS origin'
            : 'Valid webhook secret is required',
        }),
  ]);

  const webhookOkOrSkipped = webhookResult.ok || webhookResult.skipped === true;
  const success = commandsResult.ok && webhookOkOrSkipped;

  return {
    attempted: true,
    success,
    commands: commandsResult,
    webhook: webhookResult,
  };
}

/**
 * 处理独立同步接口 POST /api/telegram/setup
 */
export async function handleTelegramSetupRequest(request, env) {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    let body = {};
    try {
      body = (await readJsonWithLimit(request, JSON_BODY_LIMITS.small)) || {};
    } catch (error) {
      if (error?.status === 413) {
        return createErrorResponse(error.message, 413);
      }
      body = {};
    }

    const savedConfig = await getTelegramPushConfig(env);
    const botToken = String(body.botToken ?? savedConfig.bot_token ?? '').trim();
    const webhookSecret = String(body.webhookSecret ?? savedConfig.webhook_secret ?? '').trim();

    if (!botToken) {
      return createJsonResponse(
        {
          success: false,
          error: 'Push Bot Token is required',
        },
        400,
      );
    }

    const origin = new URL(request.url).origin;
    const syncResult = await syncTelegramPushBot(
      {
        enabled: true,
        bot_token: botToken,
        webhook_secret: webhookSecret,
      },
      origin,
    );

    const errors = [];
    if (!syncResult.commands?.ok) {
      errors.push(`setMyCommands: ${syncResult.commands?.error || 'failed'}`);
    }
    if (!syncResult.webhook?.skipped && !syncResult.webhook?.ok) {
      errors.push(`setWebhook: ${syncResult.webhook?.error || 'failed'}`);
    }

    return createJsonResponse(
      {
        success: syncResult.success,
        commands: syncResult.commands,
        webhook: syncResult.webhook,
        ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
      },
      syncResult.success ? 200 : 502,
    );
  } catch (error) {
    console.error('[Telegram Push] Setup error:', error);
    return createErrorResponse(error.message || 'Telegram setup failed', error.status || 500);
  }
}

/**
 * 发送 Telegram 消息
 */
export async function sendTelegramMessage(chatId, text, env, options = {}) {
  try {
    const { requestCache = null, ...apiOptions } = options || {};
    const config = await getTelegramPushConfig(env, requestCache);
    if (!config.bot_token) {
      console.error('[Telegram Push] Bot token not configured');
      return;
    }

    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...apiOptions,
    };

    const response = await fetch(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[Telegram Push] Failed to send message:', await response.clone().text());
    }

    return response;
  } catch (error) {
    console.error('[Telegram Push] Error sending message:', error);
  }
}

/**
 * 编辑 Telegram 消息
 */
export async function editTelegramMessage(chatId, messageId, text, env, options = {}) {
  try {
    const { requestCache = null, ...apiOptions } = options || {};
    const config = await getTelegramPushConfig(env, requestCache);
    if (!config.bot_token) return;

    const body = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      ...apiOptions,
    };

    await fetch(`https://api.telegram.org/bot${config.bot_token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[Telegram Push] Error editing message:', error);
  }
}

/**
 * 回答 Callback Query
 */
export async function answerCallbackQuery(callbackQueryId, text, env, showAlert = false, requestCache = null) {
  try {
    const config = await getTelegramPushConfig(env, requestCache);
    if (!config.bot_token) return;

    await fetch(`https://api.telegram.org/bot${config.bot_token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert,
      }),
    });
  } catch (error) {
    console.error('[Telegram Push] Error answering callback:', error);
  }
}
