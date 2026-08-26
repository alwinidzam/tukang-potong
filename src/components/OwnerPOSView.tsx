import React, { useState } from 'react';
import { QueueItem, Service, DailyRecap, Transaction } from '../types';
import { api } from '../lib/api';
import { BatteryProgressBar } from './BatteryProgressBar';
import {
  Scissors,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Printer,
  Receipt,
  CreditCard,
  Banknote,
  QrCode,
  ArrowRight,
  TrendingUp,
  Clock,
  X,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface OwnerPOSViewProps {
  queues: QueueItem[];
  services: Service[];
  dailyRecap: DailyRecap | null;
  onRefreshData: () => void;
}

export const OwnerPOSView: React.FC<OwnerPOSViewProps> = ({
  queues,
  services,
  dailyRecap,
  onRefreshData,
}) => {
  const [activeQueueTab, setActiveQueueTab] = useState<'WAITING' | 'COMPLETED' | 'SKIPPED'>('WAITING');

  // Modals / Bottom Sheets State
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [isQuickCheckoutOpen, setIsQuickCheckoutOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeCheckoutQueue, setActiveCheckoutQueue] = useState<QueueItem | null>(null);
  const [lastCompletedTransaction, setLastCompletedTransaction] = useState<Transaction | null>(null);

  // Walk-in Form State
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInServiceId, setWalkInServiceId] = useState(services[0]?.id || '');
  const [walkInNotes, setWalkInNotes] = useState('');
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);

  // Checkout Form State
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'CASH' | 'QRIS' | 'DEBIT' | 'TRANSFER'>('CASH');
  const [checkoutDiscount, setCheckoutDiscount] = useState<number>(0);
  const [checkoutTax, setCheckoutTax] = useState<number>(0);
  const [cashGiven, setCashGiven] = useState<string>('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  // Active in-progress queue item
  const activeSessionQueue = queues.find((q) => q.status === 'IN_PROGRESS');
  const waitingQueues = queues.filter((q) => q.status === 'WAITING');
  const completedQueues = queues.filter((q) => q.status === 'COMPLETED');
  const skippedQueues = queues.filter((q) => q.status === 'SKIPPED');

  // Calculate current checkout totals
  const currentServicePrice = activeCheckoutQueue
    ? Number(activeCheckoutQueue.service_price || 0)
    : 0;
  const netPayable = Math.max(0, currentServicePrice - checkoutDiscount + checkoutTax);
  const numericCashGiven = Number(cashGiven.replace(/\D/g, '') || 0);
  const cashChange = Math.max(0, numericCashGiven - netPayable);

  // Handle Walk-In Form Submit
  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim()) {
      alert('Nama pelanggan wajib diisi.');
      return;
    }
    const targetServiceId = walkInServiceId || services[0]?.id;
    if (!targetServiceId) {
      alert('Pilih salah satu layanan.');
      return;
    }

    setWalkInSubmitting(true);
    try {
      await api.createQueue({
        walk_in_name: walkInName.trim(),
        customer_phone: walkInPhone.trim() || undefined,
        service_id: targetServiceId,
        source: 'WALK_IN',
        notes: walkInNotes.trim() || undefined,
      });
      playSuccessSound();
      setIsWalkInModalOpen(false);
      setWalkInName('');
      setWalkInPhone('');
      setWalkInNotes('');
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal menambahkan tamu walk-in');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  // Start Queue Session
  const handleStartQueue = async (queueId: string) => {
    try {
      await api.startQueue(queueId);
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal memulai sesi pangkas');
    }
  };

  // Skip Queue
  const handleSkipQueue = async (queueId: string) => {
    if (confirm('Lewati antrean tamu ini?')) {
      try {
        await api.skipQueue(queueId);
        onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Gagal melewati antrean');
      }
    }
  };

  // Open Checkout Sheet
  const handleOpenCheckout = (q: QueueItem) => {
    setActiveCheckoutQueue(q);
    setCheckoutPaymentMethod('CASH');
    setCheckoutDiscount(0);
    setCheckoutTax(0);
    setCashGiven(String(q.service_price || 50000));
    setIsQuickCheckoutOpen(true);
  };

  // Submit Checkout & Process Payment
  const handleProcessCheckout = async () => {
    if (!activeCheckoutQueue) return;
    setCheckoutSubmitting(true);

    try {
      const res = await api.completeQueue(activeCheckoutQueue.id, {
        payment_method: checkoutPaymentMethod,
        discount: Number(checkoutDiscount) || 0,
        tax: Number(checkoutTax) || 0,
      });

      playSuccessSound();
      setIsQuickCheckoutOpen(false);
      setLastCompletedTransaction(res.transaction);
      setIsReceiptModalOpen(true);
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal memproses transaksi kasir');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Daily Performance Strip */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5E5DF]">
          <div className="flex items-center gap-1.5 min-w-0">
            <TrendingUp className="w-4 h-4 text-[#4F7A5A] shrink-0" />
            <span className="text-xs font-semibold text-[#20231F] truncate">
              Ringkasan Hari Ini
            </span>
          </div>
          <button
            type="button"
            onClick={onRefreshData}
            title="Refresh Data"
            className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-[#F1F1EC] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2.5">
          <div className="min-w-0">
            <span className="text-[10px] text-[#686D66] block leading-none truncate">Omset</span>
            <p className="text-xs sm:text-sm font-semibold text-[#20231F] mt-1 truncate">
              Rp {(dailyRecap?.gross ?? 0).toLocaleString('id-ID')}
            </p>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-[#686D66] block leading-none truncate">Laba Bersih</span>
            <p className="text-xs sm:text-sm font-semibold text-[#4F7A5A] mt-1 truncate">
              Rp {(dailyRecap?.net ?? 0).toLocaleString('id-ID')}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <span className="text-[10px] text-[#686D66] block leading-none truncate">Selesai</span>
            <p className="text-xs sm:text-sm font-semibold text-[#A47C45] mt-1 truncate">
              {dailyRecap?.heads ?? 0} Sesi
            </p>
          </div>
        </div>
      </div>

      {/* Primary Active Session Card */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-[#20231F] flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5 text-[#26362E]" />
            Sesi Pangkas Berjalan
          </span>
          <span className="text-[10px] text-[#686D66] font-medium">Standar 18 Menit</span>
        </div>

        {activeSessionQueue ? (
          <div className="bg-[#FFFFFF] border-2 border-[#26362E] p-4 rounded-[14px] shadow-[0_4px_16px_rgba(38,54,46,0.06)] space-y-3">
            <BatteryProgressBar
              startTime={activeSessionQueue.start_time}
              isActive={true}
              totalDurationMins={18}
              customerName={activeSessionQueue.customer_name}
              serviceName={activeSessionQueue.service_name}
              queueNumber={activeSessionQueue.queue_number}
              variant="owner"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                id="btn-complete-and-checkout"
                type="button"
                onClick={() => handleOpenCheckout(activeSessionQueue)}
                className="flex-1 min-h-[46px] py-2.5 px-3 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4 text-[#FFFFFF]" />
                Selesaikan & Terima Bayar
              </button>

              <button
                type="button"
                onClick={() => handleSkipQueue(activeSessionQueue.id)}
                title="Lewati Sesi"
                className="w-11 h-[46px] flex items-center justify-center rounded-[8px] bg-[#F1F1EC] border border-[#E5E5DF] text-[#686D66] hover:text-[#A84B45] active:scale-95 transition-all shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-5 text-center rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-[#20231F]">
                Kursi Sedang Kosong
              </p>
              <p className="text-xs text-[#686D66] mt-0.5">
                {waitingQueues.length > 0
                  ? `${waitingQueues.length} antrean tamu menunggu untuk dilayani.`
                  : 'Belum ada antrean tamu menunggu.'}
              </p>
            </div>

            {waitingQueues.length > 0 ? (
              <button
                id="btn-start-next-queue"
                type="button"
                onClick={() => handleStartQueue(waitingQueues[0].id)}
                className="px-5 min-h-[44px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] inline-flex items-center gap-2 active:scale-95 transition-all shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Mulai #{waitingQueues[0].queue_number} ({waitingQueues[0].customer_name})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsWalkInModalOpen(true)}
                className="px-4 min-h-[40px] py-2 bg-[#E8ECE8] text-[#26362E] text-xs font-semibold rounded-[8px] inline-flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Tamu Walk-In
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Action Button Strip */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-open-walkin-modal"
          type="button"
          onClick={() => setIsWalkInModalOpen(true)}
          className="min-h-[46px] p-2.5 bg-[#FFFFFF] border border-[#E5E5DF] hover:border-[#26362E] rounded-[10px] flex items-center justify-center gap-2 text-xs font-semibold text-[#20231F] active:scale-98 transition-all shadow-xs"
        >
          <div className="w-6 h-6 rounded-full bg-[#E8ECE8] text-[#26362E] flex items-center justify-center shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>+ Tamu Walk-In</span>
        </button>

        <button
          id="btn-open-quick-cashier"
          type="button"
          onClick={() => {
            if (waitingQueues.length > 0) {
              handleOpenCheckout(waitingQueues[0]);
            } else if (services.length > 0) {
              setIsWalkInModalOpen(true);
            }
          }}
          className="min-h-[46px] p-2.5 bg-[#FFFFFF] border border-[#E5E5DF] hover:border-[#26362E] rounded-[10px] flex items-center justify-center gap-2 text-xs font-semibold text-[#20231F] active:scale-98 transition-all shadow-xs"
        >
          <div className="w-6 h-6 rounded-full bg-[#F7F2EA] text-[#A47C45] flex items-center justify-center shrink-0">
            <Receipt className="w-3.5 h-3.5" />
          </div>
          <span>Kasir Cepat Langsung</span>
        </button>
      </div>

      {/* Queue Filter Segmented Tabs */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[8px] border border-[#E5E5DF]">
          {(['WAITING', 'COMPLETED', 'SKIPPED'] as const).map((tab) => {
            const count =
              tab === 'WAITING'
                ? waitingQueues.length
                : tab === 'COMPLETED'
                ? completedQueues.length
                : skippedQueues.length;
            const label = tab === 'WAITING' ? 'Menunggu' : tab === 'COMPLETED' ? 'Selesai' : 'Dilewati';

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveQueueTab(tab)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all flex items-center justify-center gap-1.5 ${
                  activeQueueTab === tab
                    ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
                    : 'text-[#686D66] hover:text-[#20231F]'
                }`}
              >
                <span>{label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#E5E5DF]/70 text-[#20231F]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Queue Items List */}
        <div className="divide-y divide-[#E5E5DF] max-h-80 overflow-y-auto no-scrollbar">
          {activeQueueTab === 'WAITING' && (
            waitingQueues.length === 0 ? (
              <p className="text-xs text-[#686D66] py-6 text-center">Tidak ada antrean yang sedang menunggu.</p>
            ) : (
              waitingQueues.map((q) => (
                <div key={q.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="font-mono text-xs font-semibold text-[#20231F] w-7 shrink-0">
                      #{q.queue_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-[#20231F] truncate">{q.customer_name}</p>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#F1F1EC] text-[#686D66] shrink-0">
                          {q.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#686D66] truncate">{q.service_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartQueue(q.id)}
                      className="px-3 py-1.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[6px] flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Mulai</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkipQueue(q.id)}
                      title="Lewati"
                      className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#A84B45] bg-[#F1F1EC] hover:bg-[#E5E5DF] transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {activeQueueTab === 'COMPLETED' && (
            completedQueues.length === 0 ? (
              <p className="text-xs text-[#686D66] py-6 text-center">Belum ada sesi selesai hari ini.</p>
            ) : (
              completedQueues.map((q) => (
                <div key={q.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold text-[#20231F] w-7 shrink-0">
                      #{q.queue_number}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#20231F] truncate">{q.customer_name}</p>
                      <p className="text-[11px] text-[#686D66] truncate">{q.service_name}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-semibold text-[#4F7A5A]">
                      Rp {Number(q.service_price || 50000).toLocaleString('id-ID')}
                    </span>
                    <p className="text-[9px] text-[#686D66]">
                      {q.end_time ? new Date(q.end_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Selesai'}
                    </p>
                  </div>
                </div>
              ))
            )
          )}

          {activeQueueTab === 'SKIPPED' && (
            skippedQueues.length === 0 ? (
              <p className="text-xs text-[#686D66] py-6 text-center">Tidak ada antrean yang dilewati.</p>
            ) : (
              skippedQueues.map((q) => (
                <div key={q.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold text-[#686D66] line-through w-7 shrink-0">
                      #{q.queue_number}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#686D66] line-through truncate">{q.customer_name}</p>
                      <p className="text-[11px] text-[#92968F] truncate">{q.service_name}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartQueue(q.id)}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#26362E] bg-[#E8ECE8] rounded-[6px] hover:bg-[#26362E] hover:text-[#FFFFFF] transition-all"
                  >
                    Panggil Ulang
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* BOTTOM SHEET MODAL 1: WALK-IN ENTRY */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            id="walkin-modal"
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
                  Kasir Lapangan
                </span>
                <h3 className="font-display text-xl text-[#20231F] font-normal leading-tight mt-0.5">
                  Tambah Tamu Walk-In
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWalkInModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66] hover:text-[#20231F]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Pelanggan
                </label>
                <input
                  type="text"
                  required
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Contoh: Dimas Aditya"
                  className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nomor Telepon / WhatsApp (Opsional)
                </label>
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="08123456789"
                  className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#20231F]">
                  Pilih Layanan Grooming <span className="text-[#A84B45]">*</span>
                </label>
                <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar pr-0.5">
                  {services
                    .filter((s) => s.is_active !== false)
                    .map((s) => {
                      const isSelected = walkInServiceId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setWalkInServiceId(s.id)}
                          className={`w-full text-left p-3 rounded-[10px] border transition-all flex items-center justify-between gap-3 active:scale-[0.99] ${
                            isSelected
                              ? 'border-[#26362E] bg-[#E8ECE8]/50 shadow-xs ring-1 ring-[#26362E]'
                              : 'border-[#E5E5DF] bg-[#FFFFFF] hover:border-[#686D66]/40'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-xs text-[#20231F] truncate block">
                              {s.service_name}
                            </span>
                            <p className="text-[11px] text-[#686D66] mt-0.5">
                              Rp {s.selling_price.toLocaleString('id-ID')}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-medium text-[#686D66] bg-[#F1F1EC] px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-[#92968F]" />
                              {s.duration_mins}m
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-[#26362E] bg-[#26362E]'
                                  : 'border-[#E5E5DF] bg-[#FFFFFF]'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF]" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Catatan Permintaan Gaya (Opsional)
                </label>
                <input
                  type="text"
                  value={walkInNotes}
                  onChange={(e) => setWalkInNotes(e.target.value)}
                  placeholder="Misal: Side part natural, cukur jenggot tipis"
                  className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <button
                type="submit"
                disabled={walkInSubmitting}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {walkInSubmitting ? 'Mendaftarkan...' : 'Daftarkan ke Antrean Hari Ini'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET MODAL 2: CHECKOUT & PAYMENT */}
      {isQuickCheckoutOpen && activeCheckoutQueue && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            id="checkout-modal"
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
                  Penyelesaian Sesi & Kasir
                </span>
                <h3 className="font-display text-xl text-[#20231F] font-normal leading-tight mt-0.5">
                  Terima Pembayaran
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCheckoutOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66] hover:text-[#20231F]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ticket Summary Card */}
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-[#20231F] flex items-center gap-1.5">
                  <span className="font-mono bg-[#26362E] text-[#FFFFFF] px-1.5 py-0.2 rounded">
                    #{activeCheckoutQueue.queue_number}
                  </span>
                  {activeCheckoutQueue.customer_name}
                </span>
                <span className="text-[#686D66] font-medium">{activeCheckoutQueue.service_name}</span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E5E5DF]">
                <span className="text-[#686D66]">Harga Jual Layanan:</span>
                <span className="font-semibold text-[#20231F]">
                  Rp {currentServicePrice.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Discount & Tax Adjustment */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Diskon (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={checkoutDiscount}
                  onChange={(e) => setCheckoutDiscount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Pajak / Biaya (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={checkoutTax}
                  onChange={(e) => setCheckoutTax(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1.5">
                Metode Pembayaran
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['CASH', 'QRIS', 'DEBIT', 'TRANSFER'] as const).map((method) => {
                  const isSelected = checkoutPaymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setCheckoutPaymentMethod(method)}
                      className={`py-2 px-1 text-xs font-semibold rounded-[8px] border transition-all ${
                        isSelected
                          ? 'bg-[#26362E] text-[#FFFFFF] border-[#26362E] shadow-xs'
                          : 'bg-[#F1F1EC] text-[#686D66] border-[#E5E5DF] hover:text-[#20231F]'
                      }`}
                    >
                      {method}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cash Input & Change Calculation */}
            {checkoutPaymentMethod === 'CASH' && (
              <div className="space-y-2.5 p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px]">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-[#20231F]">Uang Tunai Diterima:</label>
                  <input
                    type="number"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="w-32 px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[6px] text-xs text-right font-semibold text-[#20231F]"
                  />
                </div>
                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-[#E5E5DF]">
                  <span className="text-[#686D66]">Kembalian Tunai:</span>
                  <span className="font-bold text-[#4F7A5A] text-sm">
                    Rp {cashChange.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            )}

            {/* Total Payable Box */}
            <div className="p-3.5 bg-[#E8ECE8] border border-[#E5E5DF] rounded-[10px] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#686D66] uppercase tracking-wider font-semibold">
                  Total Tagihan
                </span>
                <p className="text-xl font-bold text-[#26362E]">
                  Rp {netPayable.toLocaleString('id-ID')}
                </p>
              </div>
              <span className="text-xs font-semibold text-[#26362E] bg-[#FFFFFF] px-2.5 py-1 rounded-[6px] border border-[#E5E5DF]">
                {checkoutPaymentMethod}
              </span>
            </div>

            <button
              id="btn-confirm-checkout"
              type="button"
              disabled={checkoutSubmitting}
              onClick={handleProcessCheckout}
              className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs"
            >
              {checkoutSubmitting ? 'Menyimpan Transaksi...' : 'Konfirmasi & Cetak Struk'}
              <CheckCircle2 className="w-4 h-4 text-[#FFFFFF]" />
            </button>
          </div>
        </div>
      )}

      {/* RECEIPT PREVIEW / PRINT MODAL */}
      {isReceiptModalOpen && lastCompletedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#20231F]/60 backdrop-blur-xs">
          <div
            id="receipt-modal"
            className="w-full max-w-sm bg-[#FFFFFF] border border-[#E5E5DF] rounded-[16px] p-5 relative shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#20231F] flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#26362E]" />
                Struk Transaksi Selesai
              </span>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Printable Area (80mm compliant) */}
            <div
              id="receipt-printable-area"
              className="p-4 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] text-xs font-mono space-y-2 text-[#20231F]"
            >
              <div className="text-center pb-2 border-b border-dashed border-[#E5E5DF]">
                <h4 className="font-bold text-sm text-[#20231F]">AREZ BARBERSHOP</h4>
                <p className="text-[10px] text-[#686D66]">Quiet Luxury Grooming & Care</p>
                <p className="text-[9px] text-[#686D66] mt-0.5">
                  {lastCompletedTransaction.created_at ? new Date(lastCompletedTransaction.created_at).toLocaleString('id-ID') : '-'}
                </p>
              </div>

              <div className="space-y-1 text-[11px] py-1 border-b border-dashed border-[#E5E5DF]">
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-semibold">{lastCompletedTransaction.customer_name || 'Pelanggan'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Layanan:</span>
                  <span>{lastCompletedTransaction.service_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Metode:</span>
                  <span>{lastCompletedTransaction.payment_method || 'CASH'}</span>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>Total Tagihan:</span>
                  <span className="font-bold">
                    Rp {((lastCompletedTransaction.total_price ?? (lastCompletedTransaction as any).net_amount) ?? 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-[#686D66]">
                  <span>HPP Bahan:</span>
                  <span>Rp {(lastCompletedTransaction.total_hpp ?? 0).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-[10px] text-[#4F7A5A] font-semibold">
                  <span>Laba Bersih:</span>
                  <span>Rp {(lastCompletedTransaction.net_profit ?? 0).toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="text-center pt-2 text-[10px] text-[#686D66] border-t border-dashed border-[#E5E5DF]">
                Terima kasih atas kunjungan Anda di Arez Barbershop.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 min-h-[42px] py-2 bg-[#26362E] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Struk 80mm
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 min-h-[42px] py-2 bg-[#F1F1EC] border border-[#E5E5DF] text-xs font-medium text-[#20231F] rounded-[8px]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
