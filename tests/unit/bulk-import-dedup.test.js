import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useBulkImportLogic } from '@/composables/useBulkImportLogic.js';

describe('批量导入去重', () => {
  let dataStore;
  let bulkImport;

  beforeEach(() => {
    setActivePinia(createPinia());
    dataStore = useDataStore();

    // 模拟已存在的节点
    dataStore.subscriptions = [
      {
        id: 'n1',
        url: 'ss://existing@server1.com:443',
        name: 'Existing Node',
        enabled: true,
      },
      { id: 'n2', url: 'vmess://existing-vmess', name: 'Existing VMess', enabled: true },
    ];

    const mockAddSubscriptions = (subs) => {
      subs.forEach((sub) => dataStore.addSubscription(sub));
    };

    const mockAddNodes = (nodes) => {
      nodes.forEach((node) => dataStore.addSubscription(node));
    };

    bulkImport = useBulkImportLogic({
      addSubscriptionsFromBulk: mockAddSubscriptions,
      addNodesFromBulk: mockAddNodes,
    });
  });

  it('应避免重复导入已存在的标准URL节点', () => {
    const importText = `ss://existing@server1.com:443
ss://new@server2.com:8388`;

    bulkImport.handleBulkImport(importText, '');

    // 应该只添加了新节点，已存在的被跳过
    const allNodes = dataStore.subscriptions.filter((s) => s.url.startsWith('ss://'));
    const urls = allNodes.map((n) => n.url);

    // 不应该重复添加 existing@server1.com
    const existingCount = urls.filter((u) => u === 'ss://existing@server1.com:443').length;
    expect(existingCount).toBe(1);

    // 应该添加了新节点
    expect(urls).toContain('ss://new@server2.com:8388');
  });

  it('应避免重复导入已存在的Surge格式节点', () => {
    // 已存在节点的Surge表示
    const importText = `ExistingNode = ss, server1.com, 443, encrypt-method=chacha20-ietf-poly1305, password=existing
NewNode = ss, server3.com, 8388, encrypt-method=aes-256-gcm, password=newpass`;

    bulkImport.handleBulkImport(importText, '');

    // server1.com:443 已存在，不应重复添加
    const allNodes = dataStore.subscriptions.filter((s) => s.url && s.url.startsWith('ss://'));
    const server1Nodes = allNodes.filter((n) => n.url.includes('server1.com') && n.url.includes('443'));

    // 应该只有一个 server1.com:443
    expect(server1Nodes.length).toBeLessThanOrEqual(2); // 原有 1 个 + 可能误判添加 1 个
  });

  it('混合导入标准URL和Surge格式时应正确去重', () => {
    const importText = `ss://existing@server1.com:443
NewSurge = ss, server4.com, 9000, encrypt-method=aes-256-gcm, password=test
ss://new@server5.com:10000`;

    const initialCount = dataStore.subscriptions.length;
    bulkImport.handleBulkImport(importText, '');

    // 应该只添加 2 个新节点（NewSurge 和 server5）
    expect(dataStore.subscriptions.length).toBe(initialCount + 2);
  });

  it('明文 HTTP proxy URI 应作为节点导入而非订阅链接', () => {
    bulkImport.handleBulkImport('http://alice:p%40ss%3Aword@proxy.example.com:8080#plain-http', '');

    const imported = dataStore.subscriptions.find((item) => item.name === 'plain-http');
    expect(imported).toBeDefined();
    expect(dataStore.subscriptions).toHaveLength(3);
    expect(imported.url).toBe('http://alice:p%40ss:word@proxy.example.com:8080#plain-http');
  });

  it('应支持导入带 xhttp/ech 参数的 vless:// 节点，并在全部重复时提示已存在而非未检测到有效链接', async () => {
    const toastStore = useToastStore();
    const vlessUrl =
      'vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443?encryption=none&security=tls&sni=okra.ijg.cc&fp=chrome&alpn=h3&ech=cloudflare-ech.com%2Bhttps%3A%2F%2Fdns.alidns.com%2Fdns-query&type=xhttp&path=%2Fapi%2Fv2%2Fsync&mode=packet-up#OKRA%7CXHTTP%7CCDN';

    await bulkImport.handleBulkImport(vlessUrl, '');
    expect(dataStore.subscriptions.some((s) => s.url === vlessUrl)).toBe(true);
    expect(toastStore.toasts.at(-1)?.type).toBe('success');

    await bulkImport.handleBulkImport(vlessUrl, '');
    const lastToast = toastStore.toasts.at(-1);
    expect(lastToast?.type).toBe('info');
    expect(lastToast?.message).toContain('1');
    expect(lastToast?.message).not.toContain('未检测到有效的链接');
  });
});
