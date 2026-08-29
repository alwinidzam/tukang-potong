import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

export let supabaseAdmin: SupabaseClient | null = null;

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

// -------------------------------------------------------------
// Database Sync Helper Functions
// -------------------------------------------------------------

export async function syncUserToSupabase(user: any) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('users').upsert({
      id: user.id,
      role: user.role,
      status: user.status || 'ACTIVE',
      full_name: user.full_name,
      email: user.email || null,
      username: user.username || null,
      phone: user.phone || null,
      avatar_url: user.avatar_url || null,
      google_id: user.google_id || null,
      total_visits: user.total_visits || 1,
      last_visit_at: user.last_visit_at || new Date().toISOString(),
      favorite_day: user.favorite_day || 'Sabtu',
      favorite_hour: user.favorite_hour || '15:00 - 18:00',
      favorite_service: user.favorite_service || 'Signature Haircut (Standard)',
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[Supabase] syncUser error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] syncUser exception:', e.message);
  }
}

export async function syncQueueToSupabase(queue: any) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('queues').upsert({
      id: queue.id,
      queue_number: queue.queue_number,
      queue_date: queue.queue_date || new Date().toISOString().split('T')[0],
      customer_id: queue.customer_id || null,
      customer_name: queue.customer_name,
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
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[Supabase] syncQueue error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] syncQueue exception:', e.message);
  }
}

export async function deleteQueueFromSupabase(queueId: string) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('queues').delete().eq('id', queueId);
    if (error) console.error('[Supabase] deleteQueue error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] deleteQueue exception:', e.message);
  }
}

export async function syncTransactionToSupabase(tx: any) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('transactions').upsert({
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
    });
    if (error) console.error('[Supabase] syncTransaction error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] syncTransaction exception:', e.message);
  }
}

export async function syncServiceToSupabase(srv: any) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('services').upsert({
      id: srv.id,
      service_name: srv.service_name,
      selling_price: srv.selling_price,
      duration_mins: srv.duration_mins,
      description: srv.description || null,
      is_active: srv.is_active !== false,
      recipe: srv.recipe || [],
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[Supabase] syncService error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] syncService exception:', e.message);
  }
}

export async function deleteServiceFromSupabase(serviceId: string) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('services').delete().eq('id', serviceId);
    if (error) console.error('[Supabase] deleteService error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] deleteService exception:', e.message);
  }
}

export async function syncHPPToSupabase(hpp: any) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('hpp_items').upsert({
      id: hpp.id,
      item_name: hpp.item_name,
      unit_cost: hpp.unit_cost,
      unit_type: hpp.unit_type || 'pcs',
      category: hpp.category || 'Bahan Baku & Steril',
      is_active: hpp.is_active !== false,
      description: hpp.description || null,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[Supabase] syncHPP error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] syncHPP exception:', e.message);
  }
}

export async function deleteHPPFromSupabase(hppId: string) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('hpp_items').delete().eq('id', hppId);
    if (error) console.error('[Supabase] deleteHPP error:', error.message);
  } catch (e: any) {
    console.error('[Supabase] deleteHPP exception:', e.message);
  }
}

export async function getAtomicQueueNumber(dateStr: string, fallbackMax: number): Promise<number> {
  if (!supabaseAdmin) return fallbackMax;
  try {
    const { data, error } = await supabaseAdmin
      .from('queues')
      .select('queue_number')
      .eq('queue_date', dateStr)
      .order('queue_number', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return fallbackMax;
    }
    const maxNum = Number(data[0].queue_number);
    return Math.max(fallbackMax, isNaN(maxNum) ? 1 : maxNum + 1);
  } catch (_) {
    return fallbackMax;
  }
}

export async function pullAllFromSupabase(): Promise<{
  users: any[];
  master_hpp: any[];
  services: any[];
  service_hpp_relations: any[];
  queues: any[];
  transactions: any[];
} | null> {
  if (!supabaseAdmin) return null;
  try {
    const [usersRes, hppRes, servicesRes, queuesRes, transactionsRes] = await Promise.all([
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('hpp_items').select('*'),
      supabaseAdmin.from('services').select('*'),
      supabaseAdmin.from('queues').select('*'),
      supabaseAdmin.from('transactions').select('*'),
    ]);

    if (usersRes.error) console.error('[Supabase Pull] users error:', usersRes.error.message);
    if (hppRes.error) console.error('[Supabase Pull] hpp_items error:', hppRes.error.message);
    if (servicesRes.error) console.error('[Supabase Pull] services error:', servicesRes.error.message);
    if (queuesRes.error) console.error('[Supabase Pull] queues error:', queuesRes.error.message);
    if (transactionsRes.error) console.error('[Supabase Pull] transactions error:', transactionsRes.error.message);

    const master_hpp = (hppRes.data || []).map((h: any) => ({
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

    const service_hpp_relations: any[] = [];
    const services = (servicesRes.data || []).map((s: any) => {
      if (Array.isArray(s.recipe)) {
        for (const item of s.recipe) {
          if (item && item.hpp_id) {
            service_hpp_relations.push({
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

    const queues = (queuesRes.data || []).map((q: any) => ({
      id: q.id,
      queue_date: q.queue_date,
      queue_number: Number(q.queue_number) || 1,
      customer_id: q.customer_id || null,
      walk_in_name: q.walk_in_name || null,
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

    const transactions = (transactionsRes.data || []).map((t: any) => ({
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
      created_at: t.created_at || new Date().toISOString(),
    }));

    const users = (usersRes.data || []).map((u: any) => ({
      id: u.id,
      role: u.role,
      status: u.status || 'ACTIVE',
      google_id: u.google_id || null,
      username: u.username || null,
      full_name: u.full_name,
      email: u.email || '',
      phone: u.phone || '',
      avatar_url: u.avatar_url || '',
      total_visits: Number(u.total_visits) || 1,
      last_visit_at: u.last_visit_at || null,
      favorite_day: u.favorite_day || 'Sabtu',
      favorite_hour: u.favorite_hour || '15:00 - 18:00',
      favorite_service: u.favorite_service || 'Signature Haircut (Standard)',
      created_at: u.created_at || new Date().toISOString(),
      updated_at: u.updated_at || new Date().toISOString(),
      last_login_at: u.last_login_at || null,
    }));

    return {
      users,
      master_hpp,
      services,
      service_hpp_relations,
      queues,
      transactions,
    };
  } catch (err: any) {
    console.error('[Supabase Pull Exception]:', err.message);
    return null;
  }
}
