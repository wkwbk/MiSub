/**
 * Telegram Bot 只读查询类命令处理器
 */

import { utf8ToBase64 } from '../../../../shared/base64.js';
import { escapeHtml } from '../../utils.js';
import { createRequestCache, getCachedProfiles, getCachedSettings, } from './storage.js';
import { editTelegramMessage, sendTelegramMessage } from './client.js';
import { getUserBoundProfileId } from './auth.js';
import { getTelegramItemTags, parseTargetArgs } from './utils.js';
import { getUserNodes } from './node-queries.js';

/**
 * 处理 /start 命令
 */
export async function handleStartCommand(chatId, env) {
  const message =
    '👋 <b>欢迎使用 MiSub Telegram Bot！</b>\n\n' +
    '通过这个 Bot，你可以：\n' +
    '• 📤 快速添加代理节点\n' +
    '• 📋 管理你的节点列表\n' +
    '• 🔗 获取订阅链接\n\n' +
    '直接发送节点链接即可添加，支持批量添加。\n\n' +
    '发送 /help 查看完整命令列表\n' +
    '发送 /menu 打开快捷菜单';

  await sendTelegramMessage(chatId, message, env);
}

/**
 * 处理 /help 命令
 */
export async function handleHelpCommand(chatId, env) {
  const message =
    '📖 <b>MiSub Bot 命令帮助</b>\n\n' +
    '<b>📤 添加节点</b>\n' +
    '直接发送节点链接（支持批量）\n\n' +
    '<b>📋 查看</b>\n' +
    '/list - 选择节点列表 / 机场列表\n' +
    '/stats - 统计信息\n' +
    '/info [序号] - 节点详情\n' +
    '/search [词] - 搜索节点\n\n' +
    '<b>✏️ 编辑</b>\n' +
    '/enable [序号] - 启用\n' +
    '/disable [序号] - 禁用\n' +
    '/rename [序号] [名] - 重命名\n' +
    '/delete [序号] - 删除\n\n' +
    '<b>🔧 工具</b>\n' +
    '/tags [node|sub] - 标签管理\n' +
    '/trename [旧标] [新标] - 重命名标签\n' +
    '/bind - 绑定订阅组\n' +
    '/sort [类型] - 排序\n' +
    '/dup - 去重\n' +
    '/copy [序号] - 复制链接\n' +
    '/menu - 快捷菜单\n\n' +
    '💡 序号支持：1 | 1,3,5 | all';

  await sendTelegramMessage(chatId, message, env);
}

/**
 * 处理 /menu 命令 - 快捷菜单
 */
export async function handleMenuCommand(chatId, env, messageId = null, requestCache = null) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '\uD83D\uDE80 节点列表', callback_data: 'cmd_list_node' }, // 🚀
        { text: '\uD83D\uDCE1 机场列表', callback_data: 'cmd_list_sub' }, // 📡
        { text: '\uD83D\uDCCA 统计', callback_data: 'cmd_stats' }, // 📊
      ],
      [
        { text: '🏷️ 标签管理', callback_data: 'tmls_node' },
        { text: '\uD83D\uDD17 绑定', callback_data: 'cmd_bind' }, // 🔗
        { text: '\uD83D\uDD0D 搜索', callback_data: 'prompt_search' }, // 🔍
      ],
      [{ text: '\u2753 帮助', callback_data: 'cmd_help' }], // ❓
      [
        { text: '\u2705 全启用', callback_data: 'cmd_enable_all' }, // ✅
        { text: '\u26D4 全禁用', callback_data: 'cmd_disable_all' }, // ⛔
      ],
      [
        { text: '\uD83D\uDDD1\uFE0F 清空', callback_data: 'confirm_delete_all' }, // 🗑️
      ],
    ],
  };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, '📱 <b>快捷菜单</b>', env, {
      requestCache,
      reply_markup: keyboard,
    });
  } else {
    await sendTelegramMessage(chatId, '📱 <b>快捷菜单</b>', env, {
      requestCache,
      reply_markup: keyboard,
    });
  }
}

/**
 * 处理 /list 命令 - 节点列表（带分页和操作按钮）
 */
