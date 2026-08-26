import React, { useState } from 'react';
import { Service, MasterHPP } from '../types';
import { api } from '../lib/api';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  Layers,
  Sparkles,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface ServicesViewProps {
  services: Service[];
  hppList: MasterHPP[];
  onRefreshData: () => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  hppList,
  onRefreshData,
}) => {
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form State
  const [serviceName, setServiceName] = useState('');
  const [sellingPrice, setSellingPrice] = useState<number>(35000);
  const [durationMins, setDurationMins] = useState<number>(30);
  const [description, setDescription] = useState('');
  const [selectedHPPItems, setSelectedHPPItems] = useState<
    { hpp_id: string; quantity_used: number }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open Add Service
  const handleOpenAdd = () => {
    setIsEditMode(false);
    setSelectedService(null);
    setServiceName('');
    setSellingPrice(35000);
    setDurationMins(30);
    setDescription('');
    setSelectedHPPItems([]);
    setError(null);
    setIsModalOpen(true);
  };

  // Open Edit Service
  const handleOpenEdit = (srv: Service) => {
    setIsEditMode(true);
    setSelectedService(srv);
    setServiceName(srv.service_name);
    setSellingPrice(srv.selling_price);
    setDurationMins(srv.duration_mins);
    setDescription(srv.description || '');
    const items = (srv.hpp_breakdown || []).map((b) => ({
      hpp_id: b.hpp_id,
      quantity_used: b.quantity_used,
    }));
    setSelectedHPPItems(items);
    setError(null);
    setIsModalOpen(true);
  };

  // Handle HPP Selection
  const handleToggleHPP = (hppId: string) => {
    const exists = selectedHPPItems.find((i) => i.hpp_id === hppId);
    if (exists) {
      setSelectedHPPItems(selectedHPPItems.filter((i) => i.hpp_id !== hppId));
    } else {
      setSelectedHPPItems([...selectedHPPItems, { hpp_id: hppId, quantity_used: 1 }]);
    }
  };

  const handleQtyChange = (hppId: string, qty: number) => {
    setSelectedHPPItems(
      selectedHPPItems.map((i) => (i.hpp_id === hppId ? { ...i, quantity_used: Math.max(0.1, qty) } : i))
    );
  };

  // Live calculation of current modal
  const modalHPP = selectedHPPItems.reduce((acc, item) => {
    const found = hppList.find((h) => h.id === item.hpp_id);
    return acc + (found ? found.unit_cost * item.quantity_used : 0);
  }, 0);

  const modalProfit = sellingPrice - modalHPP;
  const modalMargin = sellingPrice > 0 ? Math.round((modalProfit / sellingPrice) * 100) : 0;

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !sellingPrice || !durationMins) {
      setError('Mohon lengkapi nama layanan, harga, dan durasi.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isEditMode && selectedService) {
        await api.updateService(selectedService.id, {
          service_name: serviceName.trim(),
          selling_price: Number(sellingPrice),
          duration_mins: Number(durationMins),
          description: description.trim() || undefined,
          hpp_items: selectedHPPItems,
        });
      } else {
        await api.createService({
          service_name: serviceName.trim(),
          selling_price: Number(sellingPrice),
          duration_mins: Number(durationMins),
          description: description.trim() || undefined,
          hpp_items: selectedHPPItems,
        });
      }
      playSuccessSound();
      setIsModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan data layanan');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Service
  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus layanan "${name}"?`)) {
      try {
        await api.deleteService(id);
        onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Gagal menghapus layanan');
      }
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Katalog Barbershop
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Layanan & Tarif
          </h1>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3.5 py-2 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Layanan</span>
        </button>
      </div>

      {/* Services List */}
      <div className="space-y-3">
        {services.map((srv) => {
          const currentHPP = srv.total_hpp ?? (srv.hpp_breakdown || []).reduce(
            (acc, item) => acc + (item.unit_cost || 0) * (item.quantity_used || 0),
            0
          );
          const currentNet = srv.net_profit ?? (srv.selling_price - currentHPP);
          const currentMargin = srv.profit_percentage ?? (srv.selling_price > 0 ? Math.round((currentNet / srv.selling_price) * 100) : 0);

          return (
            <div
              key={srv.id}
              className="bg-[#FFFFFF] border border-[#E5E5DF] p-4 sm:p-5 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[#20231F] truncate">
                      {srv.service_name}
                    </h3>
                    <span className="text-[10px] text-[#686D66] bg-[#F1F1EC] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3 text-[#92968F]" />
                      {srv.duration_mins} mnt
                    </span>
                  </div>
                  {srv.description && (
                    <p className="text-xs text-[#686D66] mt-1 leading-relaxed line-clamp-2">
                      {srv.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(srv)}
                    className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC]"
                    title="Edit Layanan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(srv.id, srv.service_name)}
                    className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#A84B45] bg-[#F1F1EC]"
                    title="Hapus Layanan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-[#F7F6F2] rounded-[8px] text-xs">
                <div>
                  <span className="text-[10px] text-[#686D66]">Harga Jual</span>
                  <p className="text-sm font-bold text-[#20231F] mt-0.5">
                    Rp {srv.selling_price.toLocaleString('id-ID')}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-[#686D66]">HPP Bahan</span>
                  <p className="text-sm font-semibold text-[#686D66] mt-0.5">
                    Rp {currentHPP.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#4F7A5A] font-semibold">Laba Bersih ({currentMargin}%)</span>
                  <p className="text-sm font-bold text-[#4F7A5A] mt-0.5">
                    Rp {currentNet.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              {/* HPP Breakdown Tags */}
              {srv.hpp_breakdown && srv.hpp_breakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-[#686D66]">Komposisi Resep:</span>
                  {srv.hpp_breakdown.map((item) => (
                    <span
                      key={item.hpp_id}
                      className="text-[10px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#20231F] px-2 py-0.5 rounded-[6px]"
                    >
                      {item.item_name} ({item.quantity_used} {item.unit_type})
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* BOTTOM SHEET: ADD / EDIT SERVICE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
                  {isEditMode ? 'Edit Layanan' : 'Layanan Baru'}
                </span>
                <h3 className="font-display text-xl text-[#20231F]">
                  {isEditMode ? 'Perbarui Layanan' : 'Tambah Layanan Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 text-[#A84B45] rounded-[8px] text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Layanan
                </label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Contoh: Premium Haircut & Wash"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Harga Jual (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1000"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Estimasi Durasi (Menit)
                  </label>
                  <input
                    type="number"
                    required
                    min="5"
                    step="5"
                    value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value) || 30)}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Deskripsi / Termasuk Layanan
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Termasuk cuci rambut, pijat relaksasi ringan, dan styling pomade..."
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E] resize-none"
                />
              </div>

              {/* Recipe Assignment Section */}
              <div className="space-y-2 pt-2 border-t border-[#E5E5DF]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#20231F]">
                    Komposisi HPP Bahan ({selectedHPPItems.length} Terpilih)
                  </label>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 no-scrollbar border border-[#E5E5DF] rounded-[8px] p-2 bg-[#F7F6F2]">
                  {hppList.length === 0 ? (
                    <p className="text-xs text-[#686D66] text-center py-2">
                      Belum ada master bahan HPP yang terdaftar.
                    </p>
                  ) : (
                    hppList.map((h) => {
                      const isChecked = !!selectedHPPItems.find((i) => i.hpp_id === h.id);
                      const currentQty =
                        selectedHPPItems.find((i) => i.hpp_id === h.id)?.quantity_used || 1;

                      return (
                        <div
                          key={h.id}
                          className={`p-2 bg-[#FFFFFF] border rounded-[6px] flex items-center justify-between text-xs transition-all ${
                            isChecked ? 'border-[#26362E]' : 'border-[#E5E5DF]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleHPP(h.id)}
                              className="w-3.5 h-3.5 rounded text-[#26362E] focus:ring-[#26362E]"
                            />
                            <span className="truncate text-[#20231F] font-medium">{h.item_name}</span>
                          </div>

                          {isChecked && (
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={currentQty}
                                onChange={(e) => handleQtyChange(h.id, Number(e.target.value))}
                                className="w-12 px-1.5 py-0.5 border border-[#E5E5DF] rounded text-center text-xs"
                              />
                              <span className="text-[10px] text-[#686D66]">{h.unit_type}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Profitability Calculation Preview */}
              <div className="p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#686D66]">Harga Jual:</span>
                  <span className="font-semibold text-[#20231F]">
                    Rp {sellingPrice.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#686D66]">Total Estimasi HPP:</span>
                  <span className="font-semibold text-[#20231F]">
                    Rp {modalHPP.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#E5E5DF] text-[#4F7A5A] font-bold">
                  <span>Keuntungan Bersih:</span>
                  <span>
                    Rp {modalProfit.toLocaleString('id-ID')} ({modalMargin}%)
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {submitting ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Buat Layanan Baru'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
