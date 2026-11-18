import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { getAtomicQueueNumber, pullAllFromSupabase } from './supabase.js';
import {
  IndexedFIFOQueue,
  FIFOTraceRingBuffer,
  HPPStockBatch,
  FIFOBatchConsumptionDetail,
  consumeBatchesFIFO,
} from './algorithms.js';

export type UserRole = 'OWNER' | 'STAFF' | 'CUSTOMER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;
  role: UserRole;
  status?: UserStatus;
  google_id?: string | null;
  username?: string | null;
  password_hash?: string | null;
  password?: string | null; // Legacy field, stripped on load
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  total_visits: number;
  last_visit_at?: string | null;
  deleted_at?: string | null;
  favorite_day?: string;
  favorite_hour?: string;
  favorite_service?: string;
  created_at: string;
  updated_at?: string;
  last_login_at?: string | null;
}

export interface MasterHPP {
  id: string;
  item_name: string;
  unit_cost: number;
  unit_type: string;
  category?: string;
  is_active?: boolean;
  description?: string;
  created_at?: string;
  updated_at: string;
}

export interface Service {
  id: string;
  service_name: string;
  selling_price: number;
  duration_mins: number;
  is_active: boolean;
  description?: string;
}

export interface ServiceHPPRelation {
  service_id: string;
  hpp_id: string;
  quantity_used: number;
}

export interface QueueItem {
  id: string;
  queue_date: string; // YYYY-MM-DD
  queue_number: number;
  customer_id: string | null;
  walk_in_name: string | null;
  customer_phone?: string | null;
  service_id: string;
  service_name?: string;
  service_price?: number;
  service_duration?: number;
  customer_name?: string;
  source: 'ONLINE' | 'WALK_IN';
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  start_time: string | null; // ISO timestamp
  end_time: string | null; // ISO timestamp
  created_at: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  queue_id: string;
  customer_name: string;
  service_name: string;
  total_price: number;
  discount: number;
  tax: number;
  total_hpp: number;
  net_profit: number;
  payment_method: 'CASH' | 'QRIS' | 'DEBIT' | 'TRANSFER';
  fifo_batches_used?: FIFOBatchConsumptionDetail[];
  created_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'QUEUE_UPDATE' | 'REMINDER_15M' | 'RETENTION_30D' | 'PROMO' | 'SYSTEM';
  created_at: string;
  read: boolean;
}

const isServerless = Boolean(
  process.env.VERCEL || process.env.NODE_ENV === 'production' || process.env.AWS_LAMBDA_FUNCTION_VERSION
);
const DB_FILE = isServerless ? path.join(os.tmpdir(), 'arez_data.json') : path.join(process.cwd(), 'arez_data.json');
const DB_BACKUP_FILE = isServerless
  ? path.join(os.tmpdir(), 'arez_data.json.bak')
  : path.join(process.cwd(), 'arez_data.json.bak');

