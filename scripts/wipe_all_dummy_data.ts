import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../server/supabase.js';
import { hashPasswordInternal } from '../server/db.js';

async function wipeAllDummyData() {
  console.log('=== WIPING ALL DUMMY DATA, SERVICES, HPP, QUEUES, TRANSACTIONS ===');

  // 1. Supabase Cloud Database Cleanup
  if (supabaseAdmin) {
    console.log('[Supabase] Cleaning cloud tables...');

    const { error: errQ } = await supabaseAdmin.from('queues').delete().neq('id', '___keep_none___');
    console.log('[Supabase] Queues cleared:', errQ ? errQ.message : 'OK');

    const { error: errT } = await supabaseAdmin.from('transactions').delete().neq('id', '___keep_none___');
    console.log('[Supabase] Transactions cleared:', errT ? errT.message : 'OK');

    const { error: errS } = await supabaseAdmin.from('services').delete().neq('id', '___keep_none___');
    console.log('[Supabase] Services cleared:', errS ? errS.message : 'OK');

    const { error: errH } = await supabaseAdmin.from('hpp_items').delete().neq('id', '___keep_none___');
    console.log('[Supabase] HPP items cleared:', errH ? errH.message : 'OK');

    // Keep only primary Super Admin Owner
    const { error: errU } = await supabaseAdmin.from('users').delete().neq('id', 'usr-admin');
    console.log('[Supabase] Non-owner users cleared:', errU ? errU.message : 'OK');

    // Ensure Super Admin exists in Supabase
    await supabaseAdmin.from('users').upsert({
      id: 'usr-admin',
      role: 'OWNER',
      status: 'ACTIVE',
      full_name: 'Aris (CEO Arez Barbershop)',
      username: 'CEO POTONG',
      email: 'owner@arezbarbershop.com',
      phone: '081288990011',
      total_visits: 0,
      last_visit_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log('[Supabase] Super Admin Owner verified.');
  }

  // 2. Local arez_data.json Cleanup
  const ownerPassword = process.env.OWNER_DEFAULT_PASSWORD || 'Arez008';
  const cleanData = {
    users: [
      {
        id: 'usr-admin',
        role: 'OWNER',
        status: 'ACTIVE',
        username: 'CEO POTONG',
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
    ],
    master_hpp: [],
    services: [],
    service_hpp_relations: [],
    queues: [],
    transactions: [],
    notifications: [],
    revoked_tokens: [],
  };

  const dataPath = path.resolve(process.cwd(), 'arez_data.json');
  fs.writeFileSync(dataPath, JSON.stringify(cleanData, null, 2), 'utf-8');
  console.log('[Local DB] arez_data.json wiped cleanly (0 services, 0 HPP, 0 dummy records).');

  console.log('=== DATA PURGE 100% COMPLETE ===');
  process.exit(0);
}

wipeAllDummyData().catch((err) => {
  console.error('Wipe failed:', err);
  process.exit(1);
});
