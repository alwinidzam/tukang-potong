export type UserRole = 'OWNER' | 'STAFF' | 'CUSTOMER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;
  role: UserRole;
  status?: UserStatus;
  google_id?: string | null;
  username?: string | null;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  total_visits: number;
  last_visit_at: string | null;
  favorite_day?: string;
  favorite_hour?: string;
  favorite_service?: string;
  created_at: string;
  updated_at?: string;
  last_login_at?: string | null;
}

export interface StaffSummary {
  total: number;
  active: number;
  inactive: number;
}

export interface StaffListResponse {
  staff: User[];
  summary: StaffSummary;
}

export interface StaffCreatePayload {
  full_name: string;
  username: string;
  email?: string;
  phone?: string;
  password: string;
  status?: UserStatus;
}

export interface StaffUpdatePayload {
  full_name?: string;
  username?: string;
  email?: string;
  phone?: string;
  status?: UserStatus;
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
  is_fifo_head?: boolean;
  fifo_order?: number;
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
  used_in_services_count?: number;
  total_stock?: number;
  active_batches_count?: number;
  fifo_next_unit_cost?: number;
  batches?: HPPStockBatch[];
}

export interface MasterHPPCreatePayload {
  item_name: string;
  unit_cost: number;
  unit_type: string;
  category?: string;
  is_active?: boolean;
  description?: string;
  initial_stock?: number;
}

export interface MasterHPPUpdatePayload {
  item_name?: string;
  unit_cost?: number;
  unit_type?: string;
  category?: string;
  is_active?: boolean;
  description?: string;
}

export interface ServiceHPPBreakdown {
  hpp_id: string;
  item_name: string;
  unit_cost: number;
  unit_type: string;
  quantity_used: number;
  subtotal: number;
  fifo_batch_code?: string | null;
}

export interface Service {
  id: string;
  service_name: string;
  selling_price: number;
  duration_mins: number;
  is_active: boolean;
  description?: string;
  total_hpp?: number;
  net_profit?: number;
  profit_percentage?: number;
  hpp_breakdown?: ServiceHPPBreakdown[];
}

export interface QueueItem {
  id: string;
  queue_date: string;
  queue_number: number;
  customer_id: string | null;
  walk_in_name: string | null;
  customer_phone?: string | null;
  service_id: string;
  service_name?: string;
  service_price?: number;
  service_duration?: number;
  service_hpp?: number;
  customer_name?: string;
  customer_avatar?: string;
  customer_email?: string;
  source: 'ONLINE' | 'WALK_IN';
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  notes?: string;
  fifo_rank?: number | null;
  is_fifo_head?: boolean;
  estimated_wait_mins?: number;
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

export interface DailyRecap {
  date: string;
  gross: number;
  hpp: number;
  net: number;
  heads: number;
  avg_ticket: number;
}

export interface WeeklyDayRecap {
  date: string;
  day: string;
  gross: number;
  net: number;
  heads: number;
}

export interface TopServiceStat {
  service_name: string;
  count: number;
  gross: number;
  profit: number;
}

export interface MonthlyRecap {
  month: string;
  gross: number;
  hpp: number;
  net: number;
  heads: number;
  margin_percent: number;
  top_services: TopServiceStat[];
}

export interface AnalyticsRecapResponse {
  daily: DailyRecap;
  weekly: WeeklyDayRecap[];
  monthly: MonthlyRecap;
}

export interface CRMBehaviorCustomer extends User {
  days_since_last_visit: number;
  needs_retention_reminder: boolean;
}

export interface CRMBehaviorResponse {
  customers: CRMBehaviorCustomer[];
  total_customers: number;
  retention_alerts_count: number;
}

export interface ComplexityMetricsResponse {
  engine: string;
  dataset_sizes: {
    users: number;
    services: number;
    master_hpp: number;
    hpp_batches: number;
    queues_total: number;
    waiting_fifo_active: number;
    transactions: number;
    revoked_tokens_set: number;
  };
  fifo_queue_state: {
    policy: string;
    size: number;
    head: {
      id: string;
      queue_number: number;
      customer_name: string;
      service_name?: string;
      created_at: string;
    } | null;
    tail: {
      id: string;
      queue_number: number;
      customer_name: string;
      service_name?: string;
      created_at: string;
    } | null;
    nodes: {
      id: string;
      fifo_rank: number;
      queue_number: number;
      customer_name: string;
      service_name?: string;
      source: string;
      is_head: boolean;
      is_tail: boolean;
    }[];
  };
  hpp_fifo_batches: {
    hpp_id: string;
    item_name: string;
    unit_type: string;
    standard_unit_cost: number;
    total_remaining: number;
    active_batches_count: number;
    fifo_head_batch: {
      batch_code: string;
      quantity_remaining: number;
      unit_cost: number;
      received_at: string;
    } | null;
    batches: HPPStockBatch[];
  }[];
  complexity_matrix: {
    module: string;
    data_structure: string;
    before_complexity: string;
    after_complexity: string;
    benefit: string;
  }[];
  measured_lookup_ns: number;
  recent_traces: {
    id: string;
    timestamp: string;
    domain: 'QUEUE_FIFO' | 'HPP_BATCH_FIFO' | 'HASH_INDEX' | 'ANALYTICS';
    operation: string;
    complexity: string;
    detail: string;
    duration_us: number;
  }[];
}
