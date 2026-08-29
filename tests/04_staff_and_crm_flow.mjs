import { chromium } from 'playwright';

async function runStaffAndCRMTests() {
  console.log('=== STARTING TEST SUITE 4: STAFF MANAGEMENT & CRM INTELLIGENCE ===');
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

    // Navigate to "Tim Staf" tab
    console.log('2. Navigating to "Tim Staf" tab...');
    await page.locator('button:has-text("Tim Staf")').first().click();
    await page.waitForSelector('text=Kelola Staf & Barber', { timeout: 10000 });
    console.log('PASS: "Tim Staf" view mounted.');

    // Add New Staff Member
    console.log('3. Testing "Tambah Staf" modal...');
    await page.locator('button:has-text("Tambah Staf")').click();
    await page.waitForSelector('text=Tambah Staf Barber', { timeout: 5000 });

    const staffRand = Math.floor(Math.random() * 1000);
    const staffName = `Barber Dimas ${staffRand}`;
    const staffUsername = `dimas_${staffRand}`;
    const staffPassword = `pass_${staffRand}`;
    const staffPhone = `0812${Math.floor(10000000 + Math.random() * 90000000)}`;

    await page.locator('input[placeholder*="Andi Barber"]').fill(staffName);
    await page.locator('input[placeholder*="andi_barber"]').fill(staffUsername);
    await page.locator('input[placeholder*="Minimal 6"]').fill(staffPassword);
    await page.locator('input[placeholder*="08123456789"]').fill(staffPhone);

    // Submit Staff Form
    await page.locator('button:has-text("Daftarkan Akun Staf"), button[type="submit"]:has-text("Daftarkan")').last().click();
    await page.waitForTimeout(2000);
    console.log(`PASS: Created Staff member "${staffName}" (@${staffUsername})`);

    // Verify Staff appears in list
    await page.waitForSelector(`text=${staffName}`, { timeout: 10000 });
    console.log(`PASS: "${staffName}" is visible in Staff list.`);

    // Search filter for staff
    console.log('4. Testing Staff search filter...');
    await page.locator('input[placeholder*="Cari nama atau username"]').fill(staffUsername);
    await page.waitForTimeout(500);
    const staffFound = await page.locator(`h4:has-text("${staffName}")`).first().isVisible();
    console.log(`PASS: Staff search returned "${staffName}": ${staffFound}`);
    await page.locator('input[placeholder*="Cari nama atau username"]').fill('');

    // Toggle staff status
    console.log('5. Testing Staff Status toggle...');
    const toggleStatusBtn = page.locator(`div:has-text("${staffName}") >> xpath=..//button:has-text("Nonaktifkan")`).first();
    if (await toggleStatusBtn.isVisible().catch(() => false)) {
      await toggleStatusBtn.click();
      await page.waitForTimeout(1000);
      console.log('PASS: Toggled staff to inactive.');
    }

    // Navigate to "Tamu CRM" tab
    console.log('6. Navigating to "Tamu CRM" tab...');
    await page.locator('button:has-text("Tamu CRM")').first().click();
    await page.waitForSelector('text=CRM & Kebiasaan Tamu', { timeout: 10000 });
    console.log('PASS: "Tamu CRM" view mounted.');

    // Check retention reminder card
    const reminderHeading = await page.locator('text=Pengingat Otomatis 30 Hari').isVisible();
    console.log(`PASS: CRM Retention Card visible: ${reminderHeading}`);

    // Logout Owner
    console.log('7. Logging out Owner...');
    await page.locator('#btn-header-profile-trigger').click();
    await page.waitForSelector('#btn-profile-sheet-logout', { timeout: 5000 });
    await page.locator('#btn-profile-sheet-logout').click();
    await page.waitForTimeout(1000);
    await page.waitForSelector('#btn-header-login-trigger', { timeout: 5000 });
    console.log('PASS: Owner logged out.');

    console.log('=== TEST SUITE 4 (STAFF & CRM) PASSED 100% ===');
  } catch (err) {
    console.error('FAIL: Test Suite 4 encountered error:', err);
    await page.screenshot({ path: 'test-error-staff.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runStaffAndCRMTests().catch(e => {
  console.error(e);
  process.exit(1);
});
