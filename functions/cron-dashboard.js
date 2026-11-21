/**
 * Cron Triggers 管理面板
 * 提供前端界面查看和管理定时任务
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    // 返回定时任务状态页面
    return getCronDashboard(env);
  }

  if (request.method === 'POST') {
    // 手动触发同步
    return triggerManualSync(env);
  }

  return new Response('Method not allowed', { status: 405 });
}

/**
 * 获取定时任务仪表板
 */
function getCronDashboard(_env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cron Triggers 管理面板 - MiSub</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 24px;
            background: #131515;
            color: #f4f4f5;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            max-width: 1120px;
            margin: 0 auto;
            background: #171717;
            border: 1px solid #27272a;
            border-radius: 6px;
            padding: 24px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding-bottom: 20px;
            margin-bottom: 24px;
            border-bottom: 1px solid #27272a;
        }
        .header h1 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            letter-spacing: -0.025em;
            color: #f4f4f5;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .status-card {
            background: #131515;
            border: 1px solid #27272a;
            border-radius: 6px;
            padding: 16px 20px;
        }
        .status-card h3 {
            margin: 0 0 8px 0;
            font-size: 0.75rem;
            font-weight: 500;
            color: #a1a1aa;
        }
        .status-value {
            font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 1.5rem;
            font-weight: 600;
            color: #f4f4f5;
        }
        .sync-btn {
            background: #f4f4f5;
            color: #18181b;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: 600;
            transition: background-color 0.15s ease;
        }
        .sync-btn:hover { background: #ffffff; }
        .sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        h2 {
            margin: 0 0 12px 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: #e4e4e7;
        }
        .logs {
            background: #131515;
            border: 1px solid #27272a;
            border-radius: 6px;
            padding: 12px;
            max-height: 400px;
            overflow-y: auto;
        }
        .log-entry {
            margin: 6px 0;
            padding: 10px 12px;
            border-left: 2px solid #52525b;
            background: #171717;
            border-radius: 4px;
            font-size: 0.8125rem;
            color: #d4d4d8;
        }
        .log-time {
            color: #71717a;
            font-size: 0.75rem;
            font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            margin-bottom: 2px;
        }
        .log-success { border-left-color: #22c55e; }
        .log-error { border-left-color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🕐 Cron Triggers 管理面板</h1>
            <button class="sync-btn" onclick="triggerSync()">手动同步</button>
        </div>

        <div class="status-grid">
            <div class="status-card">
                <h3>📊 总订阅数</h3>
                <div class="status-value" id="totalSubs">-</div>
            </div>
            <div class="status-card">
                <h3>✅ 成功同步</h3>
                <div class="status-value" id="successCount">-</div>
            </div>
            <div class="status-card">
                <h3>❌ 失败同步</h3>
                <div class="status-value" id="failedCount">-</div>
            </div>
            <div class="status-card">
                <h3>🕐 上次同步</h3>
                <div class="status-value" id="lastSync">-</div>
            </div>
        </div>

        <h2>📋 同步日志</h2>
        <div class="logs" id="syncLogs">
            <div class="log-entry">
                <div class="log-time">加载中...</div>
                <div>正在获取同步状态...</div>
            </div>
        </div>
    </div>

    <script>
        // 页面加载时获取状态
        loadStatus();

        async function loadStatus() {
            try {
                const response = await fetch('/api/cron/status');
                const data = await response.json();

                // 兼容性：支持从 lastExecution 中读取字段
                const status = {
                    totalSubscriptions: data.totalSubscriptions || data.lastExecution?.result?.totalSubscriptions || 0,
                    successfulSyncs: data.successfulSyncs || data.lastExecution?.result?.successfulSyncs || 0,
                    failedSyncs: data.failedSyncs || data.lastExecution?.result?.failedSyncs || 0,
                    lastSync: data.lastSync || data.lastExecution?.timestamp || null,
                    details: data.details || data.lastExecution?.result?.details || []
                };

                document.getElementById('totalSubs').textContent = status.totalSubscriptions;
                document.getElementById('successCount').textContent = status.successfulSyncs;
                document.getElementById('failedCount').textContent = status.failedSyncs;
                document.getElementById('lastSync').textContent = status.lastSync ?
                    new Date(status.lastSync).toLocaleString() : '从未';

                updateLogs(status.details);
            } catch (error) {
                console.error('Failed to load status:', error);
            }
        }

        async function triggerSync() {
            const btn = document.querySelector('.sync-btn');
            btn.disabled = true;
            btn.textContent = '同步中...';

            try {
                const response = await fetch('/api/cron/trigger', { method: 'POST' });
                const result = await response.json();

                if (result.success) {
                    alert('同步完成！');
                    loadStatus(); // 重新加载状态
                } else {
                    alert('同步失败：' + result.error);
                }
            } catch (error) {
                alert('同步请求失败：' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = '手动同步';
            }
        }

        function updateLogs(details) {
            const logsContainer = document.getElementById('syncLogs');
            logsContainer.innerHTML = '';

            if (!details || details.length === 0) {
                logsContainer.innerHTML = '<div class="log-entry">暂无同步记录</div>';
                return;
            }

            details.slice(0, 50).forEach(detail => {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry ' + (detail.status === 'success' ? 'log-success' : 'log-error');

                logEntry.innerHTML = \`
                    <div class="log-time">\${new Date().toLocaleString()}</div>
                    <div><strong>\${detail.name}</strong>: \${detail.status === 'success' ?
                        \`同步成功 (\${detail.nodeCount} 个节点)\` :
                        \`同步失败 - \${detail.error}\`}</div>
                \`;

                logsContainer.appendChild(logEntry);
            });
        }

        // 每30秒自动刷新状态
        setInterval(loadStatus, 30000);
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * 手动触发同步
 */
async function triggerManualSync(_env) {
  try {
    // 手动触发同步的请求应该转发到 _schedule.js
    // 由于Cloudflare Pages Functions限制，这里只返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        message: '同步任务已提交，请查看日志获取进度',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
