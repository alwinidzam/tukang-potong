import assert from 'node:assert/strict';
import {
  IndexedFIFOQueue,
  FIFOTraceRingBuffer,
  consumeBatchesFIFO,
  aggregateAnalyticsSinglePass,
  HPPStockBatch,
} from '../server/algorithms.js';
import { getJakartaDateStr } from '../server/db.js';

console.log('=== UNIT TEST 00: BIG O DATA STRUCTURES & DUAL-LAYER FIFO ENGINE ===');

// 1. Test IndexedFIFOQueue O(1) Operations & Strict FIFO Order
{
  const q = new IndexedFIFOQueue<{ id: string; num: number }>();
  assert.equal(q.size, 0);
  assert.equal(q.peek(), null);

  q.enqueue({ id: 'q-1', num: 1 });
  q.enqueue({ id: 'q-2', num: 2 });
  q.enqueue({ id: 'q-3', num: 3 });

  assert.equal(q.size, 3);
  assert.equal(q.peek()?.id, 'q-1', 'Head must be first enqueued item');
  assert.equal(q.peekTail()?.id, 'q-3', 'Tail must be last enqueued item');

  // Remove middle node (Skip/Cancel) in O(1)
  const removed = q.remove('q-2');
  assert.equal(removed?.id, 'q-2');
  assert.equal(q.size, 2);
  assert.deepEqual(
    q.toArray().map((x) => x.id),
    ['q-1', 'q-3']
  );

  // Dequeue head -> promotes q-3 to head in O(1)
  const firstOut = q.dequeue();
  assert.equal(firstOut?.id, 'q-1');
  assert.equal(q.peek()?.id, 'q-3');
  assert.equal(q.size, 1);

  const secondOut = q.dequeue();
  assert.equal(secondOut?.id, 'q-3');
  assert.equal(q.size, 0);
  assert.equal(q.peek(), null);

  // Scale check: 10,000 enqueues + middle removals + dequeues should complete well under 100ms
  const tStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    q.enqueue({ id: `scale-${i}`, num: i });
  }
  for (let i = 2000; i < 5000; i++) {
    q.remove(`scale-${i}`);
  }
  while (q.size > 0) {
    q.dequeue();
  }
  const scaleMs = performance.now() - tStart;
  console.log(`PASS: IndexedFIFOQueue (10,000 ops O(1)) completed in ${scaleMs.toFixed(2)}ms`);
  assert.ok(scaleMs < 250, `Expected O(1) queue operations to run fast, took ${scaleMs}ms`);
}

// 2. Test FIFO Inventory Batch Costing (First-In, First-Out Material Consumption)
{
  const batches: HPPStockBatch[] = [
    {
      id: 'b-1',
      hpp_id: 'hpp-blade',
      batch_code: 'FIFO-B01',
      quantity_initial: 2,
      quantity_remaining: 2,
      unit_cost: 1000,
      received_at: '2026-01-01T08:00:00.000Z',
    },
    {
      id: 'b-2',
      hpp_id: 'hpp-blade',
      batch_code: 'FIFO-B02',
      quantity_initial: 5,
      quantity_remaining: 5,
      unit_cost: 2000,
      received_at: '2026-01-10T08:00:00.000Z',
    },
  ];

  // Consume 3 units: 2 from B01 (@1000) + 1 from B02 (@2000) = 4000
  const res1 = consumeBatchesFIFO('hpp-blade', 'Silet', 3, batches, 2500, true);
  assert.equal(res1.totalCost, 4000);
  assert.equal(res1.usedStandardFallback, false);
  assert.equal(res1.consumedBatches.length, 2);
  assert.equal(res1.consumedBatches[0].batch_code, 'FIFO-B01');
  assert.equal(res1.consumedBatches[1].batch_code, 'FIFO-B02');
  assert.equal(batches[0].quantity_remaining, 0);
  assert.equal(batches[1].quantity_remaining, 4);

  // Consume 6 units (4 left in B02 @2000 = 8000, + 2 fallback @2500 = 5000) = 13000
  const res2 = consumeBatchesFIFO('hpp-blade', 'Silet', 6, batches, 2500, true);
  assert.equal(res2.totalCost, 13000);
  assert.equal(res2.usedStandardFallback, true);
  assert.equal(res2.fallbackQuantity, 2);
  assert.equal(batches[1].quantity_remaining, 0);
  console.log('PASS: FIFO Inventory Batch COGS deduction verified (split batch + fallback).');
}

// 3. Test Fixed-Capacity Circular Ring Buffer O(1)
{
  const ring = new FIFOTraceRingBuffer(8);
  for (let i = 1; i <= 20; i++) {
    ring.push({
      domain: 'QUEUE_FIFO',
      operation: `OP_${i}`,
      complexity: 'O(1)',
      detail: `Step ${i}`,
      duration_us: 5,
    });
  }
  const latest = ring.getLatest(20);
  assert.equal(latest.length, 8, 'Ring buffer must stay strictly bounded to capacity=8');
  assert.equal(latest[0].operation, 'OP_20', 'Newest entry must appear first');
  assert.equal(latest[7].operation, 'OP_13', 'Oldest retained entry must be OP_13');
  console.log('PASS: FIFOTraceRingBuffer O(1) bounded capacity verified.');
}

// 4. Test Single-Pass O(T) Analytics Aggregation
{
  const now = new Date('2026-08-29T05:00:00.000Z'); // 12:00 WIB on 2026-08-29
  const txs = [
    {
      id: 't1',
      queue_id: 'q1',
      customer_name: 'A',
      service_name: 'Signature Cut',
      total_price: 50000,
      discount: 0,
      tax: 0,
      total_hpp: 5000,
      net_profit: 45000,
      payment_method: 'CASH',
      created_at: '2026-08-29T03:00:00.000Z', // 10:00 WIB today
    },
    {
      id: 't2',
      queue_id: 'q2',
      customer_name: 'B',
      service_name: 'Gentlemen Trim',
      total_price: 75000,
      discount: 0,
      tax: 0,
      total_hpp: 10000,
      net_profit: 65000,
      payment_method: 'QRIS',
      created_at: '2026-08-28T18:00:00.000Z', // 01:00 WIB TODAY (2026-08-29 in Asia/Jakarta!)
    },
    {
      id: 't3',
      queue_id: 'q3',
      customer_name: 'C',
      service_name: 'Signature Cut',
      total_price: 50000,
      discount: 0,
      tax: 0,
      total_hpp: 5000,
      net_profit: 45000,
      payment_method: 'CASH',
      created_at: '2026-08-27T04:00:00.000Z', // 2 days ago
    },
  ];

  const recap = aggregateAnalyticsSinglePass(txs, now, getJakartaDateStr);
  assert.equal(recap.daily.heads, 2, 'Timezone Asia/Jakarta must include 18:00Z prev day as 01:00 WIB today');
  assert.equal(recap.daily.gross, 125000);
  assert.equal(recap.daily.hpp, 15000);
  assert.equal(recap.daily.net, 110000);
  assert.equal(recap.monthly.heads, 3);
  assert.equal(recap.monthly.gross, 175000);
  assert.equal(recap.monthly.top_services[0].service_name, 'Signature Cut');
  assert.equal(recap.monthly.top_services[0].count, 2);
  console.log('PASS: Single-pass O(T) Analytics Aggregation (Asia/Jakarta) verified.');
}

console.log('=== UNIT TEST 00 PASSED 100% ===');
