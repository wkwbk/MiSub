/**
 * Telegram Bot 变更与导入类命令处理器
 */

import { base64ToUtf8 } from '../../../../shared/base64.js';
import { clearAllNodeCaches } from '../../../services/node-cache-service.js';
import { createJsonResponse, escapeHtml, generateId } from '../../utils.js';
import { extractValidNodes } from '../../../utils/node-parser.js';
import {
  createRequestCache,
  getCachedProfiles,
  getCachedSettings,
  getCachedStorageAdapter,
  getCachedSubscriptions,
  getStorageAdapter,
  getTelegramPushConfig,
  persistCachedSettings,
  saveSingleProfile,
  saveSingleSubscription,
} from './storage.js';
import { sendTelegramMessage } from './client.js';
import { checkRateLimit, getUserBoundProfileId, setUserBoundProfileId } from './auth.js';
import {
  buildImportTagName,
  downloadTelegramFile,
  extractNodeName,
  extractNodeUrls,
  extractSubscriptionUrls,
  parseTargetArgs,
} from './utils.js';
import { getNodesWithMapping } from './node-queries.js';

/**
 * 处理 Telegram 文件消息：下载文件 → 提取节点/订阅链接 → 导入。
 *
 * 复用 handleNodeInput 的处理链路：把文件内容当作「用户发送的文本」交给它，
 * 因此订阅链接、节点链接、Clash YAML、sing-box JSON 等全部格式都自动支持。
 *
 * @param {number} chatId
 * @param {Object} message  Telegram message（含 document/photo）
 * @param {number} userId
 * @param {Object} config
 * @param {Object} env
 * @param {Object|null} requestCache
 */
export async function handleFileInput(chatId, message, userId, config, env, requestCache = null) {
  try {
    await sendTelegramMessage(chatId, '📥 正在读取文件…', env);

    const { text, fileName } = await downloadTelegramFile(message, config);
    if (!text || !text.trim()) {
      await sendTelegramMessage(chatId, '❌ 文件内容为空', env);
      return createJsonResponse({ ok: true });
    }

    // 优先按「解析出节点」处理；若文件里是订阅链接，则由 handleNodeInput 识别
    const nodes = extractValidNodes(text);
    if (nodes.length > 0) {
      // extractValidNodes 返回节点链接字符串数组
      const nodeLines = nodes
        .map((n) => (typeof n === 'string' ? n : n?.url))
        .filter(Boolean)
        .join('\n');
      await sendTelegramMessage(
        chatId,
        `📄 解析文件 <b>${fileName}</b>，识别到 <b>${nodes.length}</b> 个节点，正在导入…`,
        env,
      );
      return await handleNodeInput(chatId, nodeLines, userId, env, requestCache, {
        source: 'file',
        fileName,
      });
    }

    // 没有节点：可能是订阅链接列表
    const subs = extractSubscriptionUrls(text);
    if (subs.length > 0) {
      await sendTelegramMessage(
        chatId,
        `📄 解析文件 <b>${fileName}</b>，识别到 <b>${subs.length}</b> 个订阅链接，正在导入…`,
        env,
      );
      return await handleNodeInput(chatId, subs.join('\n'), userId, env, requestCache, {
        source: 'file',
        fileName,
      });
    }

    await sendTelegramMessage(
      chatId,
      `❌ 未能从文件 <b>${fileName}</b> 中识别到节点或订阅链接\n\n` +
        '支持的格式：\n' +
        '1. 节点链接文本（每行一个）\n' +
        '2. Base64 订阅内容\n' +
        '3. Clash / Mihomo YAML\n' +
        '4. sing-box JSON',
      env,
    );
    return createJsonResponse({ ok: true });
  } catch (error) {
    console.error('[Telegram Push] File handling error:', error);
    await sendTelegramMessage(chatId, `❌ 处理文件失败：${error.message}`, env);
    return createJsonResponse({ ok: true });
  }
}

/**
 * 处理 /delete 命令
 */
