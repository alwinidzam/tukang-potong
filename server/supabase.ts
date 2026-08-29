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
