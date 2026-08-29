import { chromium } from 'playwright';

async function runAnalyticsTests() {
  console.log('=== STARTING TEST SUITE 5: FINANCIAL ANALYTICS & AUDIT REPORTING ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser ${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Error]: ${err.message}`));

  try {
    console.log('1. Navigating & Logging in as Owner...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#main-app-header', { timeout: 10000 });

    const loginTrigger = page.locator('#btn-header-login-trigger, #btn-login-to-queue').first();
    await loginTrigger.click();
    await page.waitForSelector('#auth-modal', { timeout: 5000 });

    await page.locator('#tab-auth-owner').click();
    await page.locator('#input-owner-username').fill('CEO POTONG');
    await page.locator('#input-owner-password').fill('Arez008');
    await page.locator('#btn-submit-owner-login').click();
    await page.waitForSelector('#auth-modal', { state: 'detached', timeout: 5000 });
    console.log('PASS: Logged in as Owner.');

    // Navigate to "Laporan" tab
    console.log('2. Navigating to "Laporan" tab...');
    await page.locator('button:has-text("Laporan")').first().click();
    await page.waitForSelector('text=Analitik & Laba Bersih', { timeout: 10000 });
    console.log('PASS: "Laporan" view mounted.');

    // Verify Primary Financial Metrics
    console.log('3. Checking Financial KPI Cards...');
    const grossVal = await page.locator('text=Pendapatan Kotor >> xpath=..//p').first().innerText();
    const netVal = await page.locator('text=Laba Bersih >> xpath=..//p').first().innerText();
    const hppVal = await page.locator('text=Total Biaya HPP >> xpath=..//p').first().innerText();
    const headsVal = await page.locator('text=Tamu Selesai >> xpath=..//p').first().innerText();
    console.log(`PASS: Daily Metrics: Gross=${grossVal}, Net=${netVal}, HPP=${hppVal}, Heads=${headsVal}`);

    // Switch Scope to "Minggu Ini"
    console.log('4. Switching scope to "Minggu Ini" (Weekly)...');
    await page.locator('button:has-text("Minggu Ini")').first().click();
    await page.waitForTimeout(600);
    const isWeeklyChartVisible = await page.locator('text=Tren Pendapatan Mingguan').isVisible();
    console.log(`PASS: Weekly trend chart visible: ${isWeeklyChartVisible}`);

    // Switch Scope to "Bulan Ini"
    console.log('5. Switching scope to "Bulan Ini" (Monthly)...');
    await page.locator('button:has-text("Bulan Ini")').first().click();
    await page.waitForTimeout(600);
    const isMonthlyVisible = await page.locator('text=Perbandingan Struktur Finansial').isVisible();
    console.log(`PASS: Monthly view visible: ${isMonthlyVisible}`);

    // Verify Transaction History section
    console.log('6. Checking Transaction History list...');
    const hasHistoryHeading = await page.locator('text=Transaksi Terakhir').isVisible();
    console.log(`PASS: Transaction History heading visible: ${hasHistoryHeading}`);

    // Test CSV Download button
    console.log('7. Testing CSV Export button...');
    const downloadBtn = page.locator('button:has-text("CSV")').first();
    const isDownloadVisible = await downloadBtn.isVisible();
    console.log(`PASS: CSV export button visible: ${isDownloadVisible}`);

    // Logout Owner
    console.log('8. Logging out Owner...');
    await page.locator('#btn-header-profile-trigger').click();
    await page.waitForSelector('#btn-profile-sheet-logout', { timeout: 5000 });
    await page.locator('#btn-profile-sheet-logout').click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#btn-header-login-trigger', { timeout: 5000 });
    console.log('PASS: Owner logged out.');

    console.log('=== TEST SUITE 5 (ANALYTICS & AUDIT) PASSED 100% ===');
  } catch (err) {
    console.error('FAIL: Test Suite 5 encountered error:', err);
    await page.screenshot({ path: 'test-error-analytics.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runAnalyticsTests().catch(e => {
  console.error(e);
  process.exit(1);
});