export async function handleDeleteCommand(chatId, userId, args, env) {
  try {
    const target = parseTargetArgs(args);

    if (target.type === 'none') {
      await sendTelegramMessage(
        chatId,
        '❌ <b>请指定要删除的节点</b>\n\n' +
          '用法：\n' +
          '/delete 1 - 删除第1个\n' +
          '/delete 1,3,5 - 删除多个\n' +
          '/delete all - 删除全部',
        env,
      );
      return;
    }

    const { allSubscriptions, userNodes, indexMapping, storageAdapter } = await getNodesWithMapping(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, '📋 暂无可删除的节点', env);
      return;
    }

    let indicesToDelete = [];

    if (target.type === 'all') {
      indicesToDelete = indexMapping;
    } else if (target.type === 'index') {
      for (const idx of target.values) {
        if (idx >= 0 && idx < userNodes.length) {
          indicesToDelete.push(indexMapping[idx]);
        }
      }
    } else if (target.type === 'id') {
      for (const id of target.values) {
        const foundIdx = allSubscriptions.findIndex((s) => s.id === id);
        if (foundIdx !== -1 && indexMapping.includes(foundIdx)) {
          indicesToDelete.push(foundIdx);
        }
      }
    }

    if (indicesToDelete.length === 0) {
      await sendTelegramMessage(chatId, '❌ 未找到指定的节点', env);
      return;
    }

    // 收集要删除的 ID
    const deletedIds = [];
    for (const idx of indicesToDelete) {
      if (allSubscriptions[idx]) {
        deletedIds.push(allSubscriptions[idx].id);
      }
    }

    // 删除节点（从后往前删除以保持索引正确）
    indicesToDelete.sort((a, b) => b - a);
    const deletedNames = [];
    for (const idx of indicesToDelete) {
      deletedNames.push(allSubscriptions[idx].name);
      allSubscriptions.splice(idx, 1);
    }

    await storageAdapter.putAllSubscriptions(allSubscriptions);

    // 3. 清理订阅组中的引用
    try {
      const profiles = await storageAdapter.getAllProfiles();
      if (profiles.length > 0) {
        let profilesUpdated = false;
        const idsToRemove = new Set(deletedIds);

        profiles.forEach((profile) => {
          // 清理 manualNodes
          if (Array.isArray(profile.manualNodes)) {
            const prevLen = profile.manualNodes.length;
            profile.manualNodes = profile.manualNodes.filter((id) => !idsToRemove.has(id));
            if (profile.manualNodes.length !== prevLen) profilesUpdated = true;
          }
          // 清理 subscriptions
          if (Array.isArray(profile.subscriptions)) {
            const prevLen = profile.subscriptions.length;
            profile.subscriptions = profile.subscriptions.filter((id) => !idsToRemove.has(id));
            if (profile.subscriptions.length !== prevLen) profilesUpdated = true;
          }
        });

        if (profilesUpdated) {
          await storageAdapter.putAllProfiles(profiles);
          console.info(`[Telegram Push] Cleaned up ${deletedIds.length} node references from profiles`);
        }
      }
    } catch (cleanupError) {
      console.error('[Telegram Push] Cleanup profiles error:', cleanupError);
    }

    let message = `✅ <b>已删除 ${deletedNames.length} 个节点</b>\n\n`;
    if (deletedNames.length <= 5) {
      deletedNames.reverse().forEach((name) => {
        message += `• ${name}\n`;
      });
    }

    await sendTelegramMessage(chatId, message, env);
    console.info(`[Telegram Push] User ${userId} deleted ${deletedNames.length} nodes`);
  } catch (error) {
    console.error('[Telegram Push] Delete command failed:', error);
    await sendTelegramMessage(chatId, `❌ 删除失败: ${error.message}`, env);
  }
}

/**
 * 处理 /enable 命令
 */
export async function handleEnableCommand(chatId, userId, args, env) {
  await handleToggleCommand(chatId, userId, args, env, true);
}

/**
 * 处理 /disable 命令
 */
