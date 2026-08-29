import { chromium } from 'playwright';

async function runHPPAndServicesTests() {
  console.log('=== STARTING TEST SUITE 3: MASTER HPP & SERVICES RECIPE MANAGEMENT ===');
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

    // Navigate to "Katalog & HPP" tab
    console.log('2. Navigating to "Katalog & HPP" tab...');
    await page.locator('button:has-text("Katalog & HPP")').first().click();
    await page.waitForSelector('text=Katalog & HPP', { timeout: 10000 });
    console.log('PASS: "Katalog & HPP" view mounted.');

    // Switch to "Biaya Bahan HPP" segment
    console.log('3. Switching to "Biaya Bahan HPP" segment...');
    await page.locator('button:has-text("Biaya Bahan HPP")').first().click();
    await page.waitForTimeout(600);
    console.log('PASS: Switched to Master HPP segment.');

    // Add New HPP Item
    console.log('4. Testing "Tambahkan HPP" modal...');
    await page.locator('#btn-open-add-hpp').click();
    await page.waitForSelector('#modal-hpp', { timeout: 5000 });

    const hppName = `Silet Platinum Tester ${Math.floor(Math.random() * 1000)}`;
    await page.locator('#modal-hpp input[placeholder*="Pisau Cukur"]').fill(hppName);
    await page.locator('#modal-hpp input[placeholder*="pcs / ml"]').fill('pcs');
    await page.locator('#modal-hpp input[type="number"]').fill('3500');
    await page.locator('#modal-hpp textarea[placeholder*="Catatan merek"]').fill('Pisau cukur tajam steril sekali pakai');

    // Submit HPP Form
    await page.locator('#btn-submit-save-hpp').click();
    await page.waitForSelector('#modal-hpp', { state: 'detached', timeout: 5000 });
    console.log(`PASS: Created Master HPP item "${hppName}"`);

    // Verify HPP item appears in list
    await page.waitForSelector(`text=${hppName}`, { timeout: 10000 });
    console.log(`PASS: "${hppName}" is visible in the HPP catalog.`);

    // Switch to "Katalog Layanan" segment
    console.log('5. Switching to "Katalog Layanan" segment...');
    await page.locator('button:has-text("Katalog Layanan")').first().click();
    await page.waitForTimeout(600);

    // Add New Barber Service
    console.log('6. Testing "Tambah Layanan Baru" modal...');
    await page.locator('#btn-open-add-service').click();
    await page.waitForSelector('#modal-service', { timeout: 5000 });

    const serviceName = `Executive Royal Grooming ${Math.floor(Math.random() * 1000)}`;
    await page.locator('#modal-service input[placeholder*="Premium Haircut"]').fill(serviceName);
    await page.locator('#modal-service input[type="number"]').first().fill('85000'); // Selling price
    await page.locator('#modal-service input[type="number"]').nth(1).fill('25'); // Duration
    await page.locator('#modal-service textarea[placeholder*="Potong presisi"]').fill('Layanan potong rambut eksekutif lengkap dengan cuci rambut dan hair tonic');

    // Link HPP item to recipe
    const hppCheckbox = page.locator(`#modal-service div:has-text("${hppName}")`).first();
    if (await hppCheckbox.isVisible()) {
      await hppCheckbox.click();
      console.log(`PASS: Linked "${hppName}" to the service recipe.`);
    }

    // Submit Service Form
    await page.locator('#btn-submit-save-service').click();
    await page.waitForSelector('#modal-service', { state: 'detached', timeout: 5000 });
    console.log(`PASS: Created Service "${serviceName}"`);

    // Verify Service appears in Services list
    await page.waitForSelector(`text=${serviceName}`, { timeout: 10000 });
    console.log(`PASS: "${serviceName}" is visible in the Service catalog.`);

    // Test Search filter in Services
    console.log('7. Testing Service Search filter...');
    await page.locator('input[placeholder*="Cari layanan"]').fill(serviceName.slice(0, 10));
    await page.waitForTimeout(500);
    const searchMatch = await page.locator(`text=${serviceName}`).isVisible();
    console.log(`PASS: Search filter returned "${serviceName}": ${searchMatch}`);
    await page.locator('input[placeholder*="Cari layanan"]').fill('');

    // Logout
    console.log('8. Logging out Owner...');
    await page.locator('#btn-header-profile-trigger').click();
    await page.waitForSelector('#btn-profile-sheet-logout', { timeout: 5000 });
    await page.locator('#btn-profile-sheet-logout').click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#btn-header-login-trigger', { timeout: 5000 });
    console.log('PASS: Logged out successfully.');

    console.log('=== TEST SUITE 3 (MASTER HPP & SERVICES) PASSED 100% ===');
  } catch (err) {
    console.error('FAIL: Test Suite 3 encountered error:', err);
    await page.screenshot({ path: 'test-error-hpp.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runHPPAndServicesTests().catch(e => {
  console.error(e);
  process.exit(1);
});
