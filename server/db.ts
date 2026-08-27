import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { syncToFirestore, loadFromFirestore } from './firebase-admin.js';

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
  deleted_at?: string | null; // Soft-delete tombstone
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

const isServerless = process.env.VERCEL || process.env.NODE_ENV === 'production' || process.env.AWS_LAMBDA_FUNCTION_VERSION;
const DB_FILE = isServerless ? path.join(os.tmpdir(), 'arez_data.json') : path.join(process.cwd(), 'arez_data.json');
const DB_BACKUP_FILE = isServerless ? path.join(os.tmpdir(), 'arez_data.json.bak') : path.join(process.cwd(), 'arez_data.json.bak');

export function getJakartaDateStr(d?: Date): string {
  const targetDate = d || new Date();
  return targetDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // Outputs YYYY-MM-DD
}

interface DatabaseSchema {
  users: User[];
  master_hpp: MasterHPP[];
  services: Service[];
  service_hpp_relations: ServiceHPPRelation[];
  queues: QueueItem[];
  transactions: Transaction[];
  notifications: NotificationLog[];
  revoked_tokens: string[];
}

export const DB_PASSWORD_HASH_ITERATIONS = 100000;

// Cryptographic hash helper for database seeding & migrations
export function hashPasswordInternal(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, DB_PASSWORD_HASH_ITERATIONS, 64, 'sha256').toString('hex');
  return `pbkdf2_sha256$${DB_PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

// Initial Seed Data matching Arez Barbershop High-End Monochromatic Archetype
const getInitialSeedData = (): DatabaseSchema => {
  const now = new Date();
  const todayStr = getJakartaDateStr(now);
  const ownerPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';

  const master_hpp: MasterHPP[] = [
    { id: 'hpp-1', item_name: 'Pisau Cukur Silet Platinum (Sekali Pakai)', unit_cost: 1500, unit_type: 'pcs', category: 'Bahan Baku & Steril', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-2', item_name: 'Pomade Waterbased / Matte Clay Premium', unit_cost: 3000, unit_type: '10g', category: 'Styling & Perawatan', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-3', item_name: 'Shaving Cream & Foam Anti-Iritasi', unit_cost: 1200, unit_type: 'porsi', category: 'Bahan Baku & Steril', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-4', item_name: 'Neck Paper & Tissue Leher Steril', unit_cost: 600, unit_type: 'pcs', category: 'Bahan Baku & Steril', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-5', item_name: 'Tonic & Hair Serum Nutrisi', unit_cost: 2000, unit_type: 'ml', category: 'Styling & Perawatan', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-6', item_name: 'Listrik, AC & Clipper Sterilizer (Proporsional)', unit_cost: 2500, unit_type: 'sesi', category: 'Operasional & Utilitas', is_active: true, updated_at: now.toISOString() },
    { id: 'hpp-7', item_name: 'Handuk Hangat & Essential Oil Wash', unit_cost: 1800, unit_type: 'sesi', category: 'Bahan Baku & Steril', is_active: true, updated_at: now.toISOString() },
  ];

  const services: Service[] = [
    { id: 'srv-1', service_name: 'Signature Haircut (Standard)', selling_price: 50000, duration_mins: 18, is_active: true, description: 'Potong presisi, cuci rambut, styling pomade & hot towel finish' },
    { id: 'srv-2', service_name: 'Gentlemen Executive Cut + Wash + Tonic', selling_price: 75000, duration_mins: 18, is_active: true, description: 'Haircut eksklusif, hair wash, scalp massage, hair tonic & styling' },
    { id: 'srv-3', service_name: 'Beard Trim & Precision Shave', selling_price: 40000, duration_mins: 18, is_active: true, description: 'Rapikan jenggot, kumis, shaving dengan foam hangat & razor tajam' },
    { id: 'srv-4', service_name: 'The Ultimate Grooming (Cut + Shave + Facial Wash)', selling_price: 110000, duration_mins: 18, is_active: true, description: 'Paket lengkap perawatan pria premium' },
  ];

  const service_hpp_relations: ServiceHPPRelation[] = [
    { service_id: 'srv-1', hpp_id: 'hpp-1', quantity_used: 1 },
    { service_id: 'srv-1', hpp_id: 'hpp-2', quantity_used: 1 },
    { service_id: 'srv-1', hpp_id: 'hpp-4', quantity_used: 1 },
    { service_id: 'srv-1', hpp_id: 'hpp-6', quantity_used: 1 },

    { service_id: 'srv-2', hpp_id: 'hpp-1', quantity_used: 1 },
    { service_id: 'srv-2', hpp_id: 'hpp-2', quantity_used: 1 },
    { service_id: 'srv-2', hpp_id: 'hpp-4', quantity_used: 1 },
    { service_id: 'srv-2', hpp_id: 'hpp-5', quantity_used: 1 },
    { service_id: 'srv-2', hpp_id: 'hpp-6', quantity_used: 1 },
    { service_id: 'srv-2', hpp_id: 'hpp-7', quantity_used: 1 },

    { service_id: 'srv-3', hpp_id: 'hpp-1', quantity_used: 1 },
    { service_id: 'srv-3', hpp_id: 'hpp-3', quantity_used: 1 },
    { service_id: 'srv-3', hpp_id: 'hpp-4', quantity_used: 1 },
    { service_id: 'srv-3', hpp_id: 'hpp-6', quantity_used: 1 },

    { service_id: 'srv-4', hpp_id: 'hpp-1', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-2', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-3', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-4', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-5', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-6', quantity_used: 1 },
    { service_id: 'srv-4', hpp_id: 'hpp-7', quantity_used: 1 },
  ];

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

  const queues: QueueItem[] = [];
  const transactions: Transaction[] = [];
  const notifications: NotificationLog[] = [];

  return {
    users,
    master_hpp,
    services,
    service_hpp_relations,
    queues,
    transactions,
    notifications,
    revoked_tokens: [],
  };
};

function sanitizeProductionData(raw: DatabaseSchema, existingUsers: User[] = []): DatabaseSchema {
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
    .filter(u => !dummyUserIds.has(u.id))
    .map(user => {
      const u: any = { ...user };
      const roleUpper = String(u.role || '').toUpperCase();

      // STRICT SINGLE OWNER CONSTRAINT:
      // Only the designated primary account (usr-admin / CEO POTONG) can ever be OWNER
      const isPrimaryOwner = u.id === 'usr-admin' || (u.username && u.username.toLowerCase() === 'ceo potong');
      if (isPrimaryOwner) {
        u.id = 'usr-admin';
        u.role = 'OWNER';
        u.username = process.env.OWNER_USERNAME || 'CEO POTONG';
        u.full_name = 'Aris (CEO Arez Barbershop)';
        u.status = 'ACTIVE';
      } else if (roleUpper === 'STAFF' || roleUpper === 'BARBER' || roleUpper === 'CASHIER' || roleUpper === 'ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'MANAGER' || roleUpper === 'OWNER') {
        // Any other non-primary account automatically and strictly becomes STAFF
        u.role = 'STAFF';
      } else {
        u.role = 'CUSTOMER';
      }

      if (!u.status) {
        u.status = 'ACTIVE';
      }
      // Preserve password_hash from existing memory if stripped by cloud sync
      if (!u.password_hash && u.id) {
        const existing = existingMap.get(u.id) || (u.username ? existingMap.get(u.username.toLowerCase()) : undefined);
        if (existing && existing.password_hash) {
          u.password_hash = existing.password_hash;
        }
      }

      if (u.id === 'usr-admin' && !u.password_hash) {
        const defaultPassword = process.env.OWNER_DEFAULT_PASSWORD || 'ArezBaru2026!';
        u.password_hash = hashPasswordInternal(defaultPassword);
      }

      return u as User;
    });

  // Inject any users that exist in local memory but haven't propagated to Firestore yet
  const cloudUserIds = new Set(sanitizedUsers.map(u => u.id));
  for (const localUser of existingUsers) {
    if (!cloudUserIds.has(localUser.id) && !dummyUserIds.has(localUser.id)) {
      sanitizedUsers.push(localUser);
    }
  }

  // Ensure single usr-admin exists as OWNER with valid credentials
  let adminUser = sanitizedUsers.find(u => u.id === 'usr-admin');
  if (!adminUser) {
    const defaultSeed = getInitialSeedData();
    sanitizedUsers.push(...defaultSeed.users);
  } else {
    adminUser.role = 'OWNER';
    adminUser.username = process.env.OWNER_USERNAME || 'CEO POTONG';
    adminUser.full_name = 'Aris (CEO Arez Barbershop)';
    if (!adminUser.password_hash) {
      const defaultPassword = process.env.OWNER_DEFAULT_PASSWORD || 'ArezBaru2026!';
      adminUser.password_hash = hashPasswordInternal(defaultPassword);
    }
  }

  // Deduplicate users by ID, ensuring usr-admin appears only once
  const seenIds = new Set<string>();
  const finalUsers: User[] = [];
  for (const u of sanitizedUsers) {
    if (!seenIds.has(u.id)) {
      seenIds.add(u.id);
      finalUsers.push(u);
    }
  }

  const sanitizedQueues = (raw.queues || []).filter(q => !dummyQueueIds.has(q.id) && !dummyUserIds.has(q.customer_id || ''));
  const sanitizedTransactions = (raw.transactions || []).filter(t => !dummyTrxIds.has(t.id));
  const sanitizedNotifs = (raw.notifications || []).filter(n => !dummyNotifIds.has(n.id) && !dummyUserIds.has(n.user_id || ''));

  // Deduplicate master_hpp by ID
  const seenHppIds = new Set<string>();
  const sanitizedHPP: MasterHPP[] = [];
  for (const h of (raw.master_hpp || [])) {
    if (h && h.id && !seenHppIds.has(h.id)) {
      seenHppIds.add(h.id);
      sanitizedHPP.push({
        ...h,
        category: h.category || 'Bahan Baku & Steril',
        is_active: h.is_active !== false,
      });
    }
  }

  // Deduplicate services by ID
  const seenServiceIds = new Set<string>();
  const sanitizedServices: Service[] = [];
  for (const s of (raw.services || [])) {
    if (s && s.id && !seenServiceIds.has(s.id)) {
      seenServiceIds.add(s.id);
      sanitizedServices.push(s);
    }
  }

  // Deduplicate and strictly validate service_hpp_relations
  const relationMap = new Map<string, ServiceHPPRelation>();
  for (const rel of (raw.service_hpp_relations || [])) {
    if (rel && rel.service_id && rel.hpp_id) {
      if (seenServiceIds.has(rel.service_id) && seenHppIds.has(rel.hpp_id)) {
        const key = `${rel.service_id}___${rel.hpp_id}`;
        relationMap.set(key, {
          service_id: rel.service_id,
          hpp_id: rel.hpp_id,
          quantity_used: Math.max(1, Number(rel.quantity_used) || 1),
        });
      }
    }
  }
  const sanitizedRelations = Array.from(relationMap.values());

  return {
    users: finalUsers,
    master_hpp: sanitizedHPP,
    services: sanitizedServices,
    service_hpp_relations: sanitizedRelations,
    queues: sanitizedQueues,
    transactions: sanitizedTransactions,
    notifications: sanitizedNotifs,
    revoked_tokens: raw.revoked_tokens || [],
  };
}

class Database {
  private data: DatabaseSchema;
  private isWriting = false;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: DatabaseSchema = JSON.parse(fileContent);

        // Security Migration: Clean up plaintext passwords, migrate roles, and ensure status
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

        // Backup existing valid data
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

  public async initFirestoreSync() {
    try {
      const cloudData = await loadFromFirestore();
      if (cloudData && cloudData.users && cloudData.users.length > 0) {
        // Pass this.data.users to preserve password_hash when syncing from cloud
        const sanitizedCloud = sanitizeProductionData(cloudData, this.data.users);
        this.data = sanitizedCloud;
        this.saveData(this.data);
        // Force cleanup of old dummy docs and normalize roles in Firestore
        await syncToFirestore(this.data);
      } else {
        console.log('[Firestore] Seeding clean production data to Firestore Cloud Database...');
        await syncToFirestore(this.data);
      }
    } catch (e) {
      console.warn('[Firestore] Background cloud sync note:', e);
    }
  }

  private lastCloudSync = 0;
  private syncPromise: Promise<void> | null = null;

  public async ensureFreshData(): Promise<DatabaseSchema> {
    const now = Date.now();
    // Cache in-memory for 2.5 seconds per process instance to prevent excessive network roundtrips
    if (now - this.lastCloudSync < 2500 && this.data && this.data.services && this.data.services.length > 0) {
      return this.data;
    }

    if (this.syncPromise) {
      await this.syncPromise;
      return this.data;
    }

    this.syncPromise = (async () => {
      try {
        const cloudData = await loadFromFirestore();
        if (cloudData && cloudData.users && cloudData.users.length > 0) {
          const sanitizedCloud = sanitizeProductionData(cloudData, this.data.users);
          this.data = sanitizedCloud;
          this.lastCloudSync = Date.now();
        }
      } catch (e) {
        console.warn('[Firestore ensureFreshData Note]:', e);
      } finally {
        this.syncPromise = null;
      }
    })();

    await this.syncPromise;
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

      // Removed: syncToFirestore background call to prevent Vercel 504 timeouts.
      // API routes MUST call explicit syncSingle...ToFirestore functions for real-time sync.
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
    // Alias to saveData. Replaces massive blocking batch-syncs with instantaneous local saves.
    return this.saveData(customData);
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  // Calculate HPP for a given service dynamically
  public calculateServiceHPP(serviceId: string): number {
    const relations = this.data.service_hpp_relations.filter(r => r.service_id === serviceId);
    let totalHPP = 0;
    for (const rel of relations) {
      const hppItem = this.data.master_hpp.find(h => h.id === rel.hpp_id);
      if (hppItem) {
        totalHPP += (hppItem.unit_cost * rel.quantity_used);
      }
    }
    return Math.round(totalHPP);
  }

  public getNextQueueNumber(dateStr: string): number {
    const todayQueues = (this.data.queues || []).filter(q => q.queue_date === dateStr);
    const validNums = todayQueues
      .map(q => Number(q.queue_number))
      .filter(n => typeof n === 'number' && !isNaN(n) && isFinite(n) && n > 0);

    if (validNums.length === 0) return 1;
    return Math.max(...validNums) + 1;
  }

  public async getSafeQueueNumber(dateStr: string): Promise<number> {
    const localMax = this.getNextQueueNumber(dateStr);
    try {
      const { getAtomicQueueNumber } = await import('./firebase-admin.js');
      return await getAtomicQueueNumber(dateStr, localMax);
    } catch (_) {
      return localMax;
    }
  }
}

export const db = new Database();
