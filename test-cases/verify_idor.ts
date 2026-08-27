import assert from 'node:assert';
import { db } from '../server/db.js';
import express from 'express';
import apiRouter from '../server/routes.js';
import cookieParser from 'cookie-parser';

const app = express();
app.use(express.json());
app.use(cookieParser('secret'));
app.use('/api', apiRouter);

const server = app.listen(0, async () => {
  const port = (server.address() as any).port;
  console.log(`--- STARTING VERIFICATION TESTS (PORT ${port}) ---`);

  // Test 1: IDOR Vulnerability on POST /queues
  console.log('1. Testing IDOR Vulnerability on POST /queues');
  
  // Seed a dummy customer
  db.getData().users.push({
    id: 'usr-cust-victim',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    full_name: 'Victim Customer',
    email: 'victim@test.com',
    total_visits: 0,
    created_at: new Date().toISOString(),
    last_visit_at: null
  });
  db.getData().services.push({
    id: 'srv-test',
    service_name: 'Test Cut',
    selling_price: 50000,
    duration_mins: 15,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Anonymous request to create queue for victim
  const res = await fetch(`http://localhost:${port}/api/queues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: 'usr-cust-victim',
      service_id: 'srv-test',
      source: 'ONLINE'
    })
  });
  
  const body = await res.json();

  if (res.status === 200) {
    console.log('❌ VULNERABILITY CONFIRMED: Anonymous user successfully queued for Victim!');
    console.log('   Queue created:', body.queue.id, 'for customer:', body.queue.customer_id);
  } else {
    console.log('✅ FIXED: Anonymous user rejected with status', res.status);
    console.log('   Response:', body);
  }

  console.log('--- TESTS COMPLETED ---');
  server.close();
  process.exit(0);
});
