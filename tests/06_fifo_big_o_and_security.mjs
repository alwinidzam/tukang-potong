import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function runFIFOBigOAndSecuritySuite() {
  console.log('=== STARTING TEST SUITE 6: SECURITY HARDENING, STRICT FIFO & BIG O LAB ===');

  // 1. Security Penetration Checks (API Level)
  console.log('1. Testing Security Hardening...');

  // 1a. Reject backdoor static tokens
  for (const fakeToken of ['usr-admin', 'owner-preview-token', 'default-owner-token']) {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    assert.equal(res.status, 401, `Backdoor token ${fakeToken} must be rejected with 401`);
  }
  console.log('PASS: Static backdoor tokens strictly rejected (401).');

  // 1b. Require auth for protected endpoints
  for (const ep of ['/api/queues', '/api/services', '/api/hpp', '/api/system/complexity-metrics']) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert.equal(res.status, 401, `Unauthenticated ${ep} must return 401`);
  }
  console.log('PASS: Unauthenticated access blocked across queues, services, hpp, and complexity metrics.');

  // 1c. Prevent Privilege Escalation via Customer SSO using Owner email
  const privRes = await fetch(`${BASE_URL}/api/auth/google-sso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@arezbarbershop.com',
      full_name: 'Attacker Escalation',
    }),
  });
  assert.equal(privRes.status, 403, 'Customer SSO using owner email must be blocked with 403');
  console.log('PASS: Privilege Escalation via Customer SSO strictly blocked (403).');

  // 1d. Customer role blocked from /api/hpp and /api/system/complexity-metrics, and /api/services strips HPP
  const custLogin = await fetch(`${BASE_URL}/api/auth/google-sso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `sec_cust_${Date.now()}@areztest.com`,
      full_name: 'Security Auditor Guest',
    }),
  });
  const custData = await custLogin.json();
  assert.ok(custData.token, 'Customer should obtain valid token');

  const custHppRes = await fetch(`${BASE_URL}/api/hpp`, {
    headers: { Authorization: `Bearer ${custData.token}` },
  });
  assert.equal(custHppRes.status, 403, 'Customer must get 403 on /api/hpp');

  const custMetricsRes = await fetch(`${BASE_URL}/api/system/complexity-metrics`, {
    headers: { Authorization: `Bearer ${custData.token}` },
  });
  assert.equal(custMetricsRes.status, 403, 'Customer must get 403 on /api/system/complexity-metrics');

  const custServicesRes = await fetch(`${BASE_URL}/api/services`, {
    headers: { Authorization: `Bearer ${custData.token}` },
  });
  const custServices = await custServicesRes.json();
  for (const s of custServices) {
    assert.equal(s.total_hpp, undefined, 'Customer /api/services must NOT leak total_hpp');
    assert.equal(s.hpp_breakdown, undefined, 'Customer /api/services must NOT leak hpp_breakdown');
  }
  console.log('PASS: RBAC HPP isolation and internal margin redaction verified.');

  // 2. Owner Login & FIFO Inventory Batch COGS Verification
  console.log('2. Testing Dual-Layer FIFO (Queue Order + Batch Inventory HPP)...');
  const ownerLoginRes = await fetch(`${BASE_URL}/api/auth/owner-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'CEO POTONG', password: 'Arez008' }),
  });
  const ownerAuth = await ownerLoginRes.json();
  assert.equal(ownerLoginRes.status, 200);
  const ownerHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ownerAuth.token}`,
  };

  // Create Master HPP & 2 FIFO Batches with different unit costs
  const hppCreateRes = await fetch(`${BASE_URL}/api/hpp`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      item_name: `FIFO Blade ${Date.now()}`,
      unit_cost: 3000,
      unit_type: 'pcs',
      category: 'Bahan Baku & Steril',
    }),
  });
  const hppItem = (await hppCreateRes.json()).item;

  await fetch(`${BASE_URL}/api/hpp/${hppItem.id}/batches`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ quantity: 1, unit_cost: 1200, batch_code: 'FIFO-OLD-01' }),
  });
  await fetch(`${BASE_URL}/api/hpp/${hppItem.id}/batches`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ quantity: 5, unit_cost: 2800, batch_code: 'FIFO-NEW-02' }),
  });

  // Create Service consuming 2 pcs of that HPP
  const srvRes = await fetch(`${BASE_URL}/api/services`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      service_name: `FIFO Test Cut ${Date.now()}`,
      selling_price: 60000,
      duration_mins: 20,
      hpp_items: [{ hpp_id: hppItem.id, quantity_used: 2 }],
    }),
  });
  const service = (await srvRes.json()).service;

  // Enqueue 2 Walk-in customers: Q1 & Q2
  const q1 = (
    await (
      await fetch(`${BASE_URL}/api/queues`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ walk_in_name: 'FIFO Tamu Pertama', service_id: service.id, source: 'WALK_IN' }),
      })
    ).json()
  ).queue;

  const q2 = (
    await (
      await fetch(`${BASE_URL}/api/queues`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ walk_in_name: 'FIFO Tamu Kedua', service_id: service.id, source: 'WALK_IN' }),
      })
    ).json()
  ).queue;

  // Attempt starting Q2 out-of-order MUST return 409 FIFO_ORDER_VIOLATION!
  const outOfOrderStart = await fetch(`${BASE_URL}/api/queues/${q2.id}/start`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  assert.equal(outOfOrderStart.status, 409, 'Out-of-order queue start must be blocked by Strict FIFO (409)');
  const errPayload = await outOfOrderStart.json();
  assert.equal(errPayload.code, 'FIFO_ORDER_VIOLATION');
  console.log('PASS: Hybrid Strict FIFO guard blocked starting #2 ahead of #1 (409 FIFO_ORDER_VIOLATION).');

  // Start Q1 (Head), then Complete Q1 -> Check split FIFO batch COGS = 1*1200 + 1*2800 = 4000
  const startQ1 = await fetch(`${BASE_URL}/api/queues/${q1.id}/start`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  assert.equal(startQ1.status, 200);

  const completeQ1 = await fetch(`${BASE_URL}/api/queues/${q1.id}/complete`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ payment_method: 'QRIS' }),
  });
  assert.equal(completeQ1.status, 200);
  const completedData = await completeQ1.json();
  assert.equal(
    completedData.transaction.total_hpp,
    4000,
    'Split FIFO Batch HPP must equal 1*1200 + 1*2800 = 4000'
  );
  assert.equal(completedData.transaction.net_profit, 56000);
  assert.equal(completedData.transaction.fifo_batches_used.length, 2);
  console.log('PASS: Checkout FIFO batch deduction split cleanly across OLD-01 (1200) + NEW-02 (2800) = Rp 4.000.');

  // 3. Playwright UI Verification of Strict FIFO Queue & Algorithms Lab
  console.log('3. Testing Playwright UI for Strict FIFO Queue & Lab Big O & FIFO...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#landing-auth-card', { timeout: 10000 });
    await page.locator('#tab-owner-login').click();
    await page.locator('#input-landing-owner-username').fill('CEO POTONG');
    await page.locator('#input-landing-owner-password').fill('Arez008');
    await page.locator('#btn-submit-owner-login').click();
    await page.waitForSelector('text=Ringkasan Hari Ini', { timeout: 10000 });

    // Q2 should now be FIFO HEAD #1 automatically!
    await page.waitForSelector('text=FIFO Tamu Kedua', { timeout: 8000 });
    await page.waitForSelector('text=FIFO HEAD #1', { timeout: 5000 });
    console.log('PASS: UI promoted Q2 ("FIFO Tamu Kedua") to FIFO HEAD #1 automatically.');

    // Navigate to Laporan -> Lab Big O & FIFO
    await page.locator('#bottom-nav-analytics').click();
    await page.waitForSelector('#btn-tab-algorithms-lab', { timeout: 8000 });
    await page.locator('#btn-tab-algorithms-lab').click();
    await page.waitForSelector('#algorithms-lab-view', { timeout: 8000 });
    await page.waitForSelector('text=Visualisasi Linked Queue Antrean FIFO', { timeout: 5000 });
    await page.waitForSelector('text=Matriks Evaluasi Kompleksitas Algoritma (Big O)', { timeout: 5000 });
    await page.waitForSelector('text=FIFO-NEW-02', { timeout: 5000 });
    console.log('PASS: Lab Big O & FIFO Diagnostic UI verified with live queue node & batch FIFO telemetry.');
  } finally {
    await browser.close();
  }

  console.log('=== TEST SUITE 6 PASSED 100% ===');
}

runFIFOBigOAndSecuritySuite().catch((err) => {
  console.error('FAIL: Suite 6 encountered error:', err);
  process.exit(1);
});
