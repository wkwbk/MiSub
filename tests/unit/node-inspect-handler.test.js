import { describe, expect, it, vi } from 'vitest';
import { handleNodeInspectRequest, handleNodeTcpingRequest } from '../../functions/modules/handlers/node-inspect-handler.js';

describe('node-inspect-handler', () => {
  it('rejects non-POST requests on inspect and tcping endpoints', async () => {
    const inspectResp = await handleNodeInspectRequest(new Request('https://example.com/api/nodes/inspect'), {});
    expect(inspectResp.status).toBe(405);

    const tcpingResp = await handleNodeTcpingRequest(new Request('https://example.com/api/nodes/tcping'), {});
    expect(tcpingResp.status).toBe(405);
  });

  it('returns empty results cleanly when nodes/targets list is empty', async () => {
    const inspectResp = await handleNodeInspectRequest(
      new Request('https://example.com/api/nodes/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: [] }),
      }),
      {},
    );
    expect(inspectResp.status).toBe(200);
    expect(await inspectResp.json()).toEqual({ success: true, results: {} });
  });

  it('blocks private/loopback targets and measures TCPing latency via injected connectFn', async () => {
    const mockConnect = vi.fn(() => ({
      opened: Promise.resolve(),
      close: vi.fn().mockResolvedValue(undefined),
    }));

    const resp = await handleNodeTcpingRequest(
      new Request('https://example.com/api/nodes/tcping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [
            { id: 'pub-1', host: '1.1.1.1', port: 443 },
            { id: 'priv-1', host: '127.0.0.1', port: 80 },
            { id: 'bad-port', host: '8.8.8.8', port: 99999 },
          ],
          timeoutMs: 2000,
        }),
      }),
      {},
      { connectFn: mockConnect },
    );

    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.results['pub-1']).toMatchObject({ status: 'ok', mode: 'tcping' });
    expect(data.results['pub-1'].latency).toBeGreaterThanOrEqual(1);
    expect(data.results['priv-1']).toMatchObject({ status: 'error', mode: 'tcping' });
    expect(data.results['bad-port']).toMatchObject({ status: 'error', mode: 'tcping' });
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
});
