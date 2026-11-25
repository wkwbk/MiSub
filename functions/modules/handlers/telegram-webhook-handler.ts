/**
 * Telegram Bot Webhook 主入口与命令路由模块
 * 职责：Webhook 验签/鉴权/限流、消息分发与命令路由
 * 子模块位于 ./telegram/ 目录
 */

import type { Env } from '../../types.js';
import { createJsonResponse, escapeHtml, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';
import { createRequestCache, getTelegramPushConfig, type TelegramRequestCache } from './telegram/storage.js';
import { answerCallbackQuery, sendTelegramMessage } from './telegram/client.js';
import { checkUserPermission, verifyTelegramRequest } from './telegram/auth.js';
import { applyTagOperation, handleTagManage } from './telegram/tags.js';
import { isRecord, type TelegramDocumentLike } from './telegram/utils.js';
import {
  handleCopyCommand,
  handleExportCommand,
  handleHelpCommand,
  handleInfoCommand,
  handleListCommand,
  handleListTypeSelector,
  handleMenuCommand,
  handleSearchCommand,
  handleStartCommand,
  handleStatsCommand,
  handleSubCommand,
} from './telegram/commands-read.js';
import {
  handleBindCommand,
  handleDeleteCommand,
  handleDisableCommand,
  handleDupCommand,
  handleEnableCommand,
  handleFileInput,
  handleImportCommand,
  handleNodeInput,
  handleRenameCommand,
  handleSortCommand,
  handleUnbindCommand,
} from './telegram/commands-write.js';
import { handleCallbackQuery, type TelegramCallbackQuery } from './telegram/callbacks.js';

interface TelegramMessagePayload {
  from: { id: number | string };
  chat: { id: number | string };
  text?: string;
  document?: TelegramDocumentLike;
  photo?: TelegramDocumentLike[];
}

function asTelegramUserOrChatId(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

function asDocumentLike(value: unknown): TelegramDocumentLike | undefined {
  if (!isRecord(value) || typeof value.file_id !== 'string') return undefined;
  return {
    file_id: value.file_id,
    ...(typeof value.file_size === 'number' ? { file_size: value.file_size } : {}),
    ...(typeof value.file_name === 'string' ? { file_name: value.file_name } : {}),
  };
}

function parseCallbackQuery(raw: unknown): TelegramCallbackQuery | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  if (!isRecord(raw.from) || !isRecord(raw.message) || !isRecord(raw.message.chat)) return null;
  const fromId = asTelegramUserOrChatId(raw.from.id);
  const chatId = asTelegramUserOrChatId(raw.message.chat.id);
  const messageId = typeof raw.message.message_id === 'number' ? raw.message.message_id : null;
  if (fromId === null || chatId === null || messageId === null) return null;
  return {
    id: raw.id,
    from: { id: fromId },
    ...(typeof raw.data === 'string' ? { data: raw.data } : {}),
    message: {
      chat: { id: chatId },
      message_id: messageId,
    },
  };
}

function parseTelegramMessage(raw: unknown): TelegramMessagePayload | null {
  if (!isRecord(raw) || !isRecord(raw.from) || !isRecord(raw.chat)) return null;
  const fromId = asTelegramUserOrChatId(raw.from.id);
  const chatId = asTelegramUserOrChatId(raw.chat.id);
  if (fromId === null || chatId === null) return null;
  const document = asDocumentLike(raw.document);
  const photo = Array.isArray(raw.photo)
    ? raw.photo.map(asDocumentLike).filter((item): item is TelegramDocumentLike => item !== undefined)
    : undefined;
  return {
    from: { id: fromId },
    chat: { id: chatId },
    ...(typeof raw.text === 'string' ? { text: raw.text } : {}),
    ...(document ? { document } : {}),
    ...(photo && photo.length > 0 ? { photo } : {}),
  };
}

// ==================== 命令路由 ====================

/**
 * 处理命令
 */
async function handleCommand(
  chatId: number | string,
  text: string,
  userId: number | string,
  env: Env,
  request: Request,
  requestCache: TelegramRequestCache | null = null,
): Promise<Response> {
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split('@')[0]; // 移除 @botname
  const args = parts.slice(1);

  switch (command) {
    case '/start':
      await handleStartCommand(chatId, env);
      break;

    case '/help':
      await handleHelpCommand(chatId, env);
      break;

    case '/menu':
      await handleMenuCommand(chatId, env, null, requestCache);
      break;

    case '/list':
      if (args[0]?.toLowerCase() === 'node' || args[0] === '节点') {
        await handleListCommand(chatId, userId, env, 0, 'node', null, requestCache);
      } else if (['sub', 'airport', 'subscription', '订阅', '机场'].includes(args[0]?.toLowerCase())) {
        await handleListCommand(chatId, userId, env, 0, 'sub', null, requestCache);
      } else {
        await handleListTypeSelector(chatId, env, null, requestCache);
      }
      break;

    case '/stats':
      await handleStatsCommand(chatId, userId, env, requestCache);
      break;

    case '/delete':
    case '/del':
    case '/rm':
      await handleDeleteCommand(chatId, userId, args, env);
      break;

    case '/enable':
    case '/on':
      await handleEnableCommand(chatId, userId, args, env);
      break;

    case '/disable':
    case '/off':
      await handleDisableCommand(chatId, userId, args, env);
      break;

    case '/search':
    case '/find':
      await handleSearchCommand(chatId, userId, args, env);
      break;

    case '/sub':
    case '/subscription':
      await handleSubCommand(chatId, args, env, request, requestCache);
      break;

    case '/rename':
      await handleRenameCommand(chatId, userId, args, env);
      break;

    case '/info':
    case '/detail':
      await handleInfoCommand(chatId, userId, args, env);
      break;

    case '/copy':
    case '/cp':
      await handleCopyCommand(chatId, userId, args, env);
      break;

    case '/export':
    case '/backup':
      await handleExportCommand(chatId, userId, args, env);
      break;

    case '/import':
      await handleImportCommand(chatId, userId, args, env);
      break;

    case '/sort':
      await handleSortCommand(chatId, userId, args, env);
      break;

    case '/dup':
    case '/dedup':
      await handleDupCommand(chatId, userId, args, env);
      break;

    case '/tags':
    case '/tag':
      // /tags [node|sub] 打开标签管理面板
      await handleTagManage(chatId, userId, env, null, args[0] === 'sub' ? 'sub' : 'node', requestCache);
      break;

    case '/trename': {
      // /trename <旧标签名> <新标签名>
      const oldName = args[0];
      const newName = args.slice(1).join(' ').trim();
      if (!oldName || !newName) {
        await sendTelegramMessage(
          chatId,
          '✏️ <b>重命名标签</b>\n\n用法：/trename 旧标签名 新标签名\n\n例：/trename 导入 香港节点',
          env,
        );
        break;
      }
      const n = await applyTagOperation(chatId, userId, env, 'node', oldName, 'rename', newName, requestCache);
      await sendTelegramMessage(
        chatId,
        n > 0
          ? `✅ 已将标签 <b>${escapeHtml(oldName)}</b> 重命名为 <b>${escapeHtml(newName)}</b>（${n} 项）`
          : `⚠️ 未找到标签 <b>${escapeHtml(oldName)}</b>`,
        env,
      );
      break;
    }

    case '/bind':
      await handleBindCommand(chatId, userId, args, env, requestCache);
      break;

    case '/unbind':
      await handleUnbindCommand(chatId, userId, env, requestCache);
      break;

    default:
      await sendTelegramMessage(chatId, '❌ 未知命令\n\n发送 /help 查看可用命令\n发送 /menu 打开快捷菜单', env);
  }

  return createJsonResponse({ ok: true });
}

// ==================== 主 Webhook 处理 ====================

/**
 * 主 Webhook 处理函数
 */
export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const requestCache = createRequestCache();
    // 获取配置
    const config = await getTelegramPushConfig(env, requestCache);

    if (!config.enabled) {
      return createJsonResponse({ error: 'Bot disabled' }, 403);
    }

    // 验证请求来源
    if (!config.webhookSecret) {
      console.error('[Telegram Push] Missing webhook secret');
      return createJsonResponse({ error: 'Webhook secret required' }, 503);
    }

    if (!verifyTelegramRequest(request, config)) {
      console.error('[Telegram Push] Invalid webhook secret');
      return createJsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 解析 Telegram Update
    const rawUpdate = (await readJsonWithLimit(request, JSON_BODY_LIMITS.small)) as unknown;
    const update = isRecord(rawUpdate) ? rawUpdate : {};

    // 处理 Callback Query（按钮回调）
    const callbackQuery = parseCallbackQuery(update.callback_query);
    if (callbackQuery) {
      const userId = callbackQuery.from.id;
      const permissionCheck = checkUserPermission(userId, config);
      if (!permissionCheck.allowed) {
        await answerCallbackQuery(callbackQuery.id, permissionCheck.reason, env, true);
        return createJsonResponse({ ok: true });
      }
      return await handleCallbackQuery(callbackQuery, env, request, requestCache);
    }

    // 处理普通消息
    const message = parseTelegramMessage(update.message);
    if (message) {
      const userId = message.from.id;
      const chatId = message.chat.id;
      const text = message.text;

      // 检查用户权限（文件消息同样需要鉴权）
      const permissionCheck = checkUserPermission(userId, config);
      if (!permissionCheck.allowed) {
        await sendTelegramMessage(chatId, `❌ ${permissionCheck.reason}`, env);
        return createJsonResponse({ ok: true });
      }

      // 文件/文档消息：下载内容后走与文本相同的导入流程
      if (!text && (message.document || message.photo)) {
        return await handleFileInput(chatId, message, userId, config, env, requestCache);
      }

      if (!text) {
        return createJsonResponse({ ok: true });
      }

      // 处理命令或节点输入
      if (text.startsWith('/')) {
        return await handleCommand(chatId, text, userId, env, request, requestCache);
      } else {
        return await handleNodeInput(chatId, text, userId, env, requestCache);
      }
    }

    // 忽略其他类型的更新
    return createJsonResponse({ ok: true });
  } catch (error: unknown) {
    console.error('[Telegram Push] Webhook handler error:', error);
    const status = isRecord(error) && typeof error.status === 'number' ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';
    return createJsonResponse({ error: status === 413 ? message : 'Internal server error' }, status);
  }
}
