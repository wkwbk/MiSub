import { escapeHtml } from './utils.js';

/**
 * 伪装页面渲染模块
 * 当浏览器访问订阅链接时显示的伪装页面
 */

/**
 * 渲染默认伪装页面
 * @param {Object} [disguiseConfig] 伪装配置；若配置了 redirectUrl，则「返回首页」指向该地址
 * @returns {Response} HTML响应
 */
export function renderDisguisePage(disguiseConfig) {
  const homeHref = resolveHomeHref(disguiseConfig);
  const homeLink = homeHref
    ? `<a href="${escapeHtml(homeHref)}" class="home-link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>返回首页</a>`
    : '';
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 Not Found</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            color-scheme: light dark;
            --bg: #fafafa;
            --surface: #ffffff;
            --border: #e4e4e7;
            --fg: #18181b;
            --fg-muted: #71717a;
            --btn-bg: #18181b;
            --btn-fg: #fafafa;
            --btn-hover: #27272a;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #131515;
                --surface: #171717;
                --border: #27272a;
                --fg: #f4f4f5;
                --fg-muted: #a1a1aa;
                --btn-bg: #f4f4f5;
                --btn-fg: #18181b;
                --btn-hover: #ffffff;
            }
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            color: var(--fg);
            -webkit-font-smoothing: antialiased;
        }

        .card {
            position: relative;
            z-index: 10;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2.5rem;
            max-width: 32rem;
            width: 90%;
            text-align: center;
        }

        .error-code {
            font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            font-size: 4.5rem;
            font-weight: 700;
            line-height: 1;
            color: var(--fg);
            margin-bottom: 1rem;
        }

        h1 {
            font-size: 1.25rem;
            font-weight: 600;
            letter-spacing: -0.025em;
            color: var(--fg);
            margin-bottom: 0.75rem;
        }

        p {
            font-size: 0.875rem;
            color: var(--fg-muted);
            line-height: 1.625;
            margin-bottom: 2rem;
        }

        p:last-child {
            margin-bottom: 0;
        }

        .home-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.625rem 1.5rem;
            background: var(--btn-bg);
            color: var(--btn-fg);
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.75rem;
            transition: background-color 0.15s ease;
        }

        .home-link:hover {
            background: var(--btn-hover);
        }

        @media (max-width: 640px) {
            .card {
                padding: 2rem 1.5rem;
            }
            .error-code {
                font-size: 3.75rem;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-code">404</div>
        <h1>页面未找到</h1>
        <p>抱歉，您访问的页面不存在或已被移除。<br>仿佛进入了数字荒原。</p>
        ${homeLink}
    </div>
</body>
</html>
    `;

  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Surrogate-Control': 'no-store',
    },
  });
}

/**
 * 根据配置生成伪装响应 (Redirect 或 404 Page)
 * @param {Object} disguiseConfig
 * @param {string} [baseUrl]
 * @returns {Response}
 */
export function createDisguiseResponse(disguiseConfig, baseUrl) {
  if (disguiseConfig && disguiseConfig.pageType === 'redirect' && disguiseConfig.redirectUrl) {
    const redirectUrl = normalizeRedirectUrl(disguiseConfig.redirectUrl, baseUrl);
    if (redirectUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl,
          // 伪装响应绝不能被边缘缓存：否则可能被缓存后被已登录用户命中，
          // 或泄露给搜索引擎/第三方来源。
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'Surrogate-Control': 'no-store',
        },
      });
    }
  }
  return renderDisguisePage(disguiseConfig?.pageType === 'redirect' ? disguiseConfig : null);
}

/**
 * 计算伪装页「返回首页」的目标：优先使用配置的 redirectUrl，
 * 避免指向本站根路径造成死循环（根路径本身就会再次触发伪装）。
 * @param {Object} [disguiseConfig]
 * @returns {string} 空字符串表示不渲染该链接
 */
function resolveHomeHref(disguiseConfig) {
  if (disguiseConfig && typeof disguiseConfig.redirectUrl === 'string') {
    const trimmed = disguiseConfig.redirectUrl.trim();
    if (trimmed) {
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
      if (!hasScheme && !trimmed.startsWith('/') && !trimmed.startsWith('//')) {
        return `https://${trimmed}`;
      }
      // 站内相对路径会回到本站根路径并再次触发伪装，故不渲染
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
    }
  }
  return '';
}

function normalizeRedirectUrl(rawUrl, baseUrl) {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
  if (!hasScheme && !candidate.startsWith('/') && !candidate.startsWith('//')) {
    candidate = `https://${candidate}`;
  }

  try {
    const normalized = encodeURI(candidate);
    const resolved = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized);
    if (!['http:', 'https:'].includes(resolved.protocol)) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}
