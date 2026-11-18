-- ==============================================================================
-- AREZ BARBERSHOP — SUPABASE POSTGRESQL SCHEMA, RLS HARDENING & FIFO BATCHES
-- Quiet Luxury Grooming & Care POS + Live FIFO Queue & HPP Engine
-- ==============================================================================

-- 1. EXTENSIONS
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
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  favorite_day TEXT DEFAULT 'Sabtu',
  favorite_hour TEXT DEFAULT '15:00 - 18:00',
  favorite_service TEXT DEFAULT 'Signature Haircut (Standard)',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe schema evolution for existing deployments
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

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

-- 3B. FIFO HPP STOCK BATCHES (INCOMING LOTS ORDERED FIRST-IN, FIRST-OUT)
CREATE TABLE IF NOT EXISTS public.hpp_batches (
  id TEXT PRIMARY KEY,
  hpp_id TEXT NOT NULL REFERENCES public.hpp_items(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL,
  quantity_initial NUMERIC NOT NULL DEFAULT 0,
  quantity_remaining NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
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

-- 5. QUEUES TABLE (LIVE ANTREAN FIFO & KASIR LAPANGAN)
CREATE TABLE IF NOT EXISTS public.queues (
  id TEXT PRIMARY KEY,
  queue_number INTEGER NOT NULL,
  queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id TEXT,
  walk_in_name TEXT,
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

ALTER TABLE public.queues ADD COLUMN IF NOT EXISTS walk_in_name TEXT;

-- 6. TRANSACTIONS TABLE (RIWAYAT TRANSAKSI KASIR & FIFO HPP COGS)
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
  fifo_batches_used JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fifo_batches_used JSONB DEFAULT '[]'::jsonb;

-- 6B. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SYSTEM',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PERFORMANCE INDEXES (PostgreSQL B-Tree / Hash lookup speed)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_hpp_batches_fifo ON public.hpp_batches(hpp_id, received_at ASC);
CREATE INDEX IF NOT EXISTS idx_queues_status ON public.queues(status);
CREATE INDEX IF NOT EXISTS idx_queues_date_num ON public.queues(queue_date, queue_number ASC);
CREATE INDEX IF NOT EXISTS idx_queues_created_at ON public.queues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, created_at DESC);

-- 8. SUPABASE REALTIME CONFIGURATION
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

-- 9. ROW LEVEL SECURITY (RLS) HARDENING
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpp_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Public read only for non-sensitive catalog/queue status
DROP POLICY IF EXISTS "Public read services" ON public.services;
CREATE POLICY "Public read services" ON public.services FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read queues" ON public.queues;
CREATE POLICY "Public read queues" ON public.queues FOR SELECT TO anon, authenticated USING (true);

-- Strict Service-Role ONLY full access (prevents anon key direct writes/reads on sensitive tables)
DROP POLICY IF EXISTS "Service role full access users" ON public.users;
CREATE POLICY "Service role full access users" ON public.users TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access services" ON public.services;
CREATE POLICY "Service role full access services" ON public.services TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access hpp" ON public.hpp_items;
CREATE POLICY "Service role full access hpp" ON public.hpp_items TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access hpp_batches" ON public.hpp_batches;
CREATE POLICY "Service role full access hpp_batches" ON public.hpp_batches TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access queues" ON public.queues;
CREATE POLICY "Service role full access queues" ON public.queues TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access transactions" ON public.transactions;
CREATE POLICY "Service role full access transactions" ON public.transactions TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access notifications" ON public.notifications;
CREATE POLICY "Service role full access notifications" ON public.notifications TO service_role USING (true) WITH CHECK (true);

-- 10. INITIAL CLEAN OWNER ACCOUNT (Production-Ready, Zero Dummy Services/HPP)
INSERT INTO public.users (
  id, role, status, full_name, email, username, phone, created_at, updated_at
) VALUES (
  'usr-admin',
  'OWNER',
  'ACTIVE',
  'Aris (CEO Arez Barbershop)',
  'owner@arezbarbershop.com',
  'CEO POTONG',
  '081288990011',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  role = 'OWNER',
  status = 'ACTIVE',
  username = 'CEO POTONG';
