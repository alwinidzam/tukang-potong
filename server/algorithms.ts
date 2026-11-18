/**
 * ==============================================================================
 * AREZ BARBERSHOP — BIG O & FIFO ALGORITHMS ENGINE
 * ==============================================================================
 * Core CS Data Structures & Algorithms:
 * 1. IndexedFIFOQueue<T>        : Doubly-Linked List + HashMap Index -> O(1) enqueue, dequeue, peek, remove
 * 2. FIFOBatchInventoryEngine   : Head-Pointer Batch Queue           -> O(1) amortized FIFO COGS deduction
 * 3. FIFOTraceRingBuffer        : Fixed-Capacity Circular Buffer     -> O(1) bounded audit logging
 * 4. aggregateAnalyticsSinglePass: Hash-Bucket Single Pass           -> O(T) analytics aggregation
 * ==============================================================================
 */

export interface QueueNode<T> {
  value: T;
  prev: QueueNode<T> | null;
  next: QueueNode<T> | null;
}

/**
 * Doubly-Linked Queue backed by a HashMap Index (`Map<string, QueueNode<T>>`).
 * - enqueue(item): O(1)
 * - dequeue():     O(1)
 * - peek():        O(1)
 * - remove(id):    O(1) via direct prev/next pointer unlink (avoids O(n) Array.splice shifts)
 * - has(id)/get(id): O(1)
 */
export class IndexedFIFOQueue<T extends { id: string }> {
  private head: QueueNode<T> | null = null;
  private tail: QueueNode<T> | null = null;
  private nodeMap: Map<string, QueueNode<T>> = new Map();

  public get size(): number {
    return this.nodeMap.size;
  }

  public clear(): void {
    this.head = null;
    this.tail = null;
    this.nodeMap.clear();
  }

  /** O(1) Peek at the oldest item waiting at FIFO Head */
  public peek(): T | null {
    return this.head ? this.head.value : null;
  }

  /** O(1) Peek at the newest item at FIFO Tail */
  public peekTail(): T | null {
    return this.tail ? this.tail.value : null;
  }

  /** O(1) Lookup by ID */
  public get(id: string): T | undefined {
    return this.nodeMap.get(id)?.value;
  }

  /** O(1) Existence check by ID */
  public has(id: string): boolean {
    return this.nodeMap.has(id);
  }

  /** O(1) Append to tail (or update payload in-place if already queued) */
  public enqueue(item: T): void {
    const existing = this.nodeMap.get(item.id);
    if (existing) {
      existing.value = item;
      return;
    }

    const node: QueueNode<T> = { value: item, prev: this.tail, next: null };
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.nodeMap.set(item.id, node);
  }

  /** O(1) Pop from head (First-In, First-Out) */
  public dequeue(): T | null {
    if (!this.head) return null;
    const removed = this.head;
    this.head = removed.next;
    if (this.head) {
      this.head.prev = null;
    } else {
      this.tail = null;
    }
    removed.next = null;
    removed.prev = null;
    this.nodeMap.delete(removed.value.id);
    return removed.value;
  }

  /** O(1) Arbitrary removal / cancellation / skip by ID via doubly-linked pointers */
  public remove(id: string): T | null {
    const node = this.nodeMap.get(id);
    if (!node) return null;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
    this.nodeMap.delete(id);
    return node.value;
  }

  /** O(K) traversal returning active queue items in strict FIFO order */
  public toArray(): T[] {
    const result: T[] = [];
    let curr = this.head;
    while (curr) {
      result.push(curr.value);
      curr = curr.next;
    }
    return result;
  }

  /**
   * O(K log K) rebuild from snapshot (used only at startup / cloud sync)
   */
  public rebuild(items: T[], compareFn: (a: T, b: T) => number): void {
    this.clear();
    const sorted = [...items].sort(compareFn);
    for (const item of sorted) {
      this.enqueue(item);
    }
  }
}

export interface FIFOTraceEntry {
  id: string;
  timestamp: string;
  domain: 'QUEUE_FIFO' | 'HPP_BATCH_FIFO' | 'HASH_INDEX' | 'ANALYTICS';
  operation: string;
  complexity: string;
  detail: string;
  duration_us: number;
}

