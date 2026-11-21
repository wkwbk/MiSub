/**
 * Telegram Bot 标签管理与批量操作模块
 */

import { clearAllNodeCaches } from '../../../services/node-cache-service.js';
import { escapeHtml } from '../../utils.js';
import { createRequestCache, getCachedStorageAdapter, getCachedSubscriptions, } from './storage.js';
import { editTelegramMessage, sendTelegramMessage } from './client.js';
import { getTelegramItemTags } from './utils.js';
import { getUserNodes } from './node-queries.js';

/**
 * 标签选择面板：列出所有标签及数量，点击进入该标签列表。
 */
export async function handleTagSelect(chatId, userId, env, messageId = null, type = 'node', requestCache = null) {
  const allNodes = await getUserNodes(userId, env);
  const nodes =
    type === 'sub'
      ? allNodes.filter((n) => /^https?:\/\//i.test(n.url || ''))
      : allNodes.filter((n) => !/^https?:\/\//i.test(n.url || ''));

  // 统计标签
  const tagCounts = new Map();
  let untagged = 0;
  nodes.forEach((n) => {
    const tags = getTelegramItemTags(n);
    if (tags.length > 0) {
      tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    } else {
      untagged++;
    }
  });

  const title = type === 'sub' ? '\uD83D\uDCE1 选择订阅标签' : '\uD83D\uDE80 选择节点标签';
  let text = `<b>${title}</b>\n\n共 ${nodes.length} 项`;
  if (tagCounts.size > 0) {
    text += `，${tagCounts.size} 个标签`;
  }

  // 构建标签按钮（每行 2 个）
  const buttons = [];
  const entries = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, entries.length); j++) {
      const [name, count] = entries[j];
      // callback_data 有 64 字节限制，长标签名需要截断
      const short = name.length > 20 ? `${name.slice(0, 18)}…` : name;
      row.push({
        text: `${short} (${count})`,
        callback_data: `tag_${type}_${encodeURIComponent(name).slice(0, 40)}`,
      });
    }
    buttons.push(row);
  }

  // 全部 / 无标签
  const tail = [{ text: `全部 (${nodes.length})`, callback_data: `tag_${type}___all__` }];
  if (untagged > 0) {
    tail.push({ text: `无标签 (${untagged})`, callback_data: `tag_${type}___none__` });
  }
  buttons.push(tail);

  buttons.push([{ text: '\uD83D\uDD19 返回菜单', callback_data: 'cmd_menu' }]);

  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, env, {
      reply_markup: keyboard,
      requestCache,
    });
  } else {
    await sendTelegramMessage(chatId, text, env, { reply_markup: keyboard, requestCache });
  }
}

/**
 * 标签管理面板：列出所有标签，支持重命名、移除标签、删除含该标签的条目。
 */
export async function handleTagManage(chatId, userId, env, messageId = null, type = 'node', requestCache = null) {
  const allNodes = await getUserNodes(userId, env);
  const nodes =
    type === 'sub'
      ? allNodes.filter((n) => /^https?:\/\//i.test(n.url || ''))
      : allNodes.filter((n) => !/^https?:\/\//i.test(n.url || ''));

  const tagCounts = new Map();
  let untagged = 0;
  nodes.forEach((n) => {
    const tags = getTelegramItemTags(n);
    if (tags.length > 0) {
      tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    } else {
      untagged++;
    }
  });

  let text =
    '🏷️ <b>标签管理</b>\n\n' +
    `共 ${nodes.length} 项，${tagCounts.size} 个标签` +
    (untagged > 0 ? `，${untagged} 项无标签` : '') +
    '\n\n点击标签可执行重命名或删除：';

  const buttons = [];
  Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      const short = name.length > 16 ? `${name.slice(0, 14)}…` : name;
      buttons.push([
        {
          text: `🏷️ ${short} (${count})`,
          callback_data: `tmgr_${type}_${encodeURIComponent(name).slice(0, 40)}`,
        },
      ]);
    });

  buttons.push([{ text: '🔙 返回菜单', callback_data: 'cmd_menu' }]);

  const keyboard = { inline_keyboard: buttons };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, env, {
      reply_markup: keyboard,
      requestCache,
    });
  } else {
    await sendTelegramMessage(chatId, text, env, { reply_markup: keyboard, requestCache });
  }
}

/**
 * 单个标签的操作面板（重命名 / 移除标签 / 删除条目 / 查看）。
 */
export async function handleTagActions(chatId, userId, env, messageId, type, tagName, requestCache = null) {
  const allNodes = await getUserNodes(userId, env);
  const nodes =
    type === 'sub'
      ? allNodes.filter((n) => /^https?:\/\//i.test(n.url || ''))
      : allNodes.filter((n) => !/^https?:\/\//i.test(n.url || ''));
  const count = nodes.filter((n) => getTelegramItemTags(n).includes(tagName)).length;

  const text = `🏷️ <b>${escapeHtml(tagName)}</b>\n\n` + `关联 ${count} 项\n\n` + '选择要执行的操作：';

  const encoded = encodeURIComponent(tagName).slice(0, 40);
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✏️ 重命名', callback_data: `tmrn_${type}_${encoded}` },
        { text: '📋 查看列表', callback_data: `tag_${type}_${encoded}` },
      ],
      [
        { text: '🗑 删除关联项', callback_data: `tmrm_${type}_${encoded}` },
        { text: '🚫 移除该标签', callback_data: `tmcl_${type}_${encoded}` },
      ],
      [{ text: '🔙 返回', callback_data: `tmls_${type}` }],
    ],
  };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, text, env, {
      reply_markup: keyboard,
      requestCache,
    });
  } else {
    await sendTelegramMessage(chatId, text, env, { reply_markup: keyboard, requestCache });
  }
}

/**
 * 执行标签操作。
 * @param {string} op rename | clear | delete
 */
export async function applyTagOperation(
  chatId,
  userId,
  env,
  type,
  tagName,
  op = 'rename',
  newName = null,
  requestCache = null,
) {
  const cache = requestCache || createRequestCache();
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  const allSubscriptions = await getCachedSubscriptions(env, cache);

  let changed = 0;
  allSubscriptions.forEach((sub) => {
    const currentTags = getTelegramItemTags(sub);
    if (!currentTags.includes(tagName)) return;
    const isSub = /^https?:\/\//i.test(sub.url || '');
    if (type === 'sub' ? !isSub : isSub) return;

    if (op === 'rename') {
      const trimmedNew = String(newName || '').trim();
      if (!trimmedNew) return;
      sub.tags = [...new Set(currentTags.map((t) => (t === tagName ? trimmedNew : t)))];
    } else if (op === 'clear') {
      sub.tags = currentTags.filter((t) => t !== tagName);
    }
    changed++;
  });

  if (op === 'delete') {
    const remaining = allSubscriptions.filter((sub) => {
      const isSub = /^https?:\/\//i.test(sub.url || '');
      const sameType = type === 'sub' ? isSub : !isSub;
      const hasTag = getTelegramItemTags(sub).includes(tagName);
      if (sameType && hasTag) {
        changed++;
        return false;
      }
      return true;
    });
    await storageAdapter.putAllSubscriptions(remaining);
  } else {
    if (changed === 0) return 0;
    await storageAdapter.putAllSubscriptions(allSubscriptions);
  }

  // 清理节点缓存，避免前端读到旧数据
  if (type === 'node') await clearAllNodeCaches(storageAdapter);

  return changed;
}
