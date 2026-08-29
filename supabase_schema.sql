-- ==============================================================================
-- AREZ BARBERSHOP — SUPABASE POSTGRESQL SCHEMA & REALTIME SETUP
-- Quiet Luxury Grooming & Care POS + Live Queue Engine
-- ==============================================================================

-- 1. EXTENSIONS & CLEANUP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE (SUPER ADMIN OWNER, STAFF, & CUSTOMERS)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'BARBER', 'CASHIER', 'CUSTOMER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  full_name TEXT NOT NULL,
  email TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  phone TEXT,
  avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  google_id TEXT,
  total_visits INTEGER DEFAULT 1,
  last_visit_at TIMESTAMPTZ DEFAULT NOW(),
  favorite_day TEXT DEFAULT 'Sabtu',
  favorite_hour TEXT DEFAULT '15:00 - 18:00',
  favorite_service TEXT DEFAULT 'Signature Haircut (Standard)',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HPP MASTER INVENTORY TABLE (BIAYA BAHAN BAKU & STERILISASI)
CREATE TABLE IF NOT EXISTS public.hpp_items (
  id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 1500,
  unit_type TEXT NOT NULL DEFAULT 'pcs',
  category TEXT NOT NULL DEFAULT 'Bahan Baku & Steril',
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SERVICES CATALOG TABLE (KATALOG LAYANAN & RESEP HPP)
CREATE TABLE IF NOT EXISTS public.services (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  selling_price NUMERIC NOT NULL DEFAULT 50000,
  duration_mins INTEGER NOT NULL DEFAULT 18,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  recipe JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QUEUES TABLE (LIVE ANTREAN & KASIR LAPANGAN)
CREATE TABLE IF NOT EXISTS public.queues (
  id TEXT PRIMARY KEY,
  queue_number INTEGER NOT NULL,
  queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  service_id TEXT,
  service_name TEXT NOT NULL DEFAULT 'Signature Haircut (Standard)',
  service_price NUMERIC NOT NULL DEFAULT 50000,
  service_duration INTEGER NOT NULL DEFAULT 18,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'ONLINE' CHECK (source IN ('ONLINE', 'WALK_IN')),
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TRANSACTIONS TABLE (RIWAYAT TRANSAKSI KASIR & LABA BERSIH)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  queue_id TEXT,
  customer_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  total_price NUMERIC NOT NULL DEFAULT 50000,
  total_hpp NUMERIC NOT NULL DEFAULT 0,
  net_profit NUMERIC NOT NULL DEFAULT 50000,
  discount NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'QRIS', 'DEBIT', 'TRANSFER')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_queues_status ON public.queues(status);
CREATE INDEX IF NOT EXISTS idx_queues_created_at ON public.queues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- 8. SUPABASE REALTIME CONFIGURATION
-- Mengaktifkan Realtime WebSocket event pada tabel queues untuk live queue board
ALTER TABLE public.queues REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'queues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queues;
  END IF;
END $$;

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Allow public read for services & queues
DROP POLICY IF EXISTS "Public read services" ON public.services;
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read queues" ON public.queues;
CREATE POLICY "Public read queues" ON public.queues FOR SELECT USING (true);

-- Allow all operations via Service Role Key (Backend Server)
DROP POLICY IF EXISTS "Service role full access users" ON public.users;
CREATE POLICY "Service role full access users" ON public.users USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access services" ON public.services;
CREATE POLICY "Service role full access services" ON public.services USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access hpp" ON public.hpp_items;
CREATE POLICY "Service role full access hpp" ON public.hpp_items USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access queues" ON public.queues;
CREATE POLICY "Service role full access queues" ON public.queues USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access transactions" ON public.transactions;
CREATE POLICY "Service role full access transactions" ON public.transactions USING (true) WITH CHECK (true);

-- 10. INITIAL DEFAULT SEED DATA
-- Insert Super Admin Owner (Aris / CEO POTONG)
INSERT INTO public.users (
  id, role, status, full_name, email, username, phone, avatar_url, created_at, updated_at
) VALUES (
  'usr-super-admin-01',
  'OWNER',
  'ACTIVE',
  'Aris',
  'arez.barbershop@gmail.com',
  'CEO POTONG',
  '081234567890',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET 
  role = 'OWNER', 
  status = 'ACTIVE', 
  username = 'CEO POTONG';

-- Insert Default HPP Master Items
INSERT INTO public.hpp_items (id, item_name, unit_cost, unit_type, category, is_active, description) VALUES
  ('hpp-blade-01', 'Pisau Cukur Silet Platinum Steril (Single Use)', 1500, 'pcs', 'Bahan Baku & Steril', true, 'Pisau cukur tajam sekali pakai standar higienis barbershop'),
  ('hpp-neck-01', 'Tisu Leher Anti Keringat (Neck Paper)', 600, 'lembar', 'Bahan Baku & Steril', true, 'Pelindung leher higienis elastis'),
  ('hpp-tonic-01', 'Hair Tonic Ginseng Scalp Care', 2500, 'porsi', 'Styling & Perawatan', true, 'Tonik pendingin dan penutrisi akar rambut'),
  ('hpp-pomade-01', 'Premium Waterbased Pomade / Clay', 3000, 'porsi', 'Styling & Perawatan', true, 'Styling penata rambut wangi eksklusif')
ON CONFLICT (id) DO NOTHING;

-- Insert Default Grooming Services
INSERT INTO public.services (id, service_name, selling_price, duration_mins, description, is_active, recipe) VALUES
  (
    'srv-sig-01',
    'Signature Haircut (Standard)',
    50000,
    18,
    'Potong presisi standar 18 menit dengan wash, handuk hangat, dan styling.',
    true,
    '[{"hpp_id": "hpp-blade-01", "quantity_used": 1}, {"hpp_id": "hpp-neck-01", "quantity_used": 1}, {"hpp_id": "hpp-tonic-01", "quantity_used": 1}, {"hpp_id": "hpp-pomade-01", "quantity_used": 1}]'::jsonb
  ),
  (
    'srv-gent-02',
    'Gentlemen Grooming & Beard Trim',
    75000,
    25,
    'Potong rambut premium, perapian jenggot kumis presisi, dan cold scalp massage.',
    true,
    '[{"hpp_id": "hpp-blade-01", "quantity_used": 2}, {"hpp_id": "hpp-neck-01", "quantity_used": 1}, {"hpp_id": "hpp-tonic-01", "quantity_used": 1}, {"hpp_id": "hpp-pomade-01", "quantity_used": 1}]'::jsonb
  ),
  (
    'srv-kids-03',
    'Junior Gentle Haircut',
    40000,
    15,
    'Potong rambut khusus anak dengan pendekatan ramah, sabar, dan rapi.',
    true,
    '[{"hpp_id": "hpp-neck-01", "quantity_used": 1}, {"hpp_id": "hpp-pomade-01", "quantity_used": 1}]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