/**
 * Fixed-Capacity Circular Ring Buffer for O(1) Audit Telemetry.
 * Eliminates O(N) Array.unshift() and prevents unbounded memory growth.
 */
export class FIFOTraceRingBuffer {
  private buffer: (FIFOTraceEntry | undefined)[];
  private capacity: number;
  private writePtr = 0;
  private count = 0;

  constructor(capacity = 60) {
    this.capacity = Math.max(8, capacity);
    this.buffer = new Array(this.capacity);
  }

  /** O(1) time & O(1) space insert */
  public push(entry: Omit<FIFOTraceEntry, 'id' | 'timestamp'>): FIFOTraceEntry {
    const fullEntry: FIFOTraceEntry = {
      id: `trace-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.buffer[this.writePtr] = fullEntry;
    this.writePtr = (this.writePtr + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
    return fullEntry;
  }

  /** O(L) read newest-first without mutating or sorting */
  public getLatest(limit = 25): FIFOTraceEntry[] {
    const n = Math.min(limit, this.count);
    const out: FIFOTraceEntry[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (this.writePtr - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[idx];
      if (item) out.push(item);
    }
    return out;
  }
}

export interface HPPStockBatch {
  id: string;
  hpp_id: string;
  batch_code: string;
  quantity_initial: number;
  quantity_remaining: number;
  unit_cost: number;
  received_at: string;
  notes?: string;
}

export interface FIFOBatchConsumptionDetail {
  batch_id: string;
  batch_code: string;
  hpp_id: string;
  item_name?: string;
  quantity_taken: number;
  unit_cost: number;
  subtotal: number;
}

export interface FIFOConsumptionResult {
  totalCost: number;
  consumedBatches: FIFOBatchConsumptionDetail[];
  fallbackQuantity: number;
  fallbackCost: number;
  usedStandardFallback: boolean;
}

/**
 * Consumes stock from oldest non-empty batches first (First-In, First-Out).
 * Head pointer advances monotonically in O(1) amortized time per batch.
 * Never fails checkout on stockout: unstocked remainder falls back cleanly to master unit_cost.
 */
export function consumeBatchesFIFO(
  hppId: string,
  itemName: string,
  quantityNeeded: number,
  orderedBatches: HPPStockBatch[],
  fallbackUnitCost: number,
  mutate = true
): FIFOConsumptionResult {
  let remaining = Math.max(0, Number(quantityNeeded) || 0);
  let totalCost = 0;
  const consumedBatches: FIFOBatchConsumptionDetail[] = [];

  for (let i = 0; i < orderedBatches.length && remaining > 0; i++) {
    const batch = orderedBatches[i];
    if (!batch || batch.quantity_remaining <= 0) continue;

    const take = Math.min(batch.quantity_remaining, remaining);
    const subtotal = take * batch.unit_cost;

    if (mutate) {
      batch.quantity_remaining = Number((batch.quantity_remaining - take).toFixed(4));
    }

    totalCost += subtotal;
    remaining = Number((remaining - take).toFixed(4));

    consumedBatches.push({
      batch_id: batch.id,
      batch_code: batch.batch_code,
      hpp_id: hppId,
      item_name: itemName,
      quantity_taken: take,
      unit_cost: batch.unit_cost,
      subtotal: Math.round(subtotal),
    });
  }

  let fallbackQuantity = 0;
  let fallbackCost = 0;
  if (remaining > 0) {
    fallbackQuantity = remaining;
    fallbackCost = remaining * Math.max(0, Number(fallbackUnitCost) || 0);
    totalCost += fallbackCost;
  }

  return {
    totalCost: Math.round(totalCost),
    consumedBatches,
    fallbackQuantity,
    fallbackCost: Math.round(fallbackCost),
    usedStandardFallback: fallbackQuantity > 0,
  };
}

export interface TransactionRecordLike {
  id: string;
  queue_id: string;
  customer_name: string;
  service_name: string;
  total_price: number;
  discount: number;
  tax: number;
  total_hpp: number;
  net_profit: number;
  payment_method: string;
  created_at: string;
}

export interface SinglePassRecapResult {
  daily: {
    date: string;
    gross: number;
    hpp: number;
    net: number;
    heads: number;
    avg_ticket: number;
  };
  weekly: {
    date: string;
    day: string;
    gross: number;
    net: number;
    heads: number;
  }[];
  monthly: {
    month: string;
    gross: number;
    hpp: number;
    net: number;
    heads: number;
    margin_percent: number;
    top_services: {
      service_name: string;
      count: number;
      gross: number;
      profit: number;
    }[];
  };
}

/**
 * Single-Pass O(T) Analytics Aggregation across transactions using Hash Buckets.
 * Replaces repeated O(10 * T) filter+reduce loops with 1 chronological bucket pass.
 */
export function aggregateAnalyticsSinglePass(
  transactions: TransactionRecordLike[],
  now: Date,
  getJakartaDateFn: (d: Date) => string
): SinglePassRecapResult {
  const todayStr = getJakartaDateStrSafe(now, getJakartaDateFn);
  const currentMonthPrefix = todayStr.slice(0, 7); // YYYY-MM in Asia/Jakarta

  // Build 7-day O(1) lookup bucket map
  const weeklyDays: { date: string; day: string; gross: number; net: number; heads: number }[] = [];
  const weeklyBucketByDate = new Map<string, { date: string; day: string; gross: number; net: number; heads: number }>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dStr = getJakartaDateFn(d);
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' });
    const bucket = { date: dStr, day: dayName, gross: 0, net: 0, heads: 0 };
    weeklyDays.push(bucket);
    weeklyBucketByDate.set(dStr, bucket);
  }

  let dailyGross = 0;
  let dailyHPP = 0;
  let dailyNet = 0;
  let dailyHeads = 0;

  let monthlyGross = 0;
  let monthlyHPP = 0;
  let monthlyNet = 0;
  let monthlyHeads = 0;

  const serviceStatsMap = new Map<string, { count: number; gross: number; profit: number }>();

  // Single O(T) pass
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (!t || !t.created_at) continue;

    // Convert created_at to Jakarta YYYY-MM-DD consistently
    const txJakartaDate = getJakartaDateFn(new Date(t.created_at));
    const price = Number(t.total_price) || 0;
    const hpp = Number(t.total_hpp) || 0;
    const net = Number(t.net_profit) || 0;

    if (txJakartaDate === todayStr) {
      dailyGross += price;
      dailyHPP += hpp;
      dailyNet += net;
      dailyHeads += 1;
    }

    const weekBucket = weeklyBucketByDate.get(txJakartaDate);
    if (weekBucket) {
      weekBucket.gross += price;
      weekBucket.net += net;
      weekBucket.heads += 1;
    }

    if (txJakartaDate.startsWith(currentMonthPrefix)) {
      monthlyGross += price;
      monthlyHPP += hpp;
      monthlyNet += net;
      monthlyHeads += 1;

      const sName = t.service_name || 'Layanan';
      let stats = serviceStatsMap.get(sName);
      if (!stats) {
        stats = { count: 0, gross: 0, profit: 0 };
        serviceStatsMap.set(sName, stats);
      }
      stats.count += 1;
      stats.gross += price;
      stats.profit += net;
    }
  }

  const overallMarginPercent = monthlyGross > 0 ? Math.round((monthlyNet / monthlyGross) * 100) : 0;

  const topServices = Array.from(serviceStatsMap.entries())
    .map(([service_name, stats]) => ({
      service_name,
      ...stats,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    daily: {
      date: todayStr,
      gross: dailyGross,
      hpp: dailyHPP,
      net: dailyNet,
      heads: dailyHeads,
      avg_ticket: dailyHeads > 0 ? Math.round(dailyGross / dailyHeads) : 0,
    },
    weekly: weeklyDays,
    monthly: {
      month: now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }),
      gross: monthlyGross,
      hpp: monthlyHPP,
      net: monthlyNet,
      heads: monthlyHeads,
      margin_percent: overallMarginPercent,
      top_services: topServices,
    },
  };
}

function getJakartaDateStrSafe(now: Date, fn: (d: Date) => string): string {
  return fn(now);
}