export function getJakartaDateStr(d?: Date): string {
  const targetDate = d || new Date();
  return targetDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

export interface DatabaseSchema {
  users: User[];
  master_hpp: MasterHPP[];
  hpp_batches: HPPStockBatch[];
  services: Service[];
  service_hpp_relations: ServiceHPPRelation[];
  queues: QueueItem[];
  transactions: Transaction[];
  notifications: NotificationLog[];
  revoked_tokens: string[];
  revoked_before?: Record<string, number>;
}

export const DB_PASSWORD_HASH_ITERATIONS = 100000;

export function hashPasswordInternal(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, DB_PASSWORD_HASH_ITERATIONS, 64, 'sha256').toString('hex');
  return `pbkdf2_sha256$${DB_PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

export function compareQueueFIFO(a: QueueItem, b: QueueItem): number {
  const dateCmp = String(a.queue_date || '').localeCompare(String(b.queue_date || ''));
  if (dateCmp !== 0) return dateCmp;
  const numDiff = (Number(a.queue_number) || 0) - (Number(b.queue_number) || 0);
  if (numDiff !== 0) return numDiff;
  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
}

const getInitialSeedData = (): DatabaseSchema => {
  const ownerPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';

  const users: User[] = [
    {
      id: 'usr-admin',
      role: 'OWNER',
      status: 'ACTIVE',
      username: process.env.OWNER_USERNAME || 'CEO POTONG',
      password_hash: hashPasswordInternal(ownerPassword),
      full_name: 'Aris (CEO Arez Barbershop)',
      email: 'owner@arezbarbershop.com',
      phone: '081288990011',
      total_visits: 0,
      last_visit_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    },
  ];

  return {
    users,
    master_hpp: [],
    hpp_batches: [],
    services: [],
    service_hpp_relations: [],
    queues: [],
    transactions: [],
    notifications: [],
    revoked_tokens: [],
    revoked_before: {},
  };
};

function sanitizeProductionData(raw: Partial<DatabaseSchema>, existingUsers: User[] = []): DatabaseSchema {
  const dummyUserIds = new Set(['usr-cust-1', 'usr-cust-2', 'usr-cust-3', 'usr-staff-1']);
  const dummyQueueIds = new Set(['q-101', 'q-102', 'q-103', 'q-104']);
  const dummyTrxIds = new Set(['trx-1', 'trx-past-1', 'trx-past-2', 'trx-past-3', 'trx-past-4', 'trx-past-5']);
  const dummyNotifIds = new Set(['notif-1', 'notif-2']);

  const existingMap = new Map<string, User>();
  for (const eu of existingUsers) {
    if (eu.id) existingMap.set(eu.id, eu);
    if (eu.username) existingMap.set(eu.username.toLowerCase(), eu);
    if (eu.email) existingMap.set(eu.email.toLowerCase(), eu);
  }

  const sanitizedUsers = (raw.users || [])
    .filter((u) => !dummyUserIds.has(u.id))
    .map((user) => {
      const u: any = { ...user };
      const roleUpper = String(u.role || '').toUpperCase();

      const isPrimaryOwner =
        u.id === 'usr-admin' ||
        u.id === 'usr-super-admin-01' ||
        (u.username && u.username.toLowerCase() === 'ceo potong');

      if (isPrimaryOwner) {
        u.id = 'usr-admin';
        u.role = 'OWNER';
        u.username = process.env.OWNER_USERNAME || 'CEO POTONG';
        u.full_name = 'Aris (CEO Arez Barbershop)';
        u.status = 'ACTIVE';
      } else if (
        roleUpper === 'STAFF' ||
        roleUpper === 'BARBER' ||
        roleUpper === 'CASHIER' ||
        roleUpper === 'ADMIN' ||
        roleUpper === 'SUPER_ADMIN' ||
        roleUpper === 'MANAGER' ||
        roleUpper === 'OWNER'
      ) {
        u.role = 'STAFF';
      } else {
        u.role = 'CUSTOMER';
      }

      if (!u.status) {
        u.status = 'ACTIVE';
      }
      if (!u.password_hash && u.id) {
        const existing = existingMap.get(u.id) || (u.username ? existingMap.get(u.username.toLowerCase()) : undefined);
        if (existing && existing.password_hash) {
          u.password_hash = existing.password_hash;
        }
      }

      if (u.id === 'usr-admin' && !u.password_hash) {
        const defaultPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';
        u.password_hash = hashPasswordInternal(defaultPassword);
      }

      return u as User;
    });

  const cloudUserIds = new Set(sanitizedUsers.map((u) => u.id));
  for (const localUser of existingUsers) {
    if (!cloudUserIds.has(localUser.id) && !dummyUserIds.has(localUser.id)) {
      sanitizedUsers.push(localUser);
    }
  }

  let adminUser = sanitizedUsers.find((u) => u.id === 'usr-admin');
  if (!adminUser) {
    const defaultSeed = getInitialSeedData();
    sanitizedUsers.push(...defaultSeed.users);
  } else {
    adminUser.role = 'OWNER';
    adminUser.username = process.env.OWNER_USERNAME || 'CEO POTONG';
    adminUser.full_name = 'Aris (CEO Arez Barbershop)';
    if (!adminUser.password_hash) {
      const defaultPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';
      adminUser.password_hash = hashPasswordInternal(defaultPassword);
    }
  }

  const seenIds = new Set<string>();
  const finalUsers: User[] = [];
  for (const u of sanitizedUsers) {
    if (!seenIds.has(u.id)) {
      seenIds.add(u.id);
      finalUsers.push(u);
    }
  }

  const sanitizedQueues = (raw.queues || []).filter(
    (q) => !dummyQueueIds.has(q.id) && !dummyUserIds.has(q.customer_id || '')
  );

  // Store chronologically ascending so appends are O(1) push and tail pagination is O(K)
  const sanitizedTransactions = (raw.transactions || [])
    .filter((t) => !dummyTrxIds.has(t.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const sanitizedNotifs = (raw.notifications || [])
    .filter((n) => !dummyNotifIds.has(n.id) && !dummyUserIds.has(n.user_id || ''))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const seenHppIds = new Set<string>();
  const sanitizedHPP: MasterHPP[] = [];
  for (const h of raw.master_hpp || []) {
    if (h && h.id && !seenHppIds.has(h.id)) {
      seenHppIds.add(h.id);
      sanitizedHPP.push({
        ...h,
        category: h.category || 'Bahan Baku & Steril',
        is_active: h.is_active !== false,
      });
    }
  }

  const seenBatchIds = new Set<string>();
  const sanitizedBatches: HPPStockBatch[] = [];
  for (const b of raw.hpp_batches || []) {
    if (b && b.id && !seenBatchIds.has(b.id) && seenHppIds.has(b.hpp_id)) {
      seenBatchIds.add(b.id);
      sanitizedBatches.push({
        ...b,
        quantity_initial: Math.max(0, Number(b.quantity_initial) || 0),
        quantity_remaining: Math.max(0, Number(b.quantity_remaining) || 0),
        unit_cost: Math.max(0, Number(b.unit_cost) || 0),
        received_at: b.received_at || new Date().toISOString(),
      });
    }
  }
  sanitizedBatches.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

  const seenServiceIds = new Set<string>();
  const sanitizedServices: Service[] = [];
  for (const s of raw.services || []) {
    if (s && s.id && !seenServiceIds.has(s.id)) {
      seenServiceIds.add(s.id);
      sanitizedServices.push(s);
    }
  }

  const relationMap = new Map<string, ServiceHPPRelation>();
  for (const rel of raw.service_hpp_relations || []) {
    if (rel && rel.service_id && rel.hpp_id) {
      if (seenServiceIds.has(rel.service_id) && seenHppIds.has(rel.hpp_id)) {
        const key = `${rel.service_id}___${rel.hpp_id}`;
        relationMap.set(key, {
          service_id: rel.service_id,
          hpp_id: rel.hpp_id,
          quantity_used: Math.max(0.1, Number(rel.quantity_used) || 1),
        });
      }
    }
  }
  const sanitizedRelations = Array.from(relationMap.values());

  // Prune expired revoked tokens to avoid unbounded growth
  const nowMs = Date.now();
  const activeRevoked = (raw.revoked_tokens || []).filter((tok) => {
    if (typeof tok !== 'string') return false;
    if (tok.startsWith('arez_v2.')) {
      const parts = tok.split('.');
      const exp = parseInt(parts[3] || '', 10);
      if (!isNaN(exp) && exp < nowMs) return false;
    }
    return true;
  });

  return {
    users: finalUsers,
    master_hpp: sanitizedHPP,
    hpp_batches: sanitizedBatches,
    services: sanitizedServices,
    service_hpp_relations: sanitizedRelations,
    queues: sanitizedQueues,
    transactions: sanitizedTransactions,
    notifications: sanitizedNotifs,
    revoked_tokens: activeRevoked,
    revoked_before: raw.revoked_before || {},
  };
}

class Database {
  private data: DatabaseSchema;
  private isWriting = false;
  private syncPromise: Promise<void> | null = null;
  private hasAttemptedCloudSync = false;

  // O(1) Hash Map & Set Indexes + FIFO Linked Queue
  public usersById = new Map<string, User>();
  public usersByEmail = new Map<string, User>();
  public usersByUsername = new Map<string, User>();
  public hppById = new Map<string, MasterHPP>();
  public batchesByHppId = new Map<string, HPPStockBatch[]>();
  public servicesById = new Map<string, Service>();
  public relationsByServiceId = new Map<string, ServiceHPPRelation[]>();
  public hppUsageCount = new Map<string, number>();
  public queuesById = new Map<string, QueueItem>();
  public waitingFIFO = new IndexedFIFOQueue<QueueItem>();
  public txByQueueId = new Map<string, Transaction>();
  public maxQueueNumByDate = new Map<string, number>();
  public revokedTokensSet = new Set<string>();
  public traceBuffer = new FIFOTraceRingBuffer(60);

  constructor() {
    this.data = this.loadData();
    this.rebuildIndexes();
  }

  /**
   * Rebuilds all O(1) hash maps, sets, and FIFO queues from current snapshot in O(N log K).
   * Once built, all hot-path reads, enqueues, dequeues, skips, and lookups execute in O(1).
   */
  public rebuildIndexes(): void {
    this.usersById.clear();
    this.usersByEmail.clear();
    this.usersByUsername.clear();
    for (const u of this.data.users) {
      if (u.id) this.usersById.set(u.id, u);
      if (u.email) this.usersByEmail.set(u.email.toLowerCase(), u);
      if (u.username) this.usersByUsername.set(u.username.toLowerCase(), u);
    }

    this.hppById.clear();
    this.batchesByHppId.clear();
    for (const h of this.data.master_hpp) {
      this.hppById.set(h.id, h);
      this.batchesByHppId.set(h.id, []);
    }

    // Batches are kept sorted by received_at ASC so batch[0..n] is always FIFO consumption order
    for (const b of this.data.hpp_batches) {
      let arr = this.batchesByHppId.get(b.hpp_id);
      if (!arr) {
        arr = [];
        this.batchesByHppId.set(b.hpp_id, arr);
      }
      arr.push(b);
    }
    for (const arr of this.batchesByHppId.values()) {
      arr.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
    }

    this.servicesById.clear();
    for (const s of this.data.services) {
      this.servicesById.set(s.id, s);
    }

    this.relationsByServiceId.clear();
    this.hppUsageCount.clear();
    for (const rel of this.data.service_hpp_relations) {
      let list = this.relationsByServiceId.get(rel.service_id);
      if (!list) {
        list = [];
        this.relationsByServiceId.set(rel.service_id, list);
      }
      list.push(rel);
      this.hppUsageCount.set(rel.hpp_id, (this.hppUsageCount.get(rel.hpp_id) || 0) + 1);
    }

    this.queuesById.clear();
    this.maxQueueNumByDate.clear();
    const waitingItems: QueueItem[] = [];

    for (const q of this.data.queues) {
      this.queuesById.set(q.id, q);
      const qNum = Number(q.queue_number) || 0;
      const currMax = this.maxQueueNumByDate.get(q.queue_date) || 0;
      if (qNum > currMax) {
        this.maxQueueNumByDate.set(q.queue_date, qNum);
      }
      if (q.status === 'WAITING') {
        waitingItems.push(q);
      }
    }

    this.waitingFIFO.rebuild(waitingItems, compareQueueFIFO);

    this.txByQueueId.clear();
    for (const tx of this.data.transactions) {
      if (tx.queue_id) {
        this.txByQueueId.set(tx.queue_id, tx);
      }
    }

    this.revokedTokensSet.clear();
    for (const t of this.data.revoked_tokens || []) {
      this.revokedTokensSet.add(t);
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: Partial<DatabaseSchema> = JSON.parse(fileContent);

        if (parsed.users) {
          parsed.users.forEach((user: any) => {
            if (user.password && !user.password_hash) {
              user.password_hash = hashPasswordInternal(user.password);
            }
            delete user.password;

            const roleUpper = String(user.role || '').toUpperCase();
            if (roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN' || roleUpper === 'MANAGER' || roleUpper === 'OWNER') {
              user.role = 'OWNER';
            } else if (roleUpper === 'CASHIER' || roleUpper === 'BARBER' || roleUpper === 'STAFF') {
              user.role = 'STAFF';
            } else {
              user.role = 'CUSTOMER';
            }

            if (!user.status) {
              user.status = 'ACTIVE';
            }
          });
        }

        const sanitized = sanitizeProductionData(parsed);

        try {
          fs.writeFileSync(DB_BACKUP_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
        } catch (backupErr) {
          console.error('[DB Backup Error]:', backupErr);
        }

        return sanitized;
      }
    } catch (e) {
      console.error('[DB Load Error] Failed reading DB file, trying backup or seed data:', e);
      if (fs.existsSync(DB_BACKUP_FILE)) {
        try {
          const backupContent = fs.readFileSync(DB_BACKUP_FILE, 'utf-8');
          return sanitizeProductionData(JSON.parse(backupContent));
        } catch (bErr) {
          console.error('[DB Backup Restore Failed]:', bErr);
        }
      }
    }

    const initial = getInitialSeedData();
    this.saveData(initial);
    return initial;
  }

  public async initCloudSync(): Promise<void> {
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = (async () => {
      try {
        const cloudData = await pullAllFromSupabase();
        this.hasAttemptedCloudSync = true;
        if (cloudData) {
          const merged: DatabaseSchema = {
            users: cloudData.users && cloudData.users.length > 0 ? cloudData.users : this.data.users,
            master_hpp: cloudData.master_hpp !== null ? cloudData.master_hpp : this.data.master_hpp,
            hpp_batches: cloudData.hpp_batches !== null ? cloudData.hpp_batches : this.data.hpp_batches,
            services: cloudData.services !== null ? cloudData.services : this.data.services,
            service_hpp_relations:
              cloudData.service_hpp_relations !== null
                ? cloudData.service_hpp_relations
                : this.data.service_hpp_relations,
            queues: cloudData.queues !== null ? cloudData.queues : this.data.queues,
            transactions: cloudData.transactions !== null ? cloudData.transactions : this.data.transactions,
            notifications:
              cloudData.notifications !== null && cloudData.notifications.length > 0
                ? cloudData.notifications
                : this.data.notifications || [],
            revoked_tokens: this.data.revoked_tokens || [],
            revoked_before: this.data.revoked_before || {},
          };
          this.data = sanitizeProductionData(merged, this.data.users);
          this.rebuildIndexes();
          this.saveData(this.data);
          console.log(
            `[Supabase Cloud Sync] Pulled safely: ${this.data.services.length} services, ${this.data.master_hpp.length} HPP, ${this.data.hpp_batches.length} batches, ${this.data.queues.length} queues, ${this.data.transactions.length} transactions.`
          );
        }
      } catch (err: any) {
        this.hasAttemptedCloudSync = true;
        console.warn('[Supabase Cloud Sync Init Failed]:', err.message);
      }
    })();

    return this.syncPromise;
  }

  public async ensureSynced(timeoutMs = 2000): Promise<void> {
    if (this.hasAttemptedCloudSync) return;
    if (!this.syncPromise) {
      this.initCloudSync().catch(() => {});
    }
    if (!this.syncPromise) return;
    await Promise.race([
      this.syncPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  public saveData(customData?: DatabaseSchema): boolean {
    if (this.isWriting) {
      setImmediate(() => this.saveData(customData));
      return true;
    }

    this.isWriting = true;
    const tempFile = `${DB_FILE}.tmp`;

    try {
      const dataToSave = customData || this.data;
      const jsonContent = JSON.stringify(dataToSave, null, 2);

      fs.writeFileSync(tempFile, jsonContent, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
      return true;
    } catch (e) {
      console.error('[Atomic DB Write Failed]:', e);
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (_) {}
      }
      return false;
    } finally {
      this.isWriting = false;
    }
  }

  public async saveDataAsync(customData?: DatabaseSchema): Promise<boolean> {
    return this.saveData(customData);
  }

  /**
   * Computes projected HPP in O(R_service) using O(1) Hash Map lookups.
   * Uses the active FIFO Head batch unit_cost when stock batches exist; otherwise master unit_cost.
   */
  public calculateServiceHPP(serviceId: string): number {
    const relations = this.relationsByServiceId.get(serviceId) || [];
    let totalHPP = 0;

    for (const rel of relations) {
      const hppItem = this.hppById.get(rel.hpp_id);
      if (!hppItem) continue;

      const batches = this.batchesByHppId.get(rel.hpp_id) || [];
      if (batches.length > 0) {
        const sim = consumeBatchesFIFO(
          rel.hpp_id,
          hppItem.item_name,
          rel.quantity_used,
          batches,
          hppItem.unit_cost,
          false
        );
        totalHPP += sim.totalCost;
      } else {
        totalHPP += (hppItem.unit_cost || 0) * rel.quantity_used;
      }
    }

    return Math.round(totalHPP);
  }

  /**
   * Actually deducts HPP materials across oldest FIFO stock batches during checkout.
   * Returns exact FIFO COGS and modified batches for Supabase sync.
   */
  public consumeServiceMaterialsFIFO(serviceId: string): {
    totalHPP: number;
    fifoBatchesUsed: FIFOBatchConsumptionDetail[];
    modifiedBatches: HPPStockBatch[];
  } {
    const relations = this.relationsByServiceId.get(serviceId) || [];
    let totalHPP = 0;
    const fifoBatchesUsed: FIFOBatchConsumptionDetail[] = [];
    const modifiedBatchMap = new Map<string, HPPStockBatch>();

    for (const rel of relations) {
      const hppItem = this.hppById.get(rel.hpp_id);
      if (!hppItem) continue;

      const batches = this.batchesByHppId.get(rel.hpp_id) || [];
      const result = consumeBatchesFIFO(
        rel.hpp_id,
        hppItem.item_name,
        rel.quantity_used,
        batches,
        hppItem.unit_cost,
        true
      );

      totalHPP += result.totalCost;
      for (const detail of result.consumedBatches) {
        fifoBatchesUsed.push(detail);
        const batchObj = batches.find((b) => b.id === detail.batch_id);
        if (batchObj) {
          modifiedBatchMap.set(batchObj.id, batchObj);
        }
      }
    }

    return {
      totalHPP: Math.round(totalHPP),
      fifoBatchesUsed,
      modifiedBatches: Array.from(modifiedBatchMap.values()),
    };
  }

  /** O(1) lookup for next queue number on a Jakarta date */
  public getNextQueueNumber(dateStr: string): number {
    return (this.maxQueueNumByDate.get(dateStr) || 0) + 1;
  }

  public async getSafeQueueNumber(dateStr: string): Promise<number> {
    const localNext = this.getNextQueueNumber(dateStr);
    try {
      const safeNum = await getAtomicQueueNumber(dateStr, localNext);
      const prevMax = this.maxQueueNumByDate.get(dateStr) || 0;
      if (safeNum > prevMax) {
        this.maxQueueNumByDate.set(dateStr, safeNum);
      }
      return safeNum;
    } catch (_) {
      this.maxQueueNumByDate.set(dateStr, localNext);
      return localNext;
    }
  }
}

export const db = new Database();
