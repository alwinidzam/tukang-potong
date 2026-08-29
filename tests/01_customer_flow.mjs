import { chromium } from 'playwright';

async function runCustomerTests() {
  console.log('=== STARTING TEST SUITE 1: CUSTOMER EXPERIENCE & QUEUE LIFECYCLE ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser ${msg.type()}]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser Error]: ${err.message}`));

  try {
    console.log('1. Navigating to http://localhost:3000 (Login Landing Page Gatekeeper)...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#landing-auth-card', { timeout: 10000 });
    console.log('PASS: Login Landing Page gatekeeper loaded.');

    console.log('2. Switching to Pelanggan tab on Landing Page...');
    await page.locator('#tab-customer-login').click();
    await page.waitForSelector('#input-landing-customer-name', { timeout: 5000 });
    console.log('PASS: Switched to Pelanggan tab.');

    const testPhone = `0812${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testName = `Tamu Tester ${Math.floor(Math.random() * 1000)}`;
    const testEmail = `tamu${Date.now()}@areztest.com`;

    console.log(`3. Filling customer form: ${testName} / ${testEmail} / ${testPhone}`);
    await page.locator('#input-landing-customer-name').fill(testName);
    await page.locator('#input-landing-customer-phone').fill(testPhone);
    await page.locator('#input-landing-customer-email').fill(testEmail);

    console.log('4. Clicking #btn-submit-customer-login ...');
    await page.locator('#btn-submit-customer-login').click();

    // Wait for Landing Page to transition to Main App Header
    await page.waitForSelector('#main-app-header', { timeout: 10000 });
    console.log('PASS: Customer logged in and main app loaded.');

    await page.waitForSelector('text=Selamat datang', { timeout: 5000 });
    const greeting = await page.locator('text=Selamat datang').innerText();
    console.log(`PASS: Greeting is "${greeting}"`);

    console.log('6. Checking queue status / Taking queue ticket...');
    const hasActiveTicket = await page.locator('#my-active-ticket').isVisible().catch(() => false);

    if (hasActiveTicket) {
      console.log('PASS: Active ticket already displayed.');
    } else {
      console.log('Selecting service & submitting queue...');
      // Wait for service card
      await page.waitForSelector('div[role="button"]:has-text("Signature Haircut")', { timeout: 10000 });
      await page.locator('div[role="button"]:has-text("Signature Haircut")').first().click();

      // Fill notes
      const notesInput = page.locator('input[placeholder*="Misal: Low fade"], textarea').first();
      if (await notesInput.isVisible()) {
        await notesInput.fill('Fade 1.5 rapih samping');
      }

      // Click submit
      await page.locator('#btn-submit-take-queue').click();
      console.log('Submitted queue request.');

      // Wait for ticket card to appear
      await page.waitForSelector('#my-active-ticket', { timeout: 10000 });
      console.log('PASS: Active Ticket Card appeared on screen!');
    }

    console.log('7. Testing queue cancellation...');
    page.on('dialog', async dialog => {
      console.log(`Accepted dialog: "${dialog.message()}"`);
      await dialog.accept();
    });

    const cancelBtn = page.locator('button:has-text("Batalkan Antrean Saya")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForSelector('#my-active-ticket', { state: 'detached', timeout: 10000 });
      console.log('PASS: Ticket cancelled and returned to queue form.');
    }

    console.log('8. Testing Navigation Tabs (Layanan, Riwayat, Notifikasi)...');
    await page.locator('button:has-text("Layanan")').first().click();
    await page.waitForSelector('text=Katalog Layanan Grooming', { timeout: 5000 });
    console.log('PASS: Layanan tab verified.');

    await page.locator('button:has-text("Riwayat")').first().click();
    await page.waitForSelector('text=Riwayat Kunjungan', { timeout: 5000 });
    console.log('PASS: Riwayat tab verified.');

    await page.locator('button:has-text("Notifikasi")').first().click();
    await page.waitForSelector('text=Pusat Notifikasi', { timeout: 5000 });
    console.log('PASS: Notifikasi tab verified.');

    console.log('9. Testing Profile Drawer & Logout...');
    await page.locator('#btn-header-profile-trigger').click();
    await page.waitForSelector('#btn-profile-sheet-logout', { timeout: 5000 });
    await page.locator('#btn-profile-sheet-logout').click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#landing-auth-card', { timeout: 5000 });
    console.log('PASS: Logged out successfully.');

    console.log('=== TEST SUITE 1 (CUSTOMER EXPERIENCE) PASSED 100% ===');
  } catch (err) {
    console.error('FAIL: Test Suite 1 encountered error:', err);
    await page.screenshot({ path: 'test-error-customer.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runCustomerTests().catch(e => {
  console.error(e);
  process.exit(1);
});