export async function handleListCommand(
  chatId,
  userId,
  env,
  page = 0,
  type = 'all',
  messageId = null,
  requestCache = null,
  tagFilter = null,
) {
  try {
    const cache = requestCache || createRequestCache();
    const allNodes = await getUserNodes(userId, env);
    const profiles = await getCachedProfiles(env, cache);
    const settings = await getCachedSettings(env, cache);
    const config = settings.telegram_push_config || {};

    // 过滤节点
    let userNodes = allNodes;
    let title = '列表';
    if (type === 'node') {
      userNodes = allNodes.filter((n) => !/^https?:\/\//i.test(n.url || ''));
      title = '\uD83D\uDE80 节点列表'; // 🚀
    } else if (type === 'sub') {
      userNodes = allNodes.filter((n) => /^https?:\/\//i.test(n.url || ''));
      title = '\uD83D\uDCE1 机场列表'; // 📡
    }

    // 按标签过滤（null = 不过滤，'__none__' = 仅无标签）
    if (tagFilter === '__none__') {
      userNodes = userNodes.filter((n) => getTelegramItemTags(n).length === 0);
      title += ' · 无标签';
    } else if (tagFilter) {
      userNodes = userNodes.filter((n) => getTelegramItemTags(n).includes(tagFilter));
      title += ` · ${tagFilter}`;
    }

    // 获取当前绑定的订阅组
    const boundProfileId = getUserBoundProfileId(config, userId);
    const boundProfile = boundProfileId ? profiles.find((p) => p.id === boundProfileId) : null;
    const boundNodeIds = new Set(boundProfile?.manualNodes || []);

    if (userNodes.length === 0) {
      let emptyMsg = `\uD83D\uDCCB <b>暂无${type === 'sub' ? '机场订阅' : type === 'node' ? '节点' : '资源'}</b>\n\n`; // 📋
      if (type === 'sub') emptyMsg += '发送包含 http/https 的链接即可添加机场订阅';
      else emptyMsg += '直接发送 ss/vless 等链接即可添加节点';

      if (messageId) {
        // Add back button even for empty list
        const keyboard = {
          inline_keyboard: [[{ text: '🔙 返回菜单', callback_data: 'cmd_menu' }]],
        };
        await editTelegramMessage(chatId, messageId, emptyMsg, env, {
          reply_markup: keyboard,
        });
      } else {
        await sendTelegramMessage(chatId, emptyMsg, env);
      }
      return;
    }

    const pageSize = 6; // 减少每页数量以容纳更多信息
    const totalPages = Math.ceil(userNodes.length / pageSize);
    const currentPage = Math.min(Math.max(0, page), totalPages - 1);
    const startIdx = currentPage * pageSize;
    const endIdx = Math.min(startIdx + pageSize, userNodes.length);

    let message = `\uD83D\uDCCB <b>${title}</b> (${userNodes.length} 个)\n`; // 📋
    message += `第 ${currentPage + 1}/${totalPages} 页`;
    if (boundProfile) {
      message += ` | 绑定: ${escapeHtml(boundProfile.name)}`;
    }
    message += '\n\n';

    for (let i = startIdx; i < endIdx; i++) {
      const node = userNodes[i];
      const nodeUrl = node.url || '';
      const isSub = /^https?:\/\//i.test(nodeUrl);

      let protocol = '未知';
      if (isSub) {
        protocol = '订阅';
      } else if (nodeUrl.includes('://')) {
        try {
          protocol = nodeUrl.split('://')[0].toUpperCase();
        } catch (e) {
          protocol = 'UNKNOWN';
        }
      }

      const status = node.enabled ? '\u2705' : '\u26D4'; // ✅ ⛔
      const inProfile = boundNodeIds.has(node.id) ? '\uD83D\uDD17' : ''; // 🔗
      const typeIcon = isSub ? '\uD83D\uDCE1 ' : '\uD83D\uDE80 '; // 📡 🚀

      message += `<b>${i + 1}.</b> ${status}${inProfile} ${typeIcon}${escapeHtml(node.name || '未命名')} <code>${protocol}</code>\n`;
    }

    message += '\n点击序号查看详情和操作';

    // 构建按钮：当前页节点的快捷按钮
    const nodeButtons = [];
    for (let i = startIdx; i < endIdx; i++) {
      const isSubList = type === 'sub';
      // 如果是混合列表('all'), 检测URL; 如果明确是 'sub', 则就是sub.
      // 但 handleListCommand 的 type 参数已经区分了 'node', 'sub', 'all'.
      // 这里我们尽量明确:
      const actionPrefix =
        type === 'sub' || (type === 'all' && /^https?:\/\//i.test(userNodes[i].url || ''))
          ? 'node_action_sub_'
          : 'node_action_node_';

      nodeButtons.push({
        text: `${i + 1}`,
        callback_data: `${actionPrefix}${i}`,
      });
    }

    // 分页按钮
    const navButtons = [];
    const typePrefix = type !== 'all' ? `${type}_` : '';

    if (currentPage > 0) {
      navButtons.push({
        text: '\u2B05\uFE0F',
        callback_data: `list_page_${typePrefix}${currentPage - 1}`,
      }); // ⬅️
    }

    // Add Back button in the middle or separate row?
    // Let's put pagination < > on one row, and Back on another or same?
    // Standard: <  Page  >
    // Row 2: Back

    navButtons.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' });

    if (currentPage < totalPages - 1) {
      navButtons.push({
        text: '\u27A1\uFE0F',
        callback_data: `list_page_${typePrefix}${currentPage + 1}`,
      }); // ➡️
    }

    const backButtonRow = [
      { text: '🔙 返回标签', callback_data: `cmd_list_${type === 'sub' ? 'sub' : 'node'}` },
      { text: '🏠 菜单', callback_data: 'cmd_menu' },
    ];

    const keyboard = {
      inline_keyboard: [nodeButtons, navButtons, backButtonRow],
    };

    if (messageId) {
      await editTelegramMessage(chatId, messageId, message, env, { reply_markup: keyboard });
    } else {
      await sendTelegramMessage(chatId, message, env, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('[Telegram Push] List command failed:', error);
    await sendTelegramMessage(chatId, `\u274C 获取列表失败: ${error.message}`, env); // ❌
  }
}

export async function handleListTypeSelector(chatId, env, messageId = null, requestCache = null) {
  const message =
    '📋 <b>请选择列表类型</b>\n\n' +
    '🚀 节点列表：手动添加的代理节点\n' +
    '📡 机场列表：HTTP/HTTPS 机场订阅源\n\n' +
    '节点和机场订阅分开管理，避免序号混淆。';
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 节点列表', callback_data: 'cmd_list_node' },
        { text: '📡 机场列表', callback_data: 'cmd_list_sub' },
      ],
      [{ text: '🔙 返回菜单', callback_data: 'cmd_menu' }],
    ],
  };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, message, env, {
      requestCache,
      reply_markup: keyboard,
    });
  } else {
    await sendTelegramMessage(chatId, message, env, { requestCache, reply_markup: keyboard });
  }
}

