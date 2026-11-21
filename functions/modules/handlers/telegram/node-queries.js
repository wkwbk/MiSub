/**
 * Telegram Bot 用户节点查询工具
 */

import { checkUserPermission } from './auth.js';
import { getStorageAdapter, getTelegramPushConfig } from './storage.js';

/**
 * 获取用户通过 Telegram 添加的节点
 */
export async function getUserNodes(userId, env) {
  const storageAdapter = await getStorageAdapter(env);
  const allSubscriptions = await storageAdapter.getAllSubscriptions();

  // 检查用户是否在白名单中
  const config = await getTelegramPushConfig(env);
  const permission = checkUserPermission(userId, config);

  // 如果用户有权限（白名单用户），则显示所有节点（包括 Web 端添加的）
  if (permission.allowed) {
    return allSubscriptions;
  }

  // 否则仅返回该用户通过 Telegram 添加的节点（兜底逻辑）
  return allSubscriptions.filter((sub) => sub.source === 'telegram' && sub.telegram_user_id === userId);
}

/**
 * 获取所有节点和用户节点的索引映射
 */
export async function getNodesWithMapping(userId, env) {
  const storageAdapter = await getStorageAdapter(env);
  const allSubscriptions = await storageAdapter.getAllSubscriptions();

  const config = await getTelegramPushConfig(env);
  const permission = checkUserPermission(userId, config);

  const userNodes = [];
  const indexMapping = []; // userIndex -> allIndex

  allSubscriptions.forEach((sub, allIndex) => {
    if (permission.allowed || (sub.source === 'telegram' && sub.telegram_user_id === userId)) {
      indexMapping.push(allIndex);
      userNodes.push(sub);
    }
  });

  return { allSubscriptions, userNodes, indexMapping, storageAdapter };
}
