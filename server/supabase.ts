import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

export let supabaseAdmin: SupabaseClient | null = null;

// Short-lived circuit breaker for unreachable/offline Supabase transport errors
let cloudBackoffUntil = 0;
const CLOUD_BACKOFF_MS = 30_000;

function isCloudAvailable(): boolean {
  return Boolean(supabaseAdmin) && Date.now() >= cloudBackoffUntil;
}

function noteCloudTransportFailure(msg: string) {
  if (/fetch failed|enotfound|etimedout|econnrefused|network|abort/i.test(msg)) {
    cloudBackoffUntil = Date.now() + CLOUD_BACKOFF_MS;
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), ms)),
  ]);
}

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log(`[Supabase] Server initialized successfully for: ${SUPABASE_URL}`);
  } catch (err) {
    console.error('[Supabase] Initialization error:', err);
    supabaseAdmin = null;
  }
} else {
  console.log('[Supabase] No credentials configured. Running in hybrid local cache mode.');
}

async function resilientUpsert(table: string, fullRow: Record<string, any>, fallbackRow?: Record<string, any>) {
  if (!isCloudAvailable() || !supabaseAdmin) return;
  try {
    const { error } = await withTimeout(supabaseAdmin.from(table).upsert(fullRow), 2000);
    if (error && fallbackRow && (error.code === 'PGRST204' || /column/i.test(error.message))) {
      const retry = await withTimeout(supabaseAdmin.from(table).upsert(fallbackRow), 2000);
      if (retry.error) {
        noteCloudTransportFailure(retry.error.message);
        console.error(`[Supabase] ${table} upsert fallback error:`, retry.error.message);
      }
      return;
    }
    if (error) {
      noteCloudTransportFailure(error.message);
      if (error.code === 'PGRST205' || /relation .* does not exist/i.test(error.message)) {
        return;
      }
      console.error(`[Supabase] ${table} upsert error:`, error.message);
    }
  } catch (e: any) {
    noteCloudTransportFailure(e.message || '');
    console.warn(`[Supabase] ${table} deferred:`, e.message);
  }
}

// -------------------------------------------------------------
// Database Sync Helper Functions
// -------------------------------------------------------------