/**
 * 处理 /stats 命令
 */
export async function handleStatsCommand(chatId, userId, env, requestCache = null) {
  try {
    const userNodes = await getUserNodes(userId, env);

    let subCount = 0;
    let nodeCount = 0;
    let enabledCount = 0;
    const protocolCounts = {};

    userNodes.forEach((node) => {
      const isSub = /^https?:\/\//i.test(node.url);

      if (isSub) {
        subCount++;
      } else {
        nodeCount++;
        const protocol = node.url.split('://')[0].toUpperCase();
        protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
      }

      if (node.enabled) enabledCount++;
    });

    const disabledCount = userNodes.length - enabledCount;

    let message = `\uD83D\uDCCA <b>统计信息</b>\n\n`; // 📊
    message += `资源总数: <b>${userNodes.length}</b>\n`;
    message += `├─ 订阅源: <b>${subCount}</b>\n`;
    message += `└─ 手动节点: <b>${nodeCount}</b>\n\n`;

    message += `状态:\n`;
    message += `\u2705 已启用: <b>${enabledCount}</b>\n`; // ✅
    message += `\u26D4 已禁用: <b>${disabledCount}</b>\n\n`; // ⛔

    if (Object.keys(protocolCounts).length > 0) {
      message += `<b>节点协议分布：</b>\n`;
      Object.entries(protocolCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([protocol, count]) => {
          message += `• ${protocol}: ${count}\n`;
        });
    }

    await sendTelegramMessage(chatId, message, env, { requestCache });
  } catch (error) {
    console.error('[Telegram Push] Stats command failed:', error);
    await sendTelegramMessage(chatId, `\u274C 获取统计失败: ${error.message}`, env, {
      requestCache,
    }); // ❌
  }
}

