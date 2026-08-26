import {
  User,
  StaffListResponse,
  StaffCreatePayload,
  StaffUpdatePayload,
  QueueItem,
  MasterHPP,
  MasterHPPCreatePayload,
  MasterHPPUpdatePayload,
  Service,
  Transaction,
  AnalyticsRecapResponse,
  CRMBehaviorResponse,
  NotificationLog,
} from '../types';

const API_BASE = '/api';

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    ...extraHeaders,
  };
  const token = localStorage.getItem('arez_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // ----------------------------------------------------------------------
  // Auth
  // ----------------------------------------------------------------------
  async getAuthMe(): Promise<{ authenticated: boolean; user: User | null }> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        return { authenticated: false, user: null };
      }
      return res.json();
    } catch (e) {
      return { authenticated: false, user: null };
    }
  },

  async loginOwner(username: string, password: string): Promise<{ success: boolean; user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/owner-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal login owner');
    if (data.token) {
      localStorage.setItem('arez_token', data.token);
    }
    return data;
  },

  async loginGoogleSSO(payload: {
    google_id?: string;
    email: string;
    full_name: string;
    avatar_url?: string;
    phone?: string;
  }): Promise<{ success: boolean; user: User; token: string }> {
    const res = await fetch(`${API_BASE}/auth/google-sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal login Google SSO');
    if (data.token) {
      localStorage.setItem('arez_token', data.token);
    }
    return data;
  },

  async logout(): Promise<{ success: boolean }> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
    } catch (_) {}
    localStorage.removeItem('arez_token');
    localStorage.removeItem('arez_user');
    return { success: true };
  },

  async getUsers(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/auth/users`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengambil daftar pengguna');
    }
    return res.json();
  },

  // ----------------------------------------------------------------------
  // Staff User Management (Owner Only)
  // ----------------------------------------------------------------------
  async getStaffUsers(): Promise<StaffListResponse> {
    const res = await fetch(`${API_BASE}/users/staff`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengambil data staf');
    }
    return res.json();
  },

  async createStaff(payload: StaffCreatePayload): Promise<{ success: boolean; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/users/staff`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal membuat akun staf baru');
    }
    return res.json();
  },

  async getStaffDetail(id: string): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE}/users/staff/${id}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengambil detail staf');
    }
    return res.json();
  },

  async updateStaff(id: string, payload: StaffUpdatePayload): Promise<{ success: boolean; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/users/staff/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memperbarui data staf');
    }
    return res.json();
  },

  async updateStaffStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<{ success: boolean; user: User; message: string }> {
    const res = await fetch(`${API_BASE}/users/staff/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengubah status staf');
    }
    return res.json();
  },

  async resetStaffPassword(id: string, password: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/users/staff/${id}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mereset password staf');
    }
    return res.json();
  },

  async deleteStaff(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/users/staff/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menghapus akun staf');
    }
    return res.json();
  },

  // ----------------------------------------------------------------------
  // Queues
  // ----------------------------------------------------------------------
  async getQueues(date?: string): Promise<QueueItem[]> {
    const url = date ? `${API_BASE}/queues?date=${date}` : `${API_BASE}/queues`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return res.json();
  },

  async createQueue(payload: {
    customer_id?: string | null;
    walk_in_name?: string | null;
    customer_phone?: string | null;
    service_id: string;
    source?: 'ONLINE' | 'WALK_IN';
    notes?: string;
  }): Promise<{ success: boolean; queue: QueueItem }> {
    const res = await fetch(`${API_BASE}/queues`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mendaftar antrean');
    return data;
  },

  async startQueue(id: string): Promise<{ success: boolean; queue: QueueItem }> {
    const res = await fetch(`${API_BASE}/queues/${id}/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memulai antrean');
    return data;
  },

  async completeQueue(
    id: string,
    payload: {
      discount?: number;
      tax?: number;
      payment_method?: 'CASH' | 'QRIS' | 'DEBIT' | 'TRANSFER';
      custom_price?: number;
    }
  ): Promise<{ success: boolean; queue: QueueItem; transaction: Transaction }> {
    const res = await fetch(`${API_BASE}/queues/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyelesaikan antrean');
    return data;
  },

  async skipQueue(id: string): Promise<{ success: boolean; skippedQueue: QueueItem; nextWaiting?: QueueItem }> {
    const res = await fetch(`${API_BASE}/queues/${id}/skip`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal melewati antrean');
    return data;
  },

  async deleteQueue(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/queues/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membatalkan antrean');
    return data;
  },

  // ----------------------------------------------------------------------
  // Master HPP (Bahan Baku & Biaya Operasional)
  // ----------------------------------------------------------------------
  async getHPP(): Promise<MasterHPP[]> {
    const res = await fetch(`${API_BASE}/hpp`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal mengambil data komponen HPP');
    }
    return res.json();
  },

  async getHPPById(id: string): Promise<MasterHPP & { using_services?: { service_id: string; service_name: string; quantity_used: number }[] }> {
    const res = await fetch(`${API_BASE}/hpp/${id}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengambil detail komponen HPP');
    return data;
  },

  async createHPP(payload: MasterHPPCreatePayload): Promise<{ success: boolean; item: MasterHPP; message?: string }> {
    const res = await fetch(`${API_BASE}/hpp`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambah komponen HPP');
    return data;
  },

  async updateHPP(id: string, payload: MasterHPPUpdatePayload): Promise<{ success: boolean; item: MasterHPP; message?: string }> {
    const res = await fetch(`${API_BASE}/hpp/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memperbarui komponen HPP');
    return data;
  },

  async toggleHPPStatus(id: string, is_active: boolean): Promise<{ success: boolean; item: MasterHPP; message?: string }> {
    const res = await fetch(`${API_BASE}/hpp/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ is_active }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengubah status komponen HPP');
    return data;
  },

  async deleteHPP(id: string, force = false): Promise<{ success: boolean; message?: string; requires_confirmation?: boolean; error?: string; used_in_services_count?: number; service_names?: string[] }> {
    const res = await fetch(`${API_BASE}/hpp/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data.requires_confirmation) {
        return data;
      }
      throw new Error(data.error || 'Gagal menghapus komponen HPP');
    }
    return data;
  },

  // ----------------------------------------------------------------------
  // Services
  // ----------------------------------------------------------------------
  async getServices(): Promise<Service[]> {
    const res = await fetch(`${API_BASE}/services`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return res.json();
  },

  async createService(payload: {
    service_name: string;
    selling_price: number;
    duration_mins?: number;
    is_active?: boolean;
    description?: string;
    hpp_items?: { hpp_id: string; quantity_used: number }[];
  }): Promise<{ success: boolean; service: Service }> {
    const res = await fetch(`${API_BASE}/services`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membuat layanan');
    return data;
  },

  async updateService(id: string, payload: Partial<Service> & { hpp_items?: { hpp_id: string; quantity_used: number }[] }): Promise<{ success: boolean; service: Service }> {
    const res = await fetch(`${API_BASE}/services/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengupdate layanan');
    return data;
  },

  async deleteService(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/services/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus layanan');
    return data;
  },

  // ----------------------------------------------------------------------
  // Transactions & Direct POS
  // ----------------------------------------------------------------------
  async getTransactions(): Promise<Transaction[]> {
    const res = await fetch(`${API_BASE}/transactions`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return [];
    return res.json();
  },

  async directPOSCheckout(payload: {
    customer_name: string;
    service_id?: string;
    custom_service_name?: string;
    selling_price?: number;
    discount?: number;
    tax?: number;
    payment_method?: 'CASH' | 'QRIS' | 'DEBIT' | 'TRANSFER';
  }): Promise<{ success: boolean; transaction: Transaction }> {
    const res = await fetch(`${API_BASE}/transactions/direct-checkout`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memproses transaksi kasir');
    return data;
  },

  // ----------------------------------------------------------------------
  // Analytics & Recap
  // ----------------------------------------------------------------------
  async getAnalyticsRecap(): Promise<AnalyticsRecapResponse> {
    const res = await fetch(`${API_BASE}/analytics/recap`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      return {
        daily: { date: new Date().toISOString().split('T')[0], gross: 0, hpp: 0, net: 0, heads: 0, avg_ticket: 0 },
        weekly: [],
        monthly: { month: '', gross: 0, hpp: 0, net: 0, heads: 0, margin_percent: 0, top_services: [] },
      };
    }
    return res.json();
  },

  // ----------------------------------------------------------------------
  // CRM & Retention
  // ----------------------------------------------------------------------
  async getCRMBehavior(): Promise<CRMBehaviorResponse> {
    const res = await fetch(`${API_BASE}/crm/behavior`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      return { customers: [], total_customers: 0, retention_alerts_count: 0 };
    }
    return res.json();
  },

  async sendRetentionPush(userId: string, message?: string): Promise<{ success: boolean; notification: NotificationLog }> {
    const res = await fetch(`${API_BASE}/crm/send-retention-push`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId, message }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim push notifikasi');
    return data;
  },

  async getNotifications(userId: string): Promise<NotificationLog[]> {
    const res = await fetch(`${API_BASE}/notifications/${userId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return [];
    return res.json();
  },
};
