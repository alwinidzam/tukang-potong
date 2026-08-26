import React, { useState, useEffect } from 'react';
import { QueueItem, Service, User, NotificationLog } from '../types';
import { api } from '../lib/api';
import { BatteryProgressBar } from './BatteryProgressBar';
import {
  Scissors,
  Calendar,
  RefreshCw,
  AlertCircle,
  Phone,
  MessageSquare,
  ChevronRight,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface CustomerViewProps {
  currentUser: User | null;
  queues: QueueItem[];
  services: Service[];
  activeSubTab: 'queue' | 'services_view' | 'history' | 'notifications';
  onOpenAuth: () => void;
  onRefreshData: () => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  currentUser,
  queues,
  services,
  activeSubTab,
  onOpenAuth,
  onRefreshData,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [myQueues, setMyQueues] = useState<QueueItem[]>([]);

  // Active in-progress queue item
  const activeInProgressQueue = queues.find((q) => q.status === 'IN_PROGRESS');

  useEffect(() => {
    if (currentUser) {
      const userQueues = queues.filter((q) => q.customer_id === currentUser.id);
      setMyQueues(userQueues);
      setPhone(currentUser.phone || '');

      api.getNotifications(currentUser.id).then((res) => {
        setNotifications(res);
      });
    } else {
      setMyQueues([]);
      setNotifications([]);
    }
  }, [currentUser, queues]);

  useEffect(() => {
    if (services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  const myActiveTicket = myQueues.find(
    (q) => q.status === 'WAITING' || q.status === 'IN_PROGRESS'
  );
  const myCompletedTickets = myQueues.filter((q) => q.status === 'COMPLETED');

  const peopleAheadCount =
    myActiveTicket && myActiveTicket.status === 'WAITING'
      ? queues.filter(
          (q) =>
            (q.status === 'WAITING' || q.status === 'IN_PROGRESS') &&
            q.queue_number < myActiveTicket.queue_number
        ).length
      : 0;

  const handleTakeQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    if (!selectedServiceId) return;

    setSubmitting(true);
    try {
      await api.createQueue({
        customer_id: currentUser.id,
        customer_phone: phone || currentUser.phone,
        service_id: selectedServiceId,
        source: 'ONLINE',
        notes: notes.trim(),
      });
      playSuccessSound();
      setNotes('');
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal mengambil nomor antrean.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMyQueue = async (queueId: string) => {
    if (confirm('Batalkan antrean online Anda?')) {
      try {
        await api.deleteQueue(queueId);
        onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Gagal membatalkan antrean');
      }
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Editorial Welcome Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#4F7A5A] animate-pulse shrink-0" />
            <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66] truncate">
              Live Grooming Pipeline
            </span>
          </div>
          <button
            type="button"
            onClick={onRefreshData}
            title="Perbarui Data"
            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2">
          <h1 className="font-display text-2xl sm:text-3xl text-[#20231F] font-normal leading-tight">
            {currentUser ? `Selamat datang, ${currentUser.full_name.split(' ')[0]}` : 'Arez Barbershop'}
          </h1>
          <p className="text-xs text-[#686D66] mt-1 leading-relaxed">
            Pengalaman pangkas rambut presisi 18 menit dengan estimasi antrean transparan.
          </p>
        </div>

        {currentUser && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#E5E5DF] text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-[#92968F]">Kunjungan:</span>
              <span className="font-semibold text-[#20231F]">{currentUser.total_visits || 0} Sesi</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-[#92968F]">Favorit:</span>
              <span className="font-semibold text-[#26362E] truncate max-w-[130px]">
                {currentUser.favorite_service || 'Signature Cut'}
              </span>
            </div>
            <span className="text-[9px] font-semibold text-[#A47C45] bg-[#F7F2EA] px-2 py-0.5 rounded-full border border-[#E5E5DF] shrink-0">
              Gentleman
            </span>
          </div>
        )}
      </div>

      {/* SUB TAB 1: LIVE QUEUE & AMBIL NOMOR */}
      {activeSubTab === 'queue' && (
        <div className="space-y-4">
          {/* Live Chair Status Monitor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-[#20231F] flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-[#26362E]" />
                Kursi Utama Grooming
              </span>
              <span className="text-[11px] text-[#686D66] font-medium">Standar 18m / Sesi</span>
            </div>

            {activeInProgressQueue ? (
              <BatteryProgressBar
                startTime={activeInProgressQueue.start_time}
                isActive={true}
                totalDurationMins={18}
                customerName={activeInProgressQueue.customer_name}
                serviceName={activeInProgressQueue.service_name}
                queueNumber={activeInProgressQueue.queue_number}
                variant="customer"
              />
            ) : (
              <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 text-center rounded-[14px]">
                <p className="text-xs font-semibold text-[#20231F]">
                  Kursi Siap Digunakan
                </p>
                <p className="text-[11px] text-[#686D66] mt-0.5">
                  Nomor antrean berikutnya akan segera dipanggil oleh barber.
                </p>
              </div>
            )}
          </div>

          {/* Active Ticket Card if user has active queue */}
          {myActiveTicket ? (
            <div
              id="my-active-ticket"
              className="bg-[#FFFFFF] border-2 border-[#26362E] p-4 sm:p-5 rounded-[14px] shadow-[0_4px_16px_rgba(38,54,46,0.06)] space-y-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] bg-[#26362E] text-[#FFFFFF] px-2.5 py-0.5 rounded-full inline-block">
                    Tiket Antrean Anda
                  </span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-4xl sm:text-5xl font-medium text-[#20231F] leading-none">
                      #{myActiveTicket.queue_number}
                    </span>
                    <span className="text-[11px] font-medium text-[#686D66]">
                      {myActiveTicket.source === 'ONLINE' ? 'Booking Online' : 'Walk-In'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#20231F] mt-1 truncate">
                    {myActiveTicket.service_name}
                  </h3>
                  <p className="text-xs font-medium text-[#26362E] mt-0.5">
                    Rp {Number(myActiveTicket.service_price || 50000).toLocaleString('id-ID')}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] whitespace-nowrap inline-flex items-center justify-center leading-none ${
                      myActiveTicket.status === 'IN_PROGRESS'
                        ? 'bg-[#26362E] text-[#FFFFFF]'
                        : 'bg-[#E8ECE8] text-[#26362E]'
                    }`}
                  >
                    {myActiveTicket.status === 'IN_PROGRESS'
                      ? 'Sedang Dilayani'
                      : 'Menunggu Giliran'}
                  </div>
                  {myActiveTicket.status === 'WAITING' && (
                    <div className="mt-2 text-right">
                      <p className="text-[10px] text-[#686D66]">Di depan Anda:</p>
                      <p className="text-sm font-bold text-[#20231F]">{peopleAheadCount} Tamu</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrival Notice */}
              <div className="p-2.5 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#A47C45] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#686D66] leading-relaxed">
                  Harap tiba 15 menit sebelum giliran Anda agar nomor antrean tetap aktif dan siap saat dipanggil.
                </p>
              </div>

              {myActiveTicket.status === 'WAITING' && (
                <div className="pt-0.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleCancelMyQueue(myActiveTicket.id)}
                    className="text-xs text-[#A84B45] hover:underline font-medium transition-all"
                  >
                    Batalkan Antrean Saya
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Form Ambil Antrean Baru */
            <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3.5">
              <div>
                <h3 className="text-sm font-semibold text-[#20231F]">
                  Ambil Nomor Antrean
                </h3>
                <p className="text-xs text-[#686D66] mt-0.5">
                  Pilih layanan grooming dan dapatkan nomor urut otomatis untuk pangkas hari ini.
                </p>
              </div>

              {!currentUser ? (
                <div className="bg-[#F7F6F2] border border-[#E5E5DF] p-4 text-center rounded-[10px] space-y-2.5">
                  <p className="text-xs text-[#686D66]">
                    Silakan masuk terlebih dahulu untuk mengambil nomor antrean online.
                  </p>
                  <button
                    id="btn-login-to-queue"
                    type="button"
                    onClick={onOpenAuth}
                    className="px-5 py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] active:scale-95 transition-all shadow-xs"
                  >
                    Masuk Sekarang
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTakeQueue} className="space-y-3.5">
                  {/* Service Selection Grid */}
                  <div>
                    <label className="block text-xs font-medium text-[#20231F] mb-1.5">
                      Pilih Layanan
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {services
                        .filter((s) => s.is_active)
                        .map((srv) => {
                          const isSelected = selectedServiceId === srv.id;
                          return (
                            <div
                              key={srv.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedServiceId(srv.id)}
                              className={`p-3 border rounded-[10px] cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-[#26362E] bg-[#E8ECE8]/60 ring-1 ring-[#26362E]'
                                  : 'border-[#E5E5DF] bg-[#FFFFFF] hover:border-[#686D66]'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="text-xs font-semibold text-[#20231F] truncate">
                                  {srv.service_name}
                                </h4>
                                <span className="text-xs font-semibold text-[#26362E] shrink-0">
                                  Rp {srv.selling_price.toLocaleString('id-ID')}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#686D66] mt-1 leading-snug line-clamp-2">
                                {srv.description || 'Layanan pangkas rambut presisi.'}
                              </p>
                              <div className="mt-2 flex items-center justify-between text-[10px] text-[#686D66] pt-1.5 border-t border-[#E5E5DF]">
                                <span>Durasi Sesi</span>
                                <span className="font-semibold text-[#20231F]">{srv.duration_mins} Menit</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Contact Phone & Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#20231F] mb-1">
                        Nomor WhatsApp
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686D66]" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="08123456789"
                          className="w-full pl-9 pr-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#20231F] mb-1">
                        Catatan Gaya (Opsional)
                      </label>
                      <div className="relative">
                        <MessageSquare className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686D66]" />
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Misal: Low fade, potong atas tipis"
                          className="w-full pl-9 pr-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="btn-submit-take-queue"
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs"
                  >
                    {submitting ? 'Memproses Nomor...' : 'Konfirmasi Ambil Nomor Antrean'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Today's Queue Board */}
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E5DF]">
              <h3 className="text-xs font-semibold text-[#20231F]">
                Daftar Antrean Hari Ini ({queues.length})
              </h3>
              <span className="text-[10px] text-[#686D66] font-medium">Sinkron Real-Time</span>
            </div>

            <div className="divide-y divide-[#E5E5DF] max-h-64 overflow-y-auto no-scrollbar">
              {queues.length === 0 ? (
                <p className="text-xs text-[#686D66] py-4 text-center">Belum ada antrean terdaftar hari ini.</p>
              ) : (
                queues.map((q) => {
                  const isMyTicket = currentUser && q.customer_id === currentUser.id;
                  return (
                    <div
                      key={q.id}
                      className={`py-2.5 px-2 flex items-center justify-between gap-2.5 text-xs rounded-[8px] border border-transparent transition-colors ${
                        isMyTicket ? 'bg-[#E8ECE8]/60 border-[#26362E]/20' : 'hover:bg-[#F7F6F2]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="font-mono text-xs font-semibold text-[#20231F] w-7 shrink-0">
                          #{q.queue_number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[#20231F] truncate">
                            {q.customer_name} {isMyTicket && <span className="text-[#26362E] font-semibold">(Anda)</span>}
                          </p>
                          <p className="text-[11px] text-[#686D66] truncate">{q.service_name}</p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap inline-flex items-center justify-center leading-none ${
                            q.status === 'IN_PROGRESS'
                              ? 'bg-[#26362E] text-[#FFFFFF]'
                              : q.status === 'WAITING'
                              ? 'bg-[#E8ECE8] text-[#26362E]'
                              : q.status === 'COMPLETED'
                              ? 'text-[#686D66] bg-[#F1F1EC] border border-[#E5E5DF]'
                              : 'text-[#A84B45] line-through bg-[#F1F1EC] border border-[#E5E5DF]'
                          }`}
                        >
                          {q.status === 'IN_PROGRESS'
                            ? 'Sedang Cukur'
                            : q.status === 'WAITING'
                            ? 'Menunggu'
                            : q.status === 'COMPLETED'
                            ? 'Selesai'
                            : 'Dilewati'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB: SERVICES VIEW */}
      {activeSubTab === 'services_view' && (
        <div className="space-y-3.5">
          <div className="border-b border-[#E5E5DF] pb-2.5">
            <h2 className="text-base font-semibold text-[#20231F]">
              Katalog Layanan Grooming
            </h2>
            <p className="text-xs text-[#686D66] mt-0.5">
              Standar pangkas rambut & perawatan pria terbaik dari Arez Barbershop.
            </p>
          </div>

          <div className="space-y-2.5">
            {services.map((s) => (
              <div
                key={s.id}
                className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#20231F] truncate">{s.service_name}</h3>
                    <span className="text-[10px] text-[#686D66] bg-[#F1F1EC] px-1.5 py-0.5 rounded-[4px] border border-[#E5E5DF] shrink-0">
                      {s.duration_mins}m
                    </span>
                  </div>
                  <p className="text-xs text-[#686D66] leading-relaxed line-clamp-2">
                    {s.description || 'Layanan pangkas rambut dan grooming presisi.'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs sm:text-sm font-semibold text-[#26362E]">
                    Rp {s.selling_price.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB TAB: HISTORY */}
      {activeSubTab === 'history' && (
        <div className="space-y-3.5">
          <div className="border-b border-[#E5E5DF] pb-2.5">
            <h2 className="text-base font-semibold text-[#20231F]">
              Riwayat Kunjungan
            </h2>
            <p className="text-xs text-[#686D66] mt-0.5">
              Catatan sesi potong rambut Anda di Arez Barbershop.
            </p>
          </div>

          {!currentUser ? (
            <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center rounded-[12px] space-y-3">
              <p className="text-xs text-[#686D66]">Silakan masuk untuk melihat riwayat personal Anda.</p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-5 py-2.5 bg-[#26362E] text-[#FFFFFF] text-xs font-semibold rounded-[8px] shadow-xs"
              >
                Masuk Sekarang
              </button>
            </div>
          ) : myCompletedTickets.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center rounded-[12px]">
              <Calendar className="w-5 h-5 text-[#92968F] mx-auto mb-2" />
              <p className="text-xs text-[#686D66]">Belum ada riwayat sesi selesai yang tercatat.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myCompletedTickets.map((t) => (
                <div
                  key={t.id}
                  className="bg-[#FFFFFF] border border-[#E5E5DF] p-3 rounded-[10px] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#20231F] shrink-0">#{t.queue_number}</span>
                      <span className="text-[11px] text-[#686D66]">
                        {new Date(t.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-[#20231F] mt-0.5 truncate">{t.service_name}</h4>
                    {t.notes && <p className="text-[10px] text-[#686D66] italic truncate">"{t.notes}"</p>}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-semibold text-[#26362E]">
                      Rp {Number(t.service_price || 50000).toLocaleString('id-ID')}
                    </span>
                    <p className="text-[9px] text-[#4F7A5A] font-semibold mt-0.5">Selesai</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB TAB: NOTIFICATIONS */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-3.5">
          <div className="border-b border-[#E5E5DF] pb-2.5">
            <h2 className="text-base font-semibold text-[#20231F]">
              Pusat Notifikasi
            </h2>
            <p className="text-xs text-[#686D66] mt-0.5">
              Pemberitahuan status antrean dan jadwal pangkas rutin.
            </p>
          </div>

          <div className="space-y-2">
            {notifications.length === 0 ? (
              <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center text-xs text-[#686D66] rounded-[12px]">
                Belum ada pemberitahuan baru saat ini.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 rounded-[10px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-semibold text-[#26362E] uppercase tracking-wider bg-[#E8ECE8] px-2 py-0.5 rounded-full">
                      {n.type === 'RETENTION_30D' ? 'Pengingat Berkala' : 'Info Antrean'}
                    </span>
                    <span className="text-[10px] text-[#92968F] shrink-0">
                      {new Date(n.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-[#20231F] mt-1">{n.title}</h4>
                  <p className="text-xs text-[#686D66] leading-relaxed">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
