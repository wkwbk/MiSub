import { expect, test } from '@playwright/test';

const E2E_SUB_URL = 'https://airport.e2e.example/sub';
const E2E_MANUAL_NODE =
  'vless://99999999-9999-9999-9999-999999999999@manual.e2e.example:443?encryption=none&security=tls&sni=manual.e2e.example#Manual-HK-Edge';

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[type="password"]').fill('e2e-admin-password');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('button', { name: '批量导入' })).toBeVisible();
}

async function submitBulkImportAndWaitSave(page, content) {
  await page.getByRole('button', { name: '批量导入' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.locator('textarea').fill(content);

  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const expectsSubs = lines.some((line) => /^https?:\/\//i.test(line));
  const expectsNodes = lines.some((line) => !/^https?:\/\//i.test(line));

  const waits = [];
  if (expectsNodes) {
    waits.push(page.waitForResponse((res) => res.url().includes('/api/nodes/batch') && res.request().method() === 'POST'));
  }
  if (expectsSubs) {
    waits.push(
      page.waitForResponse((res) => res.url().includes('/api/subscriptions/batch') && res.request().method() === 'POST'),
    );
  }

  const responsesPromise = Promise.all(waits);
  await modal.getByRole('button', { name: '确认' }).click();

  const responses = await responsesPromise;
  for (const res of responses) {
    expect(res.status()).toBe(201);
  }
  await expect(modal).toBeHidden();
}

test.describe('MiSub Core E2E Workflows', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.post('/__e2e__/reset');
    expect(res.ok()).toBe(true);
    await page.route('https://api.github.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
  });

  test('1. blocks unauthenticated /dashboard access and authenticates admin via /login', async ({ page }) => {
    const blockedRes = await page.goto('/dashboard');
    expect(blockedRes?.status()).toBe(404);

    await page.goto('/login');

    // Invalid password displays error alert and stays on login
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // Valid password logs in and renders Dashboard
    await page.locator('input[type="password"]').fill('e2e-admin-password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('button', { name: '批量导入' })).toBeVisible();
  });

  test('2. imports subscriptions and manual nodes via unified ImportModal and persists across reload', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await submitBulkImportAndWaitSave(page, `${E2E_SUB_URL}\n${E2E_MANUAL_NODE}`);

    // Verify imported subscription in /dashboard/groups
    await page.goto('/dashboard/groups');
    await expect(page.locator('body')).toContainText(E2E_SUB_URL);

    // Verify imported manual node in /dashboard/nodes and after full page reload
    await page.goto('/dashboard/nodes');
    await expect(page.locator('body')).toContainText('Manual-HK-Edge');

    await page.reload();
    await expect(page.locator('body')).toContainText('Manual-HK-Edge');
  });

  test('3. applies exclude/filter rules on subscription and previews processed nodes', async ({ page }) => {
    await loginAsAdmin(page);

    // Import test subscription
    await submitBulkImportAndWaitSave(page, E2E_SUB_URL);

    // Edit subscription to exclude keyword '官网'
    await page.goto('/dashboard/groups');
    await page.getByRole('button', { name: '编辑' }).first().click();
    const editModal = page.getByRole('dialog');
    await expect(editModal).toBeVisible();

    await editModal.getByRole('button', { name: /包含\/排除节点/ }).click();
    await editModal.getByRole('button', { name: '官网', exact: true }).click();
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/subscriptions/') && res.request().method() === 'PATCH',
      ),
      editModal.getByRole('button', { name: '确认' }).click(),
    ]);
    expect(patchRes.status()).toBe(200);
    await expect(editModal).toBeHidden();

    // Open NodePreviewModal and verify filtered node preview
    const [previewRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/subscription_nodes') && res.request().method() === 'POST'),
      page.getByRole('button', { name: '预览节点' }).first().click(),
    ]);
    expect(previewRes.status()).toBe(200);

    const previewModal = page.getByRole('dialog');
    await expect(previewModal).toBeVisible();
    await expect(previewModal).toContainText('HK-VIP-01');
    await expect(previewModal).toContainText('US-Pro-01');
    await expect(previewModal).toContainText('SG-Speed-01');
    await expect(previewModal).not.toContainText('JP-Trial-官网');
  });

  test('4. creates a profile, opens CopyLinkModal, and serves valid Clash & Sing-Box outputs', async ({
    page,
    request,
  }) => {
    await loginAsAdmin(page);

    // Import subscription + manual node
    await submitBulkImportAndWaitSave(page, `${E2E_SUB_URL}\n${E2E_MANUAL_NODE}`);

    // Configure exclude rule '官网' on imported subscription
    await page.goto('/dashboard/groups');
    await page.getByRole('button', { name: '编辑' }).first().click();
    const editModal = page.getByRole('dialog');
    await editModal.getByRole('button', { name: /包含\/排除节点/ }).click();
    await editModal.getByRole('button', { name: '官网', exact: true }).click();
    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/subscriptions/') && res.request().method() === 'PATCH',
      ),
      editModal.getByRole('button', { name: '确认' }).click(),
    ]);
    expect(patchRes.status()).toBe(200);
    await expect(editModal).toBeHidden();

    // Create a new Profile on /dashboard/subscriptions
    await page.goto('/dashboard/subscriptions');
    await page.getByRole('button', { name: '新增' }).click();

    const profileModal = page.getByRole('dialog', { name: /新增订阅组/ });
    await expect(profileModal).toBeVisible();
    await profileModal.locator('#profile-name').fill('E2E主力订阅');
    await profileModal.locator('#profile-custom-id').fill('e2e-main');

    // Select manual nodes (active tab defaults to manualNodes) and subscriptions
    await profileModal.getByRole('button', { name: '全选', exact: true }).click();
    await profileModal.getByRole('navigation', { name: '资源标签页' }).locator('button').nth(1).click();
    await profileModal.getByRole('button', { name: '全选', exact: true }).click();
    const [createProfileRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/profiles') && res.request().method() === 'POST'),
      profileModal.getByRole('button', { name: '确认' }).click(),
    ]);
    expect(createProfileRes.status()).toBe(201);
    await expect(profileModal).toBeHidden();

    // Verify CopyLinkModal shows Clash & Sing-Box links
    await expect(page.locator('body')).toContainText('E2E主力订阅');
    await page.getByRole('button', { name: '复制订阅' }).first().click();
    const copyModal = page.getByRole('dialog').filter({ hasText: 'Clash' });
    await expect(copyModal).toBeVisible();
    await expect(copyModal).toContainText('Clash');
    await expect(copyModal).toContainText('Sing-Box');

    // Verify real subscription endpoints generated for e2e-main
    const clashResponse = await request.get('/sub/e2e-main?clash', {
      headers: { 'User-Agent': 'clash-verge/v1.7.0' },
    });
    expect(clashResponse.status()).toBe(200);
    const clashBody = await clashResponse.text();
    expect(clashBody).toContain('proxies:');
    expect(clashBody).toContain('HK-VIP-01');
    expect(clashBody).toContain('Manual-HK-Edge');
    expect(clashBody).not.toContain('JP-Trial-官网');

    const singboxResponse = await request.get('/sub/e2e-main?singbox', {
      headers: { 'User-Agent': 'sing-box/1.10.0' },
    });
    expect(singboxResponse.status()).toBe(200);
    const singboxJson = await singboxResponse.json();
    const outboundTagsText = (singboxJson.outbounds || []).map((item) => item.tag).join('\n');
    expect(outboundTagsText).toContain('HK-VIP-01');
    expect(outboundTagsText).toContain('Manual-HK-Edge');
    expect(outboundTagsText).not.toContain('JP-Trial-官网');
  });
});
