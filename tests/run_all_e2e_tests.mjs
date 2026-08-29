import { spawn } from 'child_process';
import path from 'path';

const testSuites = [
  { name: 'Suite 3: Master HPP Inventory, Services & Recipe Margin', file: 'tests/03_master_hpp_and_services_flow.mjs' },
  { name: 'Suite 1: Customer Experience & Online Queue Lifecycle', file: 'tests/01_customer_flow.mjs' },
  { name: 'Suite 2: Owner POS, Real-time Queue & Cashier Checkout', file: 'tests/02_owner_pos_flow.mjs' },
  { name: 'Suite 4: Staff Management, RBAC & Customer CRM', file: 'tests/04_staff_and_crm_flow.mjs' },
  { name: 'Suite 5: Financial Analytics, KPI Periods & Reporting', file: 'tests/05_analytics_and_audit_flow.mjs' },
];

async function runSuite(suite) {
  return new Promise((resolve, reject) => {
    console.log(`\n===============================================================`);
    console.log(`RUNNING: ${suite.name}`);
    console.log(`SCRIPT:  ${suite.file}`);
    console.log(`===============================================================`);

    const start = Date.now();
    const child = spawn(process.execPath, [suite.file], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`>>> SUCCESS: ${suite.name} passed in ${duration}s.`);
        resolve({ suite: suite.name, status: 'PASSED', duration: `${duration}s` });
      } else {
        console.error(`>>> FAILED: ${suite.name} exited with code ${code} after ${duration}s.`);
        reject(new Error(`Suite ${suite.name} failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function runAll() {
  const results = [];
  const overallStart = Date.now();

  for (const suite of testSuites) {
    try {
      const res = await runSuite(suite);
      results.push(res);
    } catch (err) {
      console.error(`Test execution halted due to failure:`, err.message);
      process.exit(1);
    }
  }

  const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(2);

  console.log(`\n\n===============================================================`);
  console.log(`           ALL PLAYWRIGHT E2E TEST SUITES PASSED!             `);
  console.log(`===============================================================`);
  console.table(results);
  console.log(`Total E2E Execution Time: ${totalDuration}s`);
  console.log(`Full System Audit & E2E Verification is 100% COMPLETE.`);
}

runAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
