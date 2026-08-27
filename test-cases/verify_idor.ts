import assert from 'node:assert';
import { db } from '../server/db.js';
import express from 'express';
import apiRouter from '../server/routes.js';
import cookieParser from 'cookie-parser';
import { createSession } from '../server/auth.js';

const app = express();
app.use(express.json());
app.use(cookieParser('secret'));
app.use('/api', apiRouter);

const server = app.listen(0, async () => {
  const port = (server.address() as any).port;
  console.log(`--- STARTING IDOR VERIFICATION TESTS (PORT ${port}) ---`);

  // Seed Users into memory (ensureFreshData will preserve them now due to the bug fix)
  db.getData().users.push({
    id: 'usr-cust-A',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    full_name: 'Attacker Customer A',
    email: 'attacker@test.com',
    total_visits: 0,
    created_at: new Date().toISOString(),
    last_visit_at: null
  });

  db.getData().users.push({
    id: 'usr-cust-B',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    full_name: 'Victim Customer B',
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

  // Generate tokens
  const tokenA = createSession('usr-cust-A', 'CUSTOMER').sessionId;

  // ---------------------------------------------------------
  // TEST 1: POST /queues (Create Queue)
  // ---------------------------------------------------------
  console.log('\n[TEST 1] POST /queues: User A attempts to create queue for User B (IDOR)');
  const res1 = await fetch(`http://localhost:${port}/api/queues`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      customer_id: 'usr-cust-B', // Malicious payload aiming at Victim B
      service_id: 'srv-test',
      source: 'ONLINE'
    })
  });
  
  const body1 = await res1.json();
  console.log(`Status: ${res1.status}`);
  console.log('Body:', JSON.stringify(body1, null, 2));

  // ---------------------------------------------------------
  // TEST 2: DELETE /queues/:id (Delete Queue)
  // ---------------------------------------------------------
  console.log('\n[TEST 2] DELETE /queues/:id: User A attempts to delete User B\'s queue (IDOR)');
  
  // Directly insert a queue for Victim B
  const queueB_id = `q-victim-${Date.now()}`;
  db.getData().queues.push({
    id: queueB_id,
    queue_date: new Date().toISOString().split('T')[0],
    queue_number: 99,
    customer_id: 'usr-cust-B',
    walk_in_name: null,
    service_id: 'srv-test',
    source: 'ONLINE',
    status: 'WAITING',
    start_time: null,
    end_time: null,
    created_at: new Date().toISOString()
  });

  const res2 = await fetch(`http://localhost:${port}/api/queues/${queueB_id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${tokenA}`
    }
  });

  const body2 = await res2.json();
  console.log(`Status: ${res2.status}`);
  console.log('Body:', JSON.stringify(body2, null, 2));

  // ---------------------------------------------------------
  // TEST 3: GET /notifications/:user_id (Read Notifications)
  // ---------------------------------------------------------
  console.log('\n[TEST 3] GET /notifications/:user_id: User A attempts to read User B\'s notifications (IDOR)');
  
  const res3 = await fetch(`http://localhost:${port}/api/notifications/usr-cust-B`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenA}`
    }
  });

  const body3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log('Body:', JSON.stringify(body3, null, 2));

  // ---------------------------------------------------------
  // TEST 4: GET /transactions (Read POS Transactions)
  // ---------------------------------------------------------
  console.log('\n[TEST 4] GET /transactions: User A attempts to read POS Transactions (IDOR / Privilege Escalation)');
  
  const res4 = await fetch(`http://localhost:${port}/api/transactions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenA}`
    }
  });

  const body4 = await res4.json();
  console.log(`Status: ${res4.status}`);
  console.log('Body:', JSON.stringify(body4, null, 2));

  // ---------------------------------------------------------
  // TEST 5: POST /hpp (Modify Master HPP)
  // ---------------------------------------------------------
  console.log('\n[TEST 5] POST /hpp: User A attempts to add Master HPP (IDOR / Privilege Escalation)');
  
  const res5 = await fetch(`http://localhost:${port}/api/hpp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({ item_name: 'Stolen Shampoo', unit_cost: 1000 })
  });

  const body5 = await res5.json();
  console.log(`Status: ${res5.status}`);
  console.log('Body:', JSON.stringify(body5, null, 2));

  console.log('\n--- TESTS COMPLETED ---');
  server.close();
  process.exit(0);
});
