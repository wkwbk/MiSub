/**
 * 解析订阅内容API处理器
 * 用于前端导入订阅功能
 */

import { parseNodeList } from '@misub/core/node/node-parser.js';
import type { Env } from '../../types.js';
import { createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 处理订阅内容解析请求
 */
export async function handleParseSubscription(request: Request, _env: Env): Promise<Response> {
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.large)) as unknown;
    const content = isRecord(rawBody) ? rawBody.content : undefined;

    if (!content || typeof content !== 'string') {
      return createJsonResponse(
        {
          success: false,
          error: '请提供有效的订阅内容',
        },
        400,
      );
    }

    // 使用后端的节点解析器
    const parsedNodes = parseNodeList(content);

    // 过滤掉无效节点
    const validNodes = parsedNodes.filter((node) => node && node.url);

    console.info(`[API /parse_subscription] Parsed ${validNodes.length} valid nodes from ${content.length} characters`);

    return createJsonResponse({
      success: true,
      data: {
        nodes: validNodes,
        totalCount: validNodes.length,
      },
    });
  } catch (error: unknown) {
    console.error('[API Error /parse_subscription]', error);
    const message = error instanceof Error ? error.message : String(error);
    return createJsonResponse(
      {
        success: false,
        error: `解析失败: ${message}`,
      },
      500,
    );
  }
}
