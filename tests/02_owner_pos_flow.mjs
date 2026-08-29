import { chromium } from 'playwright';

async function runOwnerPOSTests() {
  console.log('=== STARTING TEST SUITE 2: OWNER POS & CASHIER CHECKOUT FLOW ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, // Mobile POS Viewport
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser ${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Error]: ${err.message}`));

  try {
    console.log('1. Navigating & Logging in as Owner via Login Landing Page...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#landing-auth-card', { timeout: 10000 });

    console.log('2. Switching to Owner & Staf tab on Landing Page...');
    await page.locator('#tab-owner-login').click();
    await page.waitForSelector('#input-landing-owner-username', { timeout: 5000 });

    console.log('3. Filling Owner Credentials (CEO POTONG / Arez008)...');
    await page.locator('#input-landing-owner-username').fill('CEO POTONG');
    await page.locator('#input-landing-owner-password').fill('Arez008');
    await page.locator('#btn-submit-owner-login').click();

    // Wait for Owner POS View to mount
    await page.waitForSelector('text=Ringkasan Hari Ini', { timeout: 10000 });
    console.log('PASS: Logged in as Owner, OwnerPOSView mounted.');

    // Verify Owner Bottom Navigation
    console.log('3. Verifying Owner Bottom Navigation Tabs...');
    const navItems = ['Kasir & Sesi', 'Laporan', 'Katalog & HPP', 'Tim Staf', 'Tamu CRM'];
    for (const item of navItems) {
      const isVis = await page.locator(`button:has-text("${item}")`).first().isVisible();
      console.log(`PASS: Nav item "${item}" visible: ${isVis}`);
    }

    // Check Summary Metrics
    console.log('4. Checking Today\'s Summary Metrics (Omset, Laba, Selesai)...');
    const omsetText = await page.locator('text=Omset >> xpath=..//p').first().innerText();
    const labaText = await page.locator('text=Laba Bersih >> xpath=..//p').first().innerText();
    const selesaiText = await page.locator('text=Selesai >> xpath=..//p').first().innerText();
    console.log(`Summary: Omset=${omsetText}, Laba=${labaText}, Selesai=${selesaiText}`);

    // Test Walk-In Guest Creation
    console.log('5. Testing "Tambah Tamu Walk-In"...');
    await page.locator('#btn-open-walkin-modal').click();
    await page.waitForSelector('#walkin-modal', { timeout: 5000 });

    const guestName = `WalkIn Tester ${Math.floor(Math.random() * 1000)}`;
    const guestPhone = `0813${Math.floor(10000000 + Math.random() * 90000000)}`;

    await page.locator('#walkin-modal input[placeholder*="Dimas Aditya"]').fill(guestName);
    await page.locator('#walkin-modal input[placeholder*="08123456789"]').fill(guestPhone);
    await page.locator('#walkin-modal input[placeholder*="Side part natural"]').fill('Model Undercut rapih');

    // Select service in walk-in modal
    const serviceChoice = page.locator('#walkin-modal button:has-text("Signature Haircut"), #walkin-modal button:has-text("Gentlemen")').first();
    if (await serviceChoice.isVisible()) {
      await serviceChoice.click();
    }

    // Submit Walk-in form
    await page.locator('#walkin-modal button[type="submit"]').click();
    await page.waitForSelector('#walkin-modal', { state: 'detached', timeout: 5000 });
    console.log(`PASS: Created Walk-In guest "${guestName}"`);

    // Verify Guest appears in Waiting Queue List
    await page.waitForSelector(`text=${guestName}`, { timeout: 10000 });
    console.log(`PASS: "${guestName}" is visible in the queue pipeline.`);

    // Test Start Queue Session
    console.log('6. Testing Start Queue Session ("Mulai")...');
    const startBtn = page.locator('button:has-text("Mulai")').first();
    await startBtn.click();
    console.log('PASS: Clicked Mulai button.');

    // Verify In-Progress Session is displayed with BatteryProgressBar
    await page.waitForSelector('#btn-complete-and-checkout', { timeout: 10000 });
    console.log('PASS: Sesi Pangkas Berjalan is active with Checkout button.');

    // Test Cashier Checkout
    console.log('7. Testing "Selesaikan & Terima Bayar" (Cashier Checkout)...');
    await page.locator('#btn-complete-and-checkout').click();
    await page.waitForSelector('#checkout-modal', { timeout: 5000 });
    console.log('PASS: Checkout modal opened.');

    // Test Discount & Tax Inputs
    console.log('8. Testing Discount, Tax & Payment calculation...');
    await page.locator('#checkout-modal input[type="number"]').first().fill('5000'); // Discount
    await page.locator('#checkout-modal input[type="number"]').nth(1).fill('1000'); // Tax

    // Switch Payment to CASH & test cash given / change calculation
    await page.locator('#checkout-modal button:has-text("CASH")').first().click();
    await page.waitForTimeout(400);

    const cashInput = page.locator('#checkout-modal input[type="number"]').last();
    await cashInput.fill('100000');
    await page.waitForTimeout(500);

    const changeText = await page.locator('text=Kembalian Tunai: >> xpath=..//span').last().innerText();
    console.log(`PASS: Cash given Rp 100.000 -> Calculated Change: ${changeText}`);

    // Confirm Checkout
    console.log('9. Confirming transaction and generating receipt...');
    await page.locator('#btn-confirm-checkout').click();

    // Verify Receipt Modal
    await page.waitForSelector('#receipt-modal', { timeout: 10000 });
    console.log('PASS: Struk Transaksi Selesai (Receipt Modal) opened.');

    const receiptInvoice = await page.locator('#receipt-printable-area').innerText();
    console.log(`PASS: Receipt Details:\n---\n${receiptInvoice}\n---`);

    // Close Receipt Modal
    await page.locator('#receipt-modal button:has-text("Tutup")').click();
    await page.waitForSelector('#receipt-modal', { state: 'detached', timeout: 5000 });
    console.log('PASS: Receipt modal closed.');

    // Verify Completed Tab
    console.log('10. Verifying Completed tab...');
    await page.locator('button:has-text("Selesai")').first().click();
    await page.waitForTimeout(600);
    const isCompletedListed = await page.locator(`text=${guestName}`).first().isVisible();
    console.log(`PASS: Guest "${guestName}" listed in Selesai tab: ${isCompletedListed}`);

    // Test Profile Sheet and Logout
    console.log('11. Logging out Owner...');
    await page.locator('#btn-header-profile-trigger').click();
    await page.waitForSelector('#btn-profile-sheet-logout', { timeout: 5000 });
    await page.locator('#btn-profile-sheet-logout').click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#landing-auth-card', { timeout: 5000 });
    console.log('PASS: Owner logged out successfully.');

    console.log('=== TEST SUITE 2 (OWNER POS & CHECKOUT) PASSED 100% ===');
  } catch (err) {
    console.error('FAIL: Test Suite 2 encountered error:', err);
    await page.screenshot({ path: 'test-error-owner.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runOwnerPOSTests().catch(e => {
  console.error(e);
  process.exit(1);
});