export async function handleDisableCommand(chatId, userId, args, env) {
  await handleToggleCommand(chatId, userId, args, env, false);
}

/**
 * 切换节点启用状态
 */
export async function handleToggleCommand(chatId, userId, args, env, enable) {
  try {
    const target = parseTargetArgs(args);
    const action = enable ? '启用' : '禁用';
    const icon = enable ? '✅' : '⛔';

    if (target.type === 'none') {
      await sendTelegramMessage(
        chatId,
        `❌ <b>请指定要${action}的节点</b>\n\n` +
          `用法：\n` +
          `/${enable ? 'enable' : 'disable'} 1 - ${action}第1个\n` +
          `/${enable ? 'enable' : 'disable'} 1,3,5 - ${action}多个\n` +
          `/${enable ? 'enable' : 'disable'} all - ${action}全部`,
        env,
      );
      return;
    }

    const { allSubscriptions, userNodes, indexMapping, storageAdapter } = await getNodesWithMapping(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, `📋 暂无可${action}的节点`, env);
      return;
    }

    let indicesToToggle = [];

    if (target.type === 'all') {
      indicesToToggle = [...indexMapping];
    } else if (target.type === 'index') {
      for (const idx of target.values) {
        if (idx >= 0 && idx < userNodes.length) {
          indicesToToggle.push(indexMapping[idx]);
        }
      }
    }

    if (indicesToToggle.length === 0) {
      await sendTelegramMessage(chatId, '❌ 未找到指定的节点', env);
      return;
    }

    const toggledNames = [];
    for (const idx of indicesToToggle) {
      allSubscriptions[idx].enabled = enable;
      toggledNames.push(allSubscriptions[idx].name);
    }

    await storageAdapter.putAllSubscriptions(allSubscriptions);

    let message = `${icon} <b>已${action} ${toggledNames.length} 个节点</b>\n\n`;
    if (toggledNames.length <= 5) {
      toggledNames.forEach((name) => {
        message += `• ${name}\n`;
      });
    }

    await sendTelegramMessage(chatId, message, env);
  } catch (error) {
    console.error(`[Telegram Push] Toggle command failed:`, error);
    await sendTelegramMessage(chatId, `❌ ${enable ? '启用' : '禁用'}失败: ${error.message}`, env);
  }
}

/**
 * 处理 /rename 命令
 */
