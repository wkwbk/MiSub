/**
 * 留言板处理模块
 * 处理留言板的公开访问和管理接口
 */

import { StorageFactory } from '../../storage-adapter.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';
import { sendTgNotification, tgEscape } from '../notifications.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../config.js';
import { enforcePublicApiAccess } from '../access-control.js';
import { resolveTurnstileConfig, verifyTurnstileToken } from '../turnstile.js';

/**
 * 获取存储适配器实例
 */
async function getStorageAdapter(env) {
  return StorageFactory.createAdapter(env);
}

async function loadGuestbookMessages(storageAdapter) {
  return await storageAdapter.getAllGuestbookMessages();
}

async function persistGuestbookMessage(storageAdapter, message) {
  await storageAdapter.putGuestbookMessage(message);
}

async function removeGuestbookMessage(storageAdapter, id) {
  await storageAdapter.deleteGuestbookMessageById(id);
}

/**
 * 获取公开留言列表
 * 仅返回 isVisible 为 true 的留言
 */
export async function handleGuestbookGet(request, env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const rawSettings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
    const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
    const blocked = await enforcePublicApiAccess(request, env, settings);
    if (blocked) return blocked;

    const messages = await loadGuestbookMessages(storageAdapter);

    const guestbookConfig = settings.guestbook || DEFAULT_SETTINGS.guestbook;

    // 如果功能未启用，返回空列表或错误状态
    if (!guestbookConfig.enabled) {
      return createJsonResponse({
        success: false,
        message: '留言板功能未启用',
        data: [],
        disabled: true,
      });
    }

    // 过滤可见消息，并在返回前移除可能的敏感字段（如果有）
    // 按时间倒序排列
    const publicMessages = messages
      .filter((msg) => msg.isVisible)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((msg) => ({
        id: msg.id,
        nickname: msg.nickname,
        content: msg.content,
        type: msg.type || 'general',
        status: msg.status,
        createdAt: msg.createdAt,
        reply: msg.reply,
        replyAt: msg.replyAt,
      }));

    return createJsonResponse({
      success: true,
      data: publicMessages,
      config: {
        enabled: true,
      },
    });
  } catch (e) {
    console.error('[Guestbook Error] Get:', e);
    return createErrorResponse('获取留言失败', 500);
  }
}

/**
 * 提交新留言 (Public)
 */
export async function handleGuestbookPost(request, env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const rawSettings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
    const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
    const blocked = await enforcePublicApiAccess(request, env, settings);
    if (blocked) return blocked;

    const guestbookConfig = settings.guestbook || DEFAULT_SETTINGS.guestbook;

    if (!guestbookConfig.enabled) {
      return createErrorResponse('留言板功能未启用', 403);
    }

    const body = await readJsonWithLimit(request, JSON_BODY_LIMITS.small);
    const { nickname, content, type, turnstileToken } = body;

    const turnstileConfig = resolveTurnstileConfig(settings, env);
    if (turnstileConfig.enableForGuestbook) {
      const verification = await verifyTurnstileToken(turnstileToken, request, {
        secretKey: turnstileConfig.secretKey,
      });
      if (!verification.success) {
        return createErrorResponse(verification.error || 'Turnstile verification failed', 400);
      }
    }

    // 基础验证
    if (!content || content.trim().length === 0) {
      return createErrorResponse('留言内容不能为空', 400);
    }
    if (content.length > 500) {
      return createErrorResponse('留言内容过长（最大500字）', 400);
    }

    const trimmedNickname = nickname ? nickname.trim() : '';
    if (guestbookConfig.allowAnonymous === false && !trimmedNickname) {
      return createErrorResponse('请填写昵称后再提交留言', 400);
    }

    let finalNickname = trimmedNickname || '匿名用户';
    if (finalNickname.length > 20) {
      finalNickname = finalNickname.substring(0, 20);
    }

    // 构建新留言
    const newMessage = {
      id: crypto.randomUUID(),
      nickname: finalNickname,
      content: content.trim(),
      type: type || 'general',
      createdAt: new Date().toISOString(),
      status: 'pending',
      isVisible: !guestbookConfig.requireAudit, // 如果不需要审核，则默认可见
      reply: null,
      replyAt: null,
    };

    // 保存
    await persistGuestbookMessage(storageAdapter, newMessage);

    // 发送通知给管理员
    try {
      const messageText =
        `📝 <b>新留言提醒</b>\n\n` +
        `<b>用户</b>: ${tgEscape(finalNickname)}\n` +
        `<b>类型</b>: ${tgEscape(newMessage.type)}\n` +
        `<b>内容</b>: ${tgEscape(newMessage.content)}\n` +
        `<b>状态</b>: ${newMessage.isVisible ? '🟢 已显示' : '🔴 待审核'}`;
      await sendTgNotification(settings, messageText);
    } catch (notifyError) {
      console.warn('[Guestbook] Notification failed:', notifyError);
    }

    return createJsonResponse({
      success: true,
      message: newMessage.isVisible ? '留言提交成功' : '留言提交成功，等待管理员审核',
      data: newMessage,
    });
  } catch (e) {
    console.error('[Guestbook Error] Post:', e);
    return createErrorResponse(e.status === 413 ? e.message : '提交留言失败', e.status || 500);
  }
}

