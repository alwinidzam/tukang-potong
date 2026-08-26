import React, { useState, useEffect } from 'react';
import { CRMBehaviorCustomer } from '../types';
import { api } from '../lib/api';
import {
  Bell,
  RefreshCw,
  Send,
  CheckCircle2,
  Calendar,
  Users,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface CRMBehaviorViewProps {
  onRefreshData: () => void;
}

export const CRMBehaviorView: React.FC<CRMBehaviorViewProps> = ({ onRefreshData }) => {
  const [customers, setCustomers] = useState<CRMBehaviorCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState<string | null>(null);
  const [sentSuccessId, setSentSuccessId] = useState<string | null>(null);

  const fetchCRMData = async () => {
    setLoading(true);
    try {
      const res = await api.getCRMBehavior();
      setCustomers(res.customers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, []);

  const handleSendRetentionPush = async (customerId: string, name: string) => {
    setSendingPush(customerId);
    try {
      await api.sendRetentionPush(
        customerId,
        `Halo ${name}, sudah lebih dari 30 hari sejak kunjungan potong rambut terakhir Anda di Arez Barbershop. Waktunya merapikan rambut agar selalu prima!`
      );
      playSuccessSound();
      setSentSuccessId(customerId);
      setTimeout(() => setSentSuccessId(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(err.message || 'Gagal mengirim notifikasi');
    } finally {
      setSendingPush(null);
    }
  };

  const retentionAlertCustomers = customers.filter((c) => c.needs_retention_reminder);

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Retensi Pelanggan
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            CRM & Kebiasaan Tamu
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchCRMData();
            onRefreshData();
          }}
          title="Refresh Data"
          className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Retention Alert Summary Card */}
      <div className="p-4 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#20231F] flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-[#A47C45]" />
            Pengingat Otomatis 30 Hari
          </span>
          <span className="text-xs font-semibold text-[#A47C45] bg-[#F7F2EA] px-2.5 py-0.5 rounded-full border border-[#E5E5DF]">
            {retentionAlertCustomers.length} Tamu Siap Diingatkan
          </span>
        </div>
        <p className="text-xs text-[#686D66] leading-relaxed">
          Tamu yang belum berkunjung selama lebih dari 30 hari dapat diberikan pengingat sopan untuk menjaga ritme pangkas rambut.
        </p>
      </div>

      {/* Customer List Cards */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center text-xs text-[#686D66] rounded-[12px]">
            Memuat profil kebiasaan tamu...
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center text-xs text-[#686D66] rounded-[12px]">
            Belum ada data pelanggan yang tercatat.
          </div>
        ) : (
          customers.map((c) => (
            <div
              key={c.id}
              className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#20231F] truncate">{c.full_name}</h3>
                  <p className="text-xs text-[#686D66] mt-0.5">{c.phone || c.email || 'Tanpa Kontak'}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-[#26362E]">
                    {c.total_visits} Kunjungan
                  </span>
                  <p className="text-[10px] text-[#686D66] mt-0.5 truncate max-w-[120px]">
                    {c.favorite_service || 'Signature Cut'}
                  </p>
                </div>
              </div>

              {/* Behavior details */}
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#F7F6F2] rounded-[8px] text-xs">
                <div>
                  <span className="text-[10px] text-[#686D66]">Kunjungan Terakhir</span>
                  <p className="font-medium text-[#20231F] mt-0.5">
                    {(c.last_visit_at || (c as any).last_visit)
                      ? new Date(c.last_visit_at || (c as any).last_visit).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Belum pernah'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-[#686D66]">Jarak Waktu</span>
                  <p
                    className={`font-semibold mt-0.5 ${
                      (c.days_since_last_visit ?? 0) >= 30 ? 'text-[#A47C45]' : 'text-[#4F7A5A]'
                    }`}
                  >
                    {c.days_since_last_visit ?? 0} Hari Lalu
                  </p>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2 border-t border-[#E5E5DF] flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#686D66]">
                  {(c.favorite_day || (c as any).preferred_day) ? `Hari Favorit: ${c.favorite_day || (c as any).preferred_day}` : 'Jadwal Fleksibel'}
                </span>

                {c.needs_retention_reminder ? (
                  <button
                    type="button"
                    onClick={() => handleSendRetentionPush(c.id, c.full_name)}
                    disabled={sendingPush === c.id || sentSuccessId === c.id}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] flex items-center gap-1.5 transition-all shadow-xs ${
                      sentSuccessId === c.id
                        ? 'bg-[#4F7A5A] text-[#FFFFFF]'
                        : 'bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] active:scale-95'
                    }`}
                  >
                    {sentSuccessId === c.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Terkirim</span>
                      </>
                    ) : sendingPush === c.id ? (
                      <span>Mengirim...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Kirim Pengingat</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-[10px] font-medium text-[#4F7A5A] bg-[#E8ECE8] px-2 py-0.5 rounded-full">
                    Kunjungan Teratur
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