/**
 * 处理 /search 命令
 */
export async function handleSearchCommand(chatId, userId, args, env) {
  try {
    const keyword = args.join(' ').trim();

    if (!keyword) {
      await sendTelegramMessage(
        chatId,
        '🔍 <b>搜索节点</b>\n\n' +
          '用法：/search <关键词>\n\n' +
          '示例：\n' +
          '/search 香港\n' +
          '/search vmess\n' +
          '/search HK',
        env,
      );
      return;
    }

    const userNodes = await getUserNodes(userId, env);
    const lowerKeyword = keyword.toLowerCase();

    const results = userNodes.filter((node, idx) => {
      const protocol = node.url.split('://')[0].toLowerCase();
      return node.name.toLowerCase().includes(lowerKeyword) || protocol.includes(lowerKeyword);
    });

    if (results.length === 0) {
      await sendTelegramMessage(chatId, `🔍 未找到包含 "<b>${keyword}</b>" 的节点`, env);
      return;
    }

    let message = `🔍 <b>搜索结果</b>：${results.length} 个\n\n`;

    results.slice(0, 10).forEach((node, i) => {
      const protocol = node.url.split('://')[0].toUpperCase();
      const status = node.enabled ? '✅' : '⛔';
      const originalIdx = userNodes.indexOf(node) + 1;
      message += `<b>${originalIdx}.</b> ${status} ${node.name} (${protocol})\n`;
    });

    if (results.length > 10) {
      message += `\n... 还有 ${results.length - 10} 个结果`;
    }

    await sendTelegramMessage(chatId, message, env);
  } catch (error) {
    console.error('[Telegram Push] Search command failed:', error);
    await sendTelegramMessage(chatId, `❌ 搜索失败: ${error.message}`, env);
  }
}

/**
 * 处理 /sub 命令 - 获取订阅链接
 */