/**
 * 获取管理端留言列表 (Auth Required)
 */
export async function handleGuestbookManageGet(env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const messages = await loadGuestbookMessages(storageAdapter);

    // 管理端返回所有字段，按时间倒序
    const sortedMessages = messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return createJsonResponse({
      success: true,
      data: sortedMessages,
    });
  } catch (e) {
    console.error('[Guestbook Manage Error] Get:', e);
    return createErrorResponse('获取留言数据失败', 500);
  }
}

/**
 * 管理操作 (Auth Required)
 * - reply: 回复
 * - delete: 删除
 * - toggle: 切换可见性
 */
export async function handleGuestbookManageAction(request, env) {
  try {
    const body = await readJsonWithLimit(request, JSON_BODY_LIMITS.small);
    const { action, id, replyContent } = body;

    const storageAdapter = await getStorageAdapter(env);
    const messages = await loadGuestbookMessages(storageAdapter);

    const index = messages.findIndex((m) => m.id === id);
    if (index === -1) {
      return createErrorResponse('留言不存在', 404);
    }

    let updatedMessage = messages[index];

    if (action === 'delete') {
      messages.splice(index, 1);
      await removeGuestbookMessage(storageAdapter, id);
    } else if (action === 'reply') {
      updatedMessage.reply = replyContent;
      updatedMessage.replyAt = new Date().toISOString();
      updatedMessage.status = 'replied';
      // 自动通过审核（如果回复了肯定是要显示的）
      if (!updatedMessage.isVisible) {
        updatedMessage.isVisible = true;
      }
    } else if (action === 'toggle') {
      updatedMessage.isVisible = !updatedMessage.isVisible;
      // 如果变为可见且状态还是 pending，改为 approved
      if (updatedMessage.isVisible && updatedMessage.status === 'pending') {
        updatedMessage.status = 'approved';
      }
    } else if (action === 'status') {
      // 只更新状态，例如改为 'pending' or 'approved'
      if (body.status) updatedMessage.status = body.status;
    } else {
      return createErrorResponse('未知操作', 400);
    }

    if (action !== 'delete') {
      await persistGuestbookMessage(storageAdapter, updatedMessage);
    }

    return createJsonResponse({
      success: true,
      message: '操作成功',
      data: updatedMessage,
    });
  } catch (e) {
    console.error('[Guestbook Manage Error] Action:', e);
    return createErrorResponse(`操作失败: ${e.message}`, e.status || 500);
  }
}