export async function handleRenameCommand(chatId, userId, args, env) {
  try {
    if (args.length < 2) {
      await sendTelegramMessage(
        chatId,
        '✏️ <b>重命名节点</b>\n\n' + '用法：/rename [序号] [新名称]\n\n' + '示例：/rename 1 香港节点01',
        env,
      );
      return;
    }

    const idx = parseInt(args[0]) - 1;
    const newName = args.slice(1).join(' ').trim();

    if (isNaN(idx) || idx < 0) {
      await sendTelegramMessage(chatId, '❌ 请输入有效的序号', env);
      return;
    }

    if (!newName) {
      await sendTelegramMessage(chatId, '❌ 请输入新名称', env);
      return;
    }

    const { allSubscriptions, userNodes, indexMapping, storageAdapter } = await getNodesWithMapping(userId, env);

    if (idx >= userNodes.length) {
      await sendTelegramMessage(chatId, `❌ 序号超出范围（共 ${userNodes.length} 个节点）`, env);
      return;
    }

    const allIdx = indexMapping[idx];
    const oldName = allSubscriptions[allIdx].name;
    allSubscriptions[allIdx].name = newName;

    await saveSingleSubscription(storageAdapter, allSubscriptions[allIdx], allSubscriptions);

    await sendTelegramMessage(chatId, `✅ <b>重命名成功</b>\n\n` + `原名称：${oldName}\n` + `新名称：${newName}`, env);
  } catch (error) {
    console.error('[Telegram Push] Rename command failed:', error);
    await sendTelegramMessage(chatId, `❌ 重命名失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /import 命令 - 导入节点
 */
export async function handleImportCommand(chatId, userId, args, env) {
  try {
    if (args.length === 0) {
      await sendTelegramMessage(
        chatId,
        '📥 <b>导入节点</b>\n\n' +
          '用法：/import <Base64 或订阅链接>\n\n' +
          '支持：\n' +
          '• Base64 编码的节点\n' +
          '• 订阅链接（http/https）\n\n' +
          '示例：\n' +
          '/import c3M6Ly9...\n' +
          '/import https://example.com/sub',
        env,
      );
      return;
    }

    const input = args.join(' ').trim();
    let nodeUrls = [];

    // 判断是订阅链接还是 Base64
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // 获取订阅内容
      await sendTelegramMessage(chatId, '⏳ 正在获取订阅内容...', env);

      try {
        const response = await fetch(input, {
          method: 'GET',
          headers: {
            'User-Agent': 'v2rayN/7.23',
            Accept: '*/*',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const content = await response.text();

        // 尝试 Base64 解码
        try {
          const decoded = base64ToUtf8(content.trim());
          nodeUrls = extractNodeUrls(decoded);
        } catch {
          // 直接尝试提取
          nodeUrls = extractNodeUrls(content);
        }
      } catch (fetchError) {
        await sendTelegramMessage(chatId, `❌ 获取订阅失败: ${fetchError.message}`, env);
        return;
      }
    } else {
      // 尝试 Base64 解码
      try {
        const decoded = base64ToUtf8(input);
        nodeUrls = extractNodeUrls(decoded);
      } catch {
        // 直接尝试提取
        nodeUrls = extractNodeUrls(input);
      }
    }

    if (nodeUrls.length === 0) {
      await sendTelegramMessage(chatId, '❌ 未识别到有效的节点链接', env);
      return;
    }

    // 添加节点
    const storageAdapter = await getStorageAdapter(env);
    const allSubscriptions = await storageAdapter.getAllSubscriptions();

    const addedNodes = [];
    for (const url of nodeUrls) {
      const node = {
        id: generateId(),
        name: extractNodeName(url),
        url: url,
        enabled: true,
        source: 'telegram',
        telegram_user_id: userId,
        created_at: new Date().toISOString(),
      };
      allSubscriptions.unshift(node);
      addedNodes.push(node);
    }

    await storageAdapter.putAllSubscriptions(allSubscriptions);

    await sendTelegramMessage(
      chatId,
      `✅ <b>导入成功</b>\n\n成功导入 ${addedNodes.length} 个节点\n\n发送 /list 查看列表`,
      env,
    );

    console.info(`[Telegram Push] User ${userId} imported ${addedNodes.length} nodes`);
  } catch (error) {
    console.error('[Telegram Push] Import command failed:', error);
    await sendTelegramMessage(chatId, `❌ 导入失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /sort 命令 - 节点排序
 */
export async function handleSortCommand(chatId, userId, args, env) {
  try {
    const sortType = args[0]?.toLowerCase() || '';

    if (!sortType || !['name', 'protocol', 'time', 'status'].includes(sortType)) {
      await sendTelegramMessage(
        chatId,
        '🔄 <b>节点排序</b>\n\n' +
          '用法：/sort <类型>\n\n' +
          '类型：\n' +
          '• name - 按名称排序\n' +
          '• protocol - 按协议排序\n' +
          '• time - 按时间排序\n' +
          '• status - 按状态排序',
        env,
      );
      return;
    }

    const { allSubscriptions, userNodes, indexMapping, storageAdapter } = await getNodesWithMapping(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, '📋 暂无可排序的节点', env);
      return;
    }

    // 创建排序映射
    const sortedIndices = [...Array(userNodes.length).keys()];

    switch (sortType) {
      case 'name':
        sortedIndices.sort((a, b) => userNodes[a].name.localeCompare(userNodes[b].name, 'zh-CN'));
        break;
      case 'protocol':
        sortedIndices.sort((a, b) => {
          const pa = userNodes[a].url.split('://')[0];
          const pb = userNodes[b].url.split('://')[0];
          return pa.localeCompare(pb);
        });
        break;
      case 'time':
        sortedIndices.sort((a, b) => {
          const ta = new Date(userNodes[a].created_at || 0).getTime();
          const tb = new Date(userNodes[b].created_at || 0).getTime();
          return tb - ta; // 新的在前
        });
        break;
      case 'status':
        sortedIndices.sort((a, b) => {
          return (userNodes[b].enabled ? 1 : 0) - (userNodes[a].enabled ? 1 : 0);
        });
        break;
    }

    // 重新排列节点
    const sortedNodes = sortedIndices.map((i) => userNodes[i]);

    // 从 allSubscriptions 中移除用户节点
    const indicesToRemove = [...indexMapping].sort((a, b) => b - a);
    for (const idx of indicesToRemove) {
      allSubscriptions.splice(idx, 1);
    }

    // 将排序后的节点添加回去
    allSubscriptions.unshift(...sortedNodes);

    await storageAdapter.putAllSubscriptions(allSubscriptions);

    const sortNames = { name: '名称', protocol: '协议', time: '时间', status: '状态' };
    await sendTelegramMessage(
      chatId,
      `✅ <b>排序完成</b>\n\n已按${sortNames[sortType]}排序 ${userNodes.length} 个节点`,
      env,
    );
  } catch (error) {
    console.error('[Telegram Push] Sort command failed:', error);
    await sendTelegramMessage(chatId, `❌ 排序失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /dup 命令 - 去重检测
 */
export async function handleDupCommand(chatId, userId, args, env) {
  try {
    const action = args[0]?.toLowerCase() || '';

    const { allSubscriptions, userNodes, indexMapping, storageAdapter } = await getNodesWithMapping(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, '📋 暂无节点', env);
      return;
    }

    // 检测重复（基于 URL）
    const urlMap = new Map();
    const duplicates = [];

    userNodes.forEach((node, idx) => {
      const url = node.url;
      if (urlMap.has(url)) {
        duplicates.push({ idx, node, originalIdx: urlMap.get(url) });
      } else {
        urlMap.set(url, idx);
      }
    });

    if (duplicates.length === 0) {
      await sendTelegramMessage(chatId, '✅ <b>未发现重复节点</b>\n\n所有节点链接都是唯一的', env);
      return;
    }

    if (action === 'clean' || action === 'remove') {
      // 自动清理重复
      const indicesToDelete = duplicates.map((d) => indexMapping[d.idx]).sort((a, b) => b - a);

      for (const idx of indicesToDelete) {
        allSubscriptions.splice(idx, 1);
      }

      await storageAdapter.putAllSubscriptions(allSubscriptions);

      await sendTelegramMessage(chatId, `✅ <b>去重完成</b>\n\n已删除 ${duplicates.length} 个重复节点`, env);
    } else {
      // 显示重复信息
      let message = `🔍 <b>发现 ${duplicates.length} 个重复节点</b>\n\n`;

      duplicates.slice(0, 5).forEach(({ idx, node, originalIdx }) => {
        message += `• #${idx + 1} 与 #${originalIdx + 1} 重复\n`;
        message += `  ${node.name}\n`;
      });

      if (duplicates.length > 5) {
        message += `\n... 还有 ${duplicates.length - 5} 个重复`;
      }

      message += '\n\n发送 /dup clean 自动清理重复';

      const keyboard = {
        inline_keyboard: [[{ text: '🗑️ 清理重复节点', callback_data: 'cmd_dup_clean' }]],
      };

      await sendTelegramMessage(chatId, message, env, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('[Telegram Push] Dup command failed:', error);
    await sendTelegramMessage(chatId, `❌ 去重检测失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /bind 命令 - 绑定默认订阅组
 */
export async function handleBindCommand(chatId, userId, args, env, requestCache = null) {
  try {
    const cache = requestCache || createRequestCache();
    const profiles = await getCachedProfiles(env, cache);
    const settings = await getCachedSettings(env, cache);
    const config = settings.telegram_push_config || {};

    // 没有参数时列出订阅组
    if (args.length === 0) {
      if (profiles.length === 0) {
        await sendTelegramMessage(chatId, '📋 暂无订阅组\n\n请在 Web 界面创建', env, {
          requestCache,
        });
        return;
      }

      let message = '🔗 <b>绑定订阅组</b>\n\n';
      message += '当前绑定: ';

      const currentProfileId = getUserBoundProfileId(config, userId);
      if (currentProfileId) {
        const current = profiles.find((p) => p.id === currentProfileId);
        message += current ? `<b>${current.name}</b>` : '(已失效)';
      } else {
        message += '无';
      }

      message += '\n\n可用订阅组:\n';
      profiles.forEach((p, i) => {
        const isCurrent = p.id === currentProfileId;
        message += `${isCurrent ? '✅' : ''} ${i + 1}. ${p.name}\n`;
      });
      message += '\n用法: /bind [序号]';

      // 生成快捷按钮
      const buttons = profiles.slice(0, 6).map((p, i) => ({
        text: `${i + 1}. ${p.name.substring(0, 8)}`,
        callback_data: `bind_profile_${p.id}`,
      }));

      const keyboard = {
        inline_keyboard: [
          buttons.slice(0, 3),
          buttons.slice(3, 6),
          [{ text: '❌ 解除绑定', callback_data: 'unbind_profile' }],
        ].filter((row) => row.length > 0),
      };

      await sendTelegramMessage(chatId, message, env, {
        reply_markup: keyboard,
        requestCache,
      });
      return;
    }

    // 绑定指定订阅组
    const idx = parseInt(args[0]) - 1;
    if (isNaN(idx) || idx < 0 || idx >= profiles.length) {
      await sendTelegramMessage(chatId, '❌ 无效的序号', env, { requestCache });
      return;
    }

    const targetProfile = profiles[idx];

    // 更新配置
    setUserBoundProfileId(config, userId, targetProfile.id);
    config.auto_bind = true;
    settings.telegram_push_config = config;
    cache.settings = settings;
    await persistCachedSettings(env, cache);

    await sendTelegramMessage(
      chatId,
      `✅ <b>绑定成功</b>\n\n` + `已绑定到: <b>${targetProfile.name}</b>\n\n` + `之后添加的节点将自动关联到此订阅组`,
      env,
      { requestCache },
    );
  } catch (error) {
    console.error('[Telegram Push] Bind command failed:', error);
    await sendTelegramMessage(chatId, `❌ 绑定失败: ${escapeHtml(error.message)}`, env, {
      requestCache,
    });
  }
}

/**
 * 处理 /unbind 命令 - 解除绑定
 */
export async function handleUnbindCommand(chatId, userId, env, requestCache = null) {
  try {
    const cache = requestCache || createRequestCache();
    const settings = await getCachedSettings(env, cache);
    const config = settings.telegram_push_config || {};

    if (!getUserBoundProfileId(config, userId)) {
      await sendTelegramMessage(chatId, '📋 当前未绑定任何订阅组', env);
      return;
    }

    setUserBoundProfileId(config, userId, '');
    settings.telegram_push_config = config;
    cache.settings = settings;
    await persistCachedSettings(env, cache);

    await sendTelegramMessage(chatId, '✅ <b>解除绑定成功</b>\n\n' + '之后添加的节点将不再自动关联订阅组', env);
  } catch (error) {
    console.error('[Telegram Push] Unbind command failed:', error);
    await sendTelegramMessage(chatId, `❌ 解除绑定失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理节点输入（核心逻辑）
 */
export async function handleNodeInput(chatId, text, userId, env, requestCache = null, options = {}) {
  // 同一批导入的节点共用一个批次标签（文件导入用文件名，文本导入用时间）
  const importTagName = options.tagName || buildImportTagName(options);
  try {
    const cache = requestCache || createRequestCache();
    const config = await getTelegramPushConfig(env, cache);

    // 检查频率限制
    const rateLimitCheck = await checkRateLimit(userId, env, config);
    if (!rateLimitCheck.allowed) {
      await sendTelegramMessage(chatId, `❌ ${rateLimitCheck.reason}`, env);
      return createJsonResponse({ ok: true });
    }

    // 1. 尝试提取节点链接 (SS, VLESS 等)
    let nodeUrls = extractNodeUrls(text);
    let importType = 'node';

    // 2. 提取订阅链接（支持一条消息里多行/多个订阅链接）
    const subscriptionUrls = extractSubscriptionUrls(text).filter((url) => !nodeUrls.includes(url));

    if (nodeUrls.length > 0 && subscriptionUrls.length > 0) {
      // 节点与订阅混发：订阅链接优先按订阅导入，节点单独导入
      importType = 'mixed';
    } else if (nodeUrls.length === 0 && subscriptionUrls.length > 0) {
      importType = 'subscription';
    }

    if (nodeUrls.length === 0 && subscriptionUrls.length === 0) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>未识别到有效的链接</b>\n\n' +
          '支持的内容：\n' +
          '1. 节点链接 (SS, VMess, VLESS, Hysteria, etc.)\n' +
          '2. 订阅链接 (HTTP/HTTPS) — <b>可一条消息发多个，每行一个</b>\n\n' +
          '发送 /help 查看使用帮助',
        env,
      );
      return createJsonResponse({ ok: true });
    }

    const storageAdapter = await getCachedStorageAdapter(env, cache);
    const allSubscriptions = await getCachedSubscriptions(env, cache);

    // 3. 批量处理与去重
    // 订阅链接与节点链接一并处理：订阅（http/https）存为订阅源，节点存为手动节点，
    // 前端通过 URL 协议区分。这样「一条消息发多个订阅链接」可一次全部导入。
    const allUrls = importType === 'subscription' ? [...subscriptionUrls] : [...subscriptionUrls, ...nodeUrls];
    const addedNodes = [];
    const ignoredUrls = [];

    for (const url of allUrls) {
      // 去重检测
      const exists = allSubscriptions.some((sub) => sub.url === url);
      if (exists) {
        ignoredUrls.push(url);
        continue;
      }

      const isSubscription = /^https?:\/\//i.test(url);
      const defaultName = isSubscription ? `订阅源 ${new URL(url).hostname}` : extractNodeName(url);

      const node = {
        id: generateId(),
        name: defaultName,
        url: url,
        enabled: true,
        source: 'telegram',
        // 同一批导入的节点赋予同一标签，便于在网页端按标签筛选和管理
        tags: importTagName ? [importTagName] : [],
        telegram_user_id: userId,
        created_at: new Date().toISOString(),
      };

      // 注意：MiSub 中手动节点与远程订阅由 D1StorageAdapter 按 URL 协议自动分表存储
      // 前端通过 URL 格式区分是“手动节点”还是“订阅源”
      // 订阅源 -> type: subscription or implied by http protocol

      allSubscriptions.unshift(node);
      addedNodes.push(node);
    }

    if (addedNodes.length === 0) {
      await sendTelegramMessage(
        chatId,
        `⚠️ <b>未添加任何节点</b>\n\n` + `检测到 ${ignoredUrls.length} 个重复链接，已自动忽略。`,
        env,
      );
      return createJsonResponse({ ok: true });
    }

    await storageAdapter.putAllSubscriptions(allSubscriptions);

    try {
      const verifySubs = await storageAdapter.getAllSubscriptions();
      const isVerified = addedNodes.every((added) => verifySubs.some((s) => s.id === added.id));
      if (!isVerified) {
        console.warn('[Telegram Push] D1 Verification failed');
        throw new Error('D1 Write Verification Failed. Please try again.');
      }
    } catch (verifyError) {
      console.error('[Telegram Push] D1 Verification error:', verifyError);
      if (verifyError.message.includes('Verification Failed')) throw verifyError;
    }

    // 4. 自动关联到订阅组 (分类处理)
    let boundProfileName = '';
    const boundProfileId = getUserBoundProfileId(config, userId);
    if (boundProfileId) {
      const profiles = await storageAdapter.getAllProfiles();
      const targetProfile = profiles.find((p) => p.id === boundProfileId);

      if (targetProfile) {
        // 分类 ID
        const subIds = addedNodes.filter((n) => /^https?:\/\//i.test(n.url)).map((n) => n.id);
        const nodeIds = addedNodes.filter((n) => !/^https?:\/\//i.test(n.url)).map((n) => n.id);

        let updated = false;

        if (nodeIds.length > 0) {
          targetProfile.manualNodes = targetProfile.manualNodes || [];
          targetProfile.manualNodes.push(...nodeIds);
          updated = true;
        }

        if (subIds.length > 0) {
          targetProfile.subscriptions = targetProfile.subscriptions || [];
          targetProfile.subscriptions.push(...subIds);
          updated = true;
        }

        if (updated) {
          await saveSingleProfile(storageAdapter, targetProfile, profiles);
          boundProfileName = targetProfile.name;
        }
      }
    }

    // 5. 清除节点缓存，确保 Bot 新增/关联的节点能立即出现在实际订阅输出中
    try {
      const cacheResult = await clearAllNodeCaches(storageAdapter);
      console.info(`[Telegram Push] Cleared ${cacheResult?.cleared ?? 0} node caches after node import`);
    } catch (cacheError) {
      console.warn('[Telegram Push] Failed to clear node caches after node import:', cacheError?.message || cacheError);
    }

    // 6. 发送反馈消息
    let message;
    const totalIgnored = ignoredUrls.length;
    const ignoreMsg = totalIgnored > 0 ? `\n⚠️ 已跳过 ${totalIgnored} 个重复链接` : '';

    if (addedNodes.length === 1) {
      const node = addedNodes[0];
      const isSub = /^https?:\/\//i.test(node.url);
      const typeLabel = isSub ? '📡 订阅源' : '🚀 节点';

      message =
        `✅ <b>${typeLabel}添加成功！</b>\n\n` +
        `📋 信息：\n` +
        `• 名称: ${escapeHtml(node.name)}\n` +
        // 对于订阅源显示域名，对于节点显示协议
        `• 类型: ${isSub ? new URL(node.url).hostname : node.url.split('://')[0].toUpperCase()}`;

      if (boundProfileName) {
        message += `\n• 已关联: ${escapeHtml(boundProfileName)}`;
      }
      message += ignoreMsg;
      message += `\n\n💡 发送 /list 查看列表`;
    } else {
      message = `✅ <b>成功添加 ${addedNodes.length} 个项目</b>${ignoreMsg}\n\n`;
      addedNodes.slice(0, 5).forEach((node, index) => {
        const isSub = /^https?:\/\//i.test(node.url);
        const label = isSub ? '[订阅]' : `[${node.url.split('://')[0].toUpperCase()}]`;
        message += `${index + 1}. ${escapeHtml(node.name)} ${label}\n`;
      });
      if (addedNodes.length > 5) {
        message += `... 等 ${addedNodes.length} 个\n`;
      }
      if (boundProfileName) {
        message += `\n🔗 已关联到: ${escapeHtml(boundProfileName)}`;
      }
      message += `\n📋 发送 /list 查看完整列表`;
    }

    await sendTelegramMessage(chatId, message, env);
    console.info(`[Telegram Push] User ${userId} added ${addedNodes.length} items (Ignored ${totalIgnored})`);

    return createJsonResponse({ ok: true });
  } catch (error) {
    console.error('[Telegram Push] Node addition failed:', error);
    await sendTelegramMessage(chatId, `❌ <b>添加失败</b>\n\n错误: ${escapeHtml(error.message)}`, env);
    return createJsonResponse({ ok: true });
  }
}