export async function syncUserToSupabase(user: any) {
  const baseRow = {
    id: user.id,
    role: user.role,
    status: user.status || 'ACTIVE',
    full_name: user.full_name,
    email: user.email || null,
    username: user.username || null,
    password_hash: user.password_hash || null,
    phone: user.phone || null,
    avatar_url: user.avatar_url || null,
    google_id: user.google_id || null,
    total_visits: user.total_visits ?? 0,
    last_visit_at: user.last_visit_at || null,
    favorite_day: user.favorite_day || 'Sabtu',
    favorite_hour: user.favorite_hour || '15:00 - 18:00',
    favorite_service: user.favorite_service || 'Signature Haircut (Standard)',
    created_at: user.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await resilientUpsert(
    'users',
    {
      ...baseRow,
      deleted_at: user.deleted_at || null,
      last_login_at: user.last_login_at || null,
    },
    baseRow
  );
}

export async function syncQueueToSupabase(queue: any) {
  const baseRow = {
    id: queue.id,
    queue_number: queue.queue_number,
    queue_date: queue.queue_date || new Date().toISOString().split('T')[0],
    customer_id: queue.customer_id || null,
    customer_name: queue.customer_name || queue.walk_in_name || 'Pelanggan',
    customer_phone: queue.customer_phone || null,
    service_id: queue.service_id || null,
    service_name: queue.service_name || 'Signature Haircut (Standard)',
    service_price: queue.service_price || 50000,
    service_duration: queue.service_duration || 18,
    notes: queue.notes || null,
    source: queue.source || 'ONLINE',
    status: queue.status || 'WAITING',
    start_time: queue.start_time || null,
    end_time: queue.end_time || null,
    created_at: queue.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await resilientUpsert(
    'queues',
    {
      ...baseRow,
      walk_in_name: queue.walk_in_name || null,
    },
    baseRow
  );
}

export async function deleteQueueFromSupabase(queueId: string) {
  if (!isCloudAvailable() || !supabaseAdmin) return;
  try {
    const { error } = await withTimeout(supabaseAdmin.from('queues').delete().eq('id', queueId), 2000);
    if (error) {
      noteCloudTransportFailure(error.message);
      console.error('[Supabase] deleteQueue error:', error.message);
    }
  } catch (e: any) {
    noteCloudTransportFailure(e.message || '');
    console.warn('[Supabase] deleteQueue deferred:', e.message);
  }
}

export async function syncTransactionToSupabase(tx: any) {
  const baseRow = {
    id: tx.id,
    queue_id: tx.queue_id || null,
    customer_name: tx.customer_name,
    service_name: tx.service_name,
    total_price: tx.total_price || tx.net_amount || 0,
    total_hpp: tx.total_hpp || 0,
    net_profit: tx.net_profit || 0,
    discount: tx.discount || 0,
    tax: tx.tax || 0,
    payment_method: tx.payment_method || 'CASH',
    created_at: tx.created_at || new Date().toISOString(),
  };

  await resilientUpsert(
    'transactions',
    {
      ...baseRow,
      fifo_batches_used: tx.fifo_batches_used || [],
    },
    baseRow
  );
}

export async function syncServiceToSupabase(srv: any) {
  await resilientUpsert('services', {
    id: srv.id,
    service_name: srv.service_name,
    selling_price: srv.selling_price,
    duration_mins: srv.duration_mins,
    description: srv.description || null,
    is_active: srv.is_active !== false,
    recipe: srv.recipe || [],
    updated_at: new Date().toISOString(),
  });
}

export async function deleteServiceFromSupabase(serviceId: string) {
  if (!isCloudAvailable() || !supabaseAdmin) return;
  try {
    const { error } = await withTimeout(supabaseAdmin.from('services').delete().eq('id', serviceId), 2000);
    if (error) {
      noteCloudTransportFailure(error.message);
      console.error('[Supabase] deleteService error:', error.message);
    }
  } catch (e: any) {
    noteCloudTransportFailure(e.message || '');
    console.warn('[Supabase] deleteService deferred:', e.message);
  }
}

export async function syncHPPToSupabase(hpp: any) {
  await resilientUpsert('hpp_items', {
    id: hpp.id,
    item_name: hpp.item_name,
    unit_cost: hpp.unit_cost,
    unit_type: hpp.unit_type || 'pcs',
    category: hpp.category || 'Bahan Baku & Steril',
    is_active: hpp.is_active !== false,
    description: hpp.description || null,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteHPPFromSupabase(hppId: string) {
  if (!isCloudAvailable() || !supabaseAdmin) return;
  try {
    const { error } = await withTimeout(supabaseAdmin.from('hpp_items').delete().eq('id', hppId), 2000);
    if (error) {
      noteCloudTransportFailure(error.message);
      console.error('[Supabase] deleteHPP error:', error.message);
    }
  } catch (e: any) {
    noteCloudTransportFailure(e.message || '');
    console.warn('[Supabase] deleteHPP deferred:', e.message);
  }
}

export async function syncHPPBatchToSupabase(batch: any) {
  await resilientUpsert('hpp_batches', {
    id: batch.id,
    hpp_id: batch.hpp_id,
    batch_code: batch.batch_code,
    quantity_initial: batch.quantity_initial,
    quantity_remaining: batch.quantity_remaining,
    unit_cost: batch.unit_cost,
    received_at: batch.received_at || new Date().toISOString(),
    notes: batch.notes || null,
  });
}

export async function syncNotificationToSupabase(notif: any) {
  await resilientUpsert('notifications', {
    id: notif.id,
    user_id: notif.user_id,
    title: notif.title,
    message: notif.message,
    type: notif.type || 'SYSTEM',
    read: Boolean(notif.read),
    created_at: notif.created_at || new Date().toISOString(),
  });
}

export async function getAtomicQueueNumber(dateStr: string, fallbackMax: number): Promise<number> {
  if (!isCloudAvailable() || !supabaseAdmin) return fallbackMax;
  try {
    const { data, error } = await withTimeout(
      supabaseAdmin
        .from('queues')
        .select('queue_number')
        .eq('queue_date', dateStr)
        .order('queue_number', { ascending: false })
        .limit(1),
      1500
    );

    if (error) {
      noteCloudTransportFailure(error.message);
      return fallbackMax;
    }
    if (!data || data.length === 0) {
      return fallbackMax;
    }
    const maxNum = Number(data[0].queue_number);
    return Math.max(fallbackMax, isNaN(maxNum) ? 1 : maxNum + 1);
  } catch (e: any) {
    noteCloudTransportFailure(e.message || '');
    return fallbackMax;
  }
}

export interface CloudPullResult {
  users: any[] | null;
  master_hpp: any[] | null;
  hpp_batches: any[] | null;
  services: any[] | null;
  service_hpp_relations: any[] | null;
  queues: any[] | null;
  transactions: any[] | null;
  notifications: any[] | null;
}

export async function pullAllFromSupabase(): Promise<CloudPullResult | null> {
  if (!supabaseAdmin) return null;
  try {
    const [
      usersRes,
      hppRes,
      batchesRes,
      servicesRes,
      queuesRes,
      transactionsRes,
      notificationsRes,
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('hpp_items').select('*'),
      supabaseAdmin.from('hpp_batches').select('*'),
      supabaseAdmin.from('services').select('*'),
      supabaseAdmin.from('queues').select('*'),
      supabaseAdmin.from('transactions').select('*'),
      supabaseAdmin.from('notifications').select('*'),
    ]);

    const allFailed =
      usersRes.error &&
      hppRes.error &&
      servicesRes.error &&
      queuesRes.error &&
      transactionsRes.error;

    if (allFailed) {
      noteCloudTransportFailure(usersRes.error?.message || 'fetch failed');
      console.warn('[Supabase Pull] Cloud unreachable, preserving local data:', usersRes.error?.message);
      return null;
    }

    const master_hpp = hppRes.error
      ? null
      : (hppRes.data || []).map((h: any) => ({
          id: h.id,
          item_name: h.item_name,
          unit_cost: Number(h.unit_cost) || 0,
          unit_type: h.unit_type || 'pcs',
          category: h.category || 'Bahan Baku & Steril',
          is_active: h.is_active !== false,
          description: h.description || '',
          created_at: h.created_at || new Date().toISOString(),
          updated_at: h.updated_at || new Date().toISOString(),
        }));

    const hpp_batches = batchesRes.error
      ? null
      : (batchesRes.data || []).map((b: any) => ({
          id: b.id,
          hpp_id: b.hpp_id,
          batch_code: b.batch_code,
          quantity_initial: Number(b.quantity_initial) || 0,
          quantity_remaining: Number(b.quantity_remaining) || 0,
          unit_cost: Number(b.unit_cost) || 0,
          received_at: b.received_at || new Date().toISOString(),
          notes: b.notes || '',
        }));

    let service_hpp_relations: any[] | null = null;
    let services: any[] | null = null;
    if (!servicesRes.error) {
      service_hpp_relations = [];
      services = (servicesRes.data || []).map((s: any) => {
        if (Array.isArray(s.recipe)) {
          for (const item of s.recipe) {
            if (item && item.hpp_id) {
              service_hpp_relations!.push({
                service_id: s.id,
                hpp_id: item.hpp_id,
                quantity_used: Number(item.quantity_used) || 1,
              });
            }
          }
        }
        return {
          id: s.id,
          service_name: s.service_name,
          selling_price: Number(s.selling_price) || 0,
          duration_mins: Number(s.duration_mins) || 18,
          is_active: s.is_active !== false,
          description: s.description || '',
        };
      });
    }

    const queues = queuesRes.error
      ? null
      : (queuesRes.data || []).map((q: any) => ({
          id: q.id,
          queue_date: q.queue_date,
          queue_number: Number(q.queue_number) || 1,
          customer_id: q.customer_id || null,
          walk_in_name: q.walk_in_name || (q.source === 'WALK_IN' ? q.customer_name : null) || null,
          customer_phone: q.customer_phone || null,
          service_id: q.service_id,
          service_name: q.service_name,
          service_price: Number(q.service_price) || 0,
          service_duration: Number(q.service_duration) || 18,
          customer_name: q.customer_name || q.walk_in_name || 'Pelanggan',
          source: q.source || 'ONLINE',
          status: q.status || 'WAITING',
          start_time: q.start_time || null,
          end_time: q.end_time || null,
          created_at: q.created_at || new Date().toISOString(),
          notes: q.notes || '',
        }));

    const transactions = transactionsRes.error
      ? null
      : (transactionsRes.data || []).map((t: any) => ({
          id: t.id,
          queue_id: t.queue_id || '',
          customer_name: t.customer_name,
          service_name: t.service_name,
          total_price: Number(t.total_price) || 0,
          discount: Number(t.discount) || 0,
          tax: Number(t.tax) || 0,
          total_hpp: Number(t.total_hpp) || 0,
          net_profit: Number(t.net_profit) || 0,
          payment_method: t.payment_method || 'CASH',
          fifo_batches_used: Array.isArray(t.fifo_batches_used) ? t.fifo_batches_used : [],
          created_at: t.created_at || new Date().toISOString(),
        }));

    const users = usersRes.error
      ? null
      : (usersRes.data || []).map((u: any) => ({
          id: u.id,
          role: u.role,
          status: u.status || 'ACTIVE',
          google_id: u.google_id || null,
          username: u.username || null,
          password_hash: u.password_hash || null,
          full_name: u.full_name,
          email: u.email || '',
          phone: u.phone || '',
          avatar_url: u.avatar_url || '',
          total_visits: Number(u.total_visits) ?? 0,
          last_visit_at: u.last_visit_at || null,
          deleted_at: u.deleted_at || null,
          favorite_day: u.favorite_day || 'Sabtu',
          favorite_hour: u.favorite_hour || '15:00 - 18:00',
          favorite_service: u.favorite_service || 'Signature Haircut (Standard)',
          created_at: u.created_at || new Date().toISOString(),
          updated_at: u.updated_at || new Date().toISOString(),
          last_login_at: u.last_login_at || null,
        }));

    const notifications = notificationsRes.error
      ? null
      : (notificationsRes.data || []).map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          title: n.title,
          message: n.message,
          type: n.type || 'SYSTEM',
          read: Boolean(n.read),
          created_at: n.created_at || new Date().toISOString(),
        }));

    return {
      users,
      master_hpp,
      hpp_batches,
      services,
      service_hpp_relations,
      queues,
      transactions,
      notifications,
    };
  } catch (err: any) {
    console.warn('[Supabase Pull Exception]:', err.message);
    return null;
  }
}