export async function handleSubCommand(chatId, args, env, request, requestCache = null) {
  try {
    const cache = requestCache || createRequestCache();
    const profiles = await getCachedProfiles(env, cache);
    const settings = await getCachedSettings(env, cache);

    // 获取公开的订阅组
    const publicProfiles = profiles.filter((p) => p.isPublic);

    if (publicProfiles.length === 0) {
      await sendTelegramMessage(chatId, '🔗 <b>暂无公开订阅组</b>\n\n' + '请在 Web 界面创建订阅组并设为公开', env);
      return;
    }

    // 获取基础 URL - 优先使用设置中的域名
    let baseUrl = settings.custom_domain || settings.publicDomain || '';
    if (!baseUrl && request?.url) {
      try {
        const url = new URL(request.url);
        baseUrl = `${url.protocol}//${url.host}`;
      } catch (e) {
        baseUrl = '';
      }
    }

    if (args.length > 0) {
      // 查找指定订阅组
      const targetName = args.join(' ').trim().toLowerCase();
      const profile = publicProfiles.find(
        (p) => p.name.toLowerCase().includes(targetName) || p.id.toLowerCase() === targetName,
      );

      if (!profile) {
        await sendTelegramMessage(chatId, `❌ 未找到名为 "<b>${escapeHtml(args.join(' '))}</b>" 的订阅组`, env);
        return;
      }

      let message = `🔗 <b>${profile.name}</b>\n\n`;
      if (baseUrl) {
        message += `订阅链接：\n<code>${baseUrl}/sub/${profile.id}</code>\n\n`;
        message += `点击链接可复制`;
      } else {
        message += `订阅组 ID：<code>${profile.id}</code>\n\n`;
        message += `💡 请在设置中配置公开域名以获取完整链接`;
      }

      await sendTelegramMessage(chatId, message, env);
    } else {
      // 列出所有公开订阅组
      let message = `🔗 <b>订阅组列表</b>\n\n`;

      publicProfiles.forEach((profile, i) => {
        message += `<b>${i + 1}. ${profile.name}</b>\n`;
        if (baseUrl) {
          message += `<code>${baseUrl}/sub/${profile.id}</code>\n\n`;
        } else {
          message += `ID: <code>${profile.id}</code>\n\n`;
        }
      });

      if (!baseUrl) {
        message += `💡 请在设置中配置公开域名`;
      } else {
        message += `💡 使用 /sub <名称> 获取指定订阅`;
      }

      await sendTelegramMessage(chatId, message, env);
    }
  } catch (error) {
    console.error('[Telegram Push] Sub command failed:', error);
    await sendTelegramMessage(chatId, `❌ 获取订阅失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理订阅获取 - 简化版（用于快捷菜单，不需要 request）
 */
export async function handleSubCommandSimple(chatId, env, requestCache = null) {
  try {
    const cache = requestCache || createRequestCache();
    const profiles = await getCachedProfiles(env, cache);
    const settings = await getCachedSettings(env, cache);

    // 获取公开的订阅组
    const publicProfiles = profiles.filter((p) => p.isPublic);

    if (publicProfiles.length === 0) {
      await sendTelegramMessage(chatId, '🔗 <b>暂无公开订阅组</b>\n\n' + '请在 Web 界面创建订阅组并设为公开', env);
      return;
    }

    // 尝试从设置中获取域名
    const customDomain = settings.custom_domain || settings.publicDomain || '';

    let message = '🔗 <b>订阅组列表</b>\n\n';

    publicProfiles.forEach((profile, i) => {
      message += `<b>${i + 1}. ${profile.name}</b>\n`;
      message += `ID: <code>${profile.id}</code>\n`;
      if (customDomain) {
        message += `链接: <code>${customDomain}/sub/${profile.id}</code>\n`;
      }
      message += '\n';
    });

    if (!customDomain) {
      message += '💡 请使用 /sub 命令获取完整链接';
    }

    await sendTelegramMessage(chatId, message, env);
  } catch (error) {
    console.error('[Telegram Push] Sub command simple failed:', error);
    await sendTelegramMessage(chatId, `❌ 获取订阅失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /info 命令 - 节点详情
 */
export async function handleInfoCommand(chatId, userId, args, env) {
  try {
    if (args.length === 0) {
      await sendTelegramMessage(chatId, '📄 <b>查看节点详情</b>\n\n' + '用法：/info <序号>\n' + '示例：/info 1', env);
      return;
    }

    const idx = parseInt(args[0]) - 1;
    if (isNaN(idx) || idx < 0) {
      await sendTelegramMessage(chatId, '❌ 请输入有效的序号', env);
      return;
    }

    const userNodes = await getUserNodes(userId, env);

    if (idx >= userNodes.length) {
      await sendTelegramMessage(chatId, `❌ 序号超出范围（共 ${userNodes.length} 个节点）`, env);
      return;
    }

    const node = userNodes[idx];
    const protocol = node.url.split('://')[0].toUpperCase();
    const status = node.enabled ? '✅ 启用' : '⛔ 禁用';
    const createdAt = node.created_at
      ? new Date(node.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : '未知';

    // 脱敏显示服务器地址
    let serverInfo = '未解析';
    try {
      const urlPart = node.url.split('://')[1]?.split('#')[0];
      if (urlPart) {
        // 简单脱敏
        serverInfo = urlPart.length > 20 ? urlPart.substring(0, 10) + '...' + urlPart.slice(-8) : urlPart;
      }
    } catch {}

    let message = `📄 <b>节点详情 #${idx + 1}</b>\n\n`;
    message += `<b>名称：</b>${node.name}\n`;
    message += `<b>协议：</b>${protocol}\n`;
    message += `<b>状态：</b>${status}\n`;
    message += `<b>ID：</b><code>${node.id}</code>\n`;
    message += `<b>添加：</b>${createdAt}\n`;

    // 操作按钮
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 复制链接', callback_data: `copy_node_${idx}` },
          {
            text: node.enabled ? '⛔ 禁用' : '✅ 启用',
            callback_data: `toggle_node_${idx}`,
          },
        ],
        [
          { text: '✏️ 重命名', callback_data: `prompt_rename_${idx}` },
          { text: '🗑️ 删除', callback_data: `confirm_delete_${idx}` },
        ],
      ],
    };

    await sendTelegramMessage(chatId, message, env, { reply_markup: keyboard });
  } catch (error) {
    console.error('[Telegram Push] Info command failed:', error);
    await sendTelegramMessage(chatId, `❌ 获取详情失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /copy 命令 - 复制节点链接
 */
export async function handleCopyCommand(chatId, userId, args, env) {
  try {
    const target = parseTargetArgs(args);

    if (target.type === 'none') {
      await sendTelegramMessage(
        chatId,
        '📋 <b>复制节点链接</b>\n\n' + '用法：/copy <序号>\n' + '示例：/copy 1\n' + '示例：/copy 1,2,3',
        env,
      );
      return;
    }

    const userNodes = await getUserNodes(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, '📋 暂无节点', env);
      return;
    }

    let indicesToCopy = [];

    if (target.type === 'all') {
      indicesToCopy = userNodes.map((_, i) => i);
    } else if (target.type === 'index') {
      indicesToCopy = target.values.filter((idx) => idx >= 0 && idx < userNodes.length);
    }

    if (indicesToCopy.length === 0) {
      await sendTelegramMessage(chatId, '❌ 未找到指定的节点', env);
      return;
    }

    // 生成链接文本
    const links = indicesToCopy.map((idx) => userNodes[idx].url).join('\n');

    if (indicesToCopy.length === 1) {
      const node = userNodes[indicesToCopy[0]];
      await sendTelegramMessage(
        chatId,
        `📋 <b>${node.name}</b>\n\n<code>${node.url}</code>\n\n点击上方链接可复制`,
        env,
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `📋 <b>已复制 ${indicesToCopy.length} 个节点链接</b>\n\n<code>${links}</code>`,
        env,
      );
    }
  } catch (error) {
    console.error('[Telegram Push] Copy command failed:', error);
    await sendTelegramMessage(chatId, `❌ 复制失败: ${escapeHtml(error.message)}`, env);
  }
}

/**
 * 处理 /export 命令 - 导出节点
 */
export async function handleExportCommand(chatId, userId, args, env) {
  try {
    const userNodes = await getUserNodes(userId, env);

    if (userNodes.length === 0) {
      await sendTelegramMessage(chatId, '📦 暂无可导出的节点', env);
      return;
    }

    const format = args[0]?.toLowerCase() || 'base64';

    let content = '';
    let formatName = '';

    switch (format) {
      case 'url':
      case 'raw':
        // 原始链接格式
        content = userNodes.map((n) => n.url).join('\n');
        formatName = '原始链接';
        break;

      case 'base64':
      default:
        // Base64 格式
        const urls = userNodes.map((n) => n.url).join('\n');
        content = utf8ToBase64(urls);
        formatName = 'Base64';
        break;
    }

    let message = `📦 <b>导出成功</b>\n\n`;
    message += `格式：${formatName}\n`;
    message += `节点：${userNodes.length} 个\n\n`;

    if (content.length > 3000) {
      // 内容太长，分块发送
      message += `内容较长，请分段复制：`;
      await sendTelegramMessage(chatId, message, env);

      // 分块发送
      const chunkSize = 3000;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.substring(i, i + chunkSize);
        await sendTelegramMessage(chatId, `<code>${chunk}</code>`, env);
      }
    } else {
      message += `<code>${content}</code>`;
      await sendTelegramMessage(chatId, message, env);
    }

    await sendTelegramMessage(
      chatId,
      '💡 <b>导出格式</b>\n' + '/export - Base64（默认）\n' + '/export url - 原始链接',
      env,
    );
  } catch (error) {
    console.error('[Telegram Push] Export command failed:', error);
    await sendTelegramMessage(chatId, `❌ 导出失败: ${escapeHtml(error.message)}`, env);
  }
}
