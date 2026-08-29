import React, { useState, useMemo } from 'react';
import { Service, MasterHPP } from '../types';
import { api } from '../lib/api';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Clock,
  RefreshCw,
  Search,
  MoreVertical,
  AlertCircle,
  PackageCheck,
  Boxes,
  Power,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';
import { ConfirmModal, ConfirmDialogState } from './ConfirmModal';
import { useToast } from './Toast';

interface ServicesViewProps {
  services: Service[];
  hppList: MasterHPP[];
  onRefreshData: () => void;
}

const CATEGORY_PRESETS = [
  'Semua',
  'Bahan Baku & Steril',
  'Styling & Perawatan',
  'Operasional & Utilitas',
];

const UNIT_PRESETS = ['pcs', 'ml', 'gram', '10g', 'porsi', 'sesi', 'botol', 'lembar'];

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  hppList,
  onRefreshData,
}) => {
  const { showToast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Main Navigation Tab: 'SERVICES' (Katalog Layanan) or 'HPP' (Komponen Biaya HPP)
  const [activeSegment, setActiveSegment] = useState<'SERVICES' | 'HPP'>('SERVICES');

  // -------------------------------------------------------------
  // 1. Services State
  // -------------------------------------------------------------
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isServiceEditMode, setIsServiceEditMode] = useState(false);

  // Service Form State
  const [serviceName, setServiceName] = useState('');
  const [sellingPrice, setSellingPrice] = useState<number | ''>(50000);
  const [durationMins, setDurationMins] = useState<number | ''>(18);
  const [description, setDescription] = useState('');
  const [selectedHPPItems, setSelectedHPPItems] = useState<
    { hpp_id: string; quantity_used: number }[]
  >([]);
  const [submittingService, setSubmittingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 2. Master HPP State
  // -------------------------------------------------------------
  const [hppSearch, setHppSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [showHPPModal, setShowHPPModal] = useState(false);
  const [editingHPP, setEditingHPP] = useState<MasterHPP | null>(null);

  // HPP Form State
  const [hppItemName, setHppItemName] = useState('');
  const [hppUnitCost, setHppUnitCost] = useState<number | ''>(1500);
  const [hppUnitType, setHppUnitType] = useState('pcs');
  const [hppCategory, setHppCategory] = useState('Bahan Baku & Steril');
  const [hppIsActive, setHppIsActive] = useState<boolean>(true);
  const [hppDescription, setHppDescription] = useState('');
  const [savingHPP, setSavingHPP] = useState(false);
  const [hppFormError, setHppFormError] = useState<string | null>(null);

  // Action Menu Dropdown / Deletion Modal State
  const [activeMenuHPPId, setActiveMenuHPPId] = useState<string | null>(null);
  const [deleteConfirmationHPP, setDeleteConfirmationHPP] = useState<{
    item: MasterHPP;
    warning?: string;
    usedInServices?: number;
    serviceNames?: string[];
  } | null>(null);
  const [deletingHPP, setDeletingHPP] = useState(false);

  // -------------------------------------------------------------
  // Filtered Lists
  // -------------------------------------------------------------
  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase();
    return services.filter(
      (s) =>
        s.service_name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [services, serviceSearch]);

  const filteredHPPList = useMemo(() => {
    return hppList.filter((item) => {
      const matchesCategory =
        selectedCategory === 'Semua' || (item.category || 'Bahan Baku & Steril') === selectedCategory;
      const matchesSearch =
        !hppSearch.trim() ||
        item.item_name.toLowerCase().includes(hppSearch.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(hppSearch.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [hppList, selectedCategory, hppSearch]);

  // HPP Stats
  const hppStats = useMemo(() => {
    const total = hppList.length;
    const active = hppList.filter((h) => h.is_active !== false).length;
    const avgCost = total > 0 ? Math.round(hppList.reduce((acc, h) => acc + h.unit_cost, 0) / total) : 0;
    return { total, active, avgCost };
  }, [hppList]);

  // -------------------------------------------------------------
  // Service Handlers
  // -------------------------------------------------------------
  const handleOpenAddService = () => {
    setIsServiceEditMode(false);
    setSelectedService(null);
    setServiceName('');
    setSellingPrice(50000);
    setDurationMins(18);
    setDescription('');
    setSelectedHPPItems([]);
    setServiceError(null);
    setIsServiceModalOpen(true);
  };

  const handleOpenEditService = (srv: Service) => {
    setIsServiceEditMode(true);
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
    setServiceError(null);
    setIsServiceModalOpen(true);
  };

  const handleToggleHPPInService = (hppId: string) => {
    const exists = selectedHPPItems.find((i) => i.hpp_id === hppId);
    if (exists) {
      setSelectedHPPItems(selectedHPPItems.filter((i) => i.hpp_id !== hppId));
    } else {
      setSelectedHPPItems([...selectedHPPItems, { hpp_id: hppId, quantity_used: 1 }]);
    }
  };

  const handleQtyChangeInService = (hppId: string, qty: number) => {
    setSelectedHPPItems(
      selectedHPPItems.map((i) =>
        i.hpp_id === hppId ? { ...i, quantity_used: Math.max(0.1, qty) } : i
      )
    );
  };

  const modalServiceHPP = selectedHPPItems.reduce((acc, item) => {
    const found = hppList.find((h) => h.id === item.hpp_id);
    return acc + (found ? found.unit_cost * item.quantity_used : 0);
  }, 0);

  const modalServiceProfit = sellingPrice - modalServiceHPP;
  const modalServiceMargin =
    sellingPrice > 0 ? Math.round((modalServiceProfit / sellingPrice) * 100) : 0;

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !sellingPrice || !durationMins) {
      setServiceError('Mohon lengkapi nama layanan, harga jual, dan durasi.');
      return;
    }

    setSubmittingService(true);
    setServiceError(null);

    try {
      if (isServiceEditMode && selectedService) {
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
      setIsServiceModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      setServiceError(err.message || 'Gagal menyimpan data layanan');
    } finally {
      setSubmittingService(false);
    }
  };

  const handleDeleteService = (id: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Layanan',
      message: `Apakah Anda yakin ingin menghapus layanan "${name}"? Tindakan ini akan menghapus layanan dari katalog dan kasir.`,
      confirmText: 'Hapus Layanan',
      cancelText: 'Batal',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteService(id);
          playSuccessSound();
          showToast(`Layanan "${name}" berhasil dihapus`, 'success');
          onRefreshData();
        } catch (err: any) {
          showToast(err.message || 'Gagal menghapus layanan', 'error');
        }
      },
    });
  };

  // -------------------------------------------------------------
  // Master HPP Handlers
  // -------------------------------------------------------------
  const handleOpenAddHPP = () => {
    setEditingHPP(null);
    setHppItemName('');
    setHppUnitCost(1500);
    setHppUnitType('pcs');
    setHppCategory('Bahan Baku & Steril');
    setHppIsActive(true);
    setHppDescription('');
    setHppFormError(null);
    setShowHPPModal(true);
  };

  const handleOpenEditHPP = (item: MasterHPP) => {
    setActiveMenuHPPId(null);
    setEditingHPP(item);
    setHppItemName(item.item_name);
    setHppUnitCost(item.unit_cost);
    setHppUnitType(item.unit_type || 'pcs');
    setHppCategory(item.category || 'Bahan Baku & Steril');
    setHppIsActive(item.is_active !== false);
    setHppDescription(item.description || '');
    setHppFormError(null);
    setShowHPPModal(true);
  };

  const handleToggleHPPStatus = async (item: MasterHPP) => {
    setActiveMenuHPPId(null);
    const newStatus = !(item.is_active !== false);
    try {
      await api.toggleHPPStatus(item.id, newStatus);
      playSuccessSound();
      showToast(`Status komponen "${item.item_name}" berhasil diubah`, 'success');
      onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status HPP', 'error');
    }
  };

  const handleSaveHPP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hppItemName.trim() || hppUnitCost === undefined) {
      setHppFormError('Mohon isi nama komponen dan biaya satuan.');
      return;
    }

    setSavingHPP(true);
    setHppFormError(null);

    try {
      if (editingHPP) {
        await api.updateHPP(editingHPP.id, {
          item_name: hppItemName.trim(),
          unit_cost: Number(hppUnitCost),
          unit_type: hppUnitType.trim() || 'pcs',
          category: hppCategory.trim() || 'Bahan Baku & Steril',
          is_active: hppIsActive,
          description: hppDescription.trim() || undefined,
        });
      } else {
        await api.createHPP({
          item_name: hppItemName.trim(),
          unit_cost: Number(hppUnitCost),
          unit_type: hppUnitType.trim() || 'pcs',
          category: hppCategory.trim() || 'Bahan Baku & Steril',
          is_active: hppIsActive,
          description: hppDescription.trim() || undefined,
        });
      }
      playSuccessSound();
      setShowHPPModal(false);
      showToast(editingHPP ? 'Komponen HPP diperbarui' : 'Komponen HPP berhasil dibuat', 'success');
      onRefreshData();
    } catch (err: any) {
      setHppFormError(err.message || 'Gagal menyimpan komponen HPP');
    } finally {
      setSavingHPP(false);
    }
  };

  const handlePromptDeleteHPP = (item: MasterHPP) => {
    setActiveMenuHPPId(null);
    const usedCount = item.used_in_services_count || 0;
    setDeleteConfirmationHPP({
      item,
      usedInServices: usedCount,
    });
  };

  const handleConfirmDeleteHPP = async (force = false) => {
    if (!deleteConfirmationHPP) return;
    setDeletingHPP(true);
    try {
      const res = await api.deleteHPP(deleteConfirmationHPP.item.id, force);
      if (res.requires_confirmation && !force) {
        setDeleteConfirmationHPP({
          ...deleteConfirmationHPP,
          warning: res.error,
          usedInServices: res.used_in_services_count,
          serviceNames: res.service_names,
        });
        setDeletingHPP(false);
        return;
      }
      playSuccessSound();
      showToast(`Komponen HPP "${deleteConfirmationHPP.item.item_name}" berhasil dihapus`, 'success');
      setDeleteConfirmationHPP(null);
      onRefreshData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus komponen HPP', 'error');
    } finally {
      setDeletingHPP(false);
    }
  };

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4 pb-24">
      {/* ------------------------------------------------------------- */}
      {/* Main Unified Header */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Manajemen Finansial
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Katalog & HPP
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {activeSegment === 'SERVICES' ? (
            <button
              id="btn-open-add-service"
              type="button"
              onClick={handleOpenAddService}
              className="px-3.5 py-2 min-h-[40px] bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Layanan</span>
            </button>
          ) : (
            <button
              id="btn-open-add-hpp"
              type="button"
              onClick={handleOpenAddHPP}
              className="px-3.5 py-2 min-h-[40px] bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tambahkan HPP</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshData}
            title="Segarkan Data"
            className="w-10 h-10 min-h-[40px] flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all shadow-xs shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Main Segment Tabs */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[10px] border border-[#E5E5DF]">
        <button
          type="button"
          onClick={() => setActiveSegment('SERVICES')}
          className={`flex-1 py-2 min-h-[40px] text-xs rounded-[8px] transition-all flex items-center justify-center gap-1.5 ${
            activeSegment === 'SERVICES'
              ? 'bg-[#FFFFFF] text-[#20231F] font-bold shadow-xs'
              : 'text-[#686D66] hover:text-[#20231F] font-medium'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Katalog Layanan ({services.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSegment('HPP')}
          className={`flex-1 py-2 min-h-[40px] text-xs rounded-[8px] transition-all flex items-center justify-center gap-1.5 ${
            activeSegment === 'HPP'
              ? 'bg-[#FFFFFF] text-[#20231F] font-bold shadow-xs'
              : 'text-[#686D66] hover:text-[#20231F] font-medium'
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5" />
          <span>Biaya Bahan HPP ({hppList.length})</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: LAYANAN (SERVICES) */}
      {/* ------------------------------------------------------------- */}
      {activeSegment === 'SERVICES' && (
        <div className="space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#92968F] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              placeholder="Cari layanan barbershop..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px] text-xs text-[#20231F] placeholder-[#92968F] focus:outline-none focus:border-[#26362E] shadow-xs"
            />
          </div>

          {filteredServices.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] p-8 text-center space-y-3">
              <Boxes className="w-10 h-10 text-[#92968F] mx-auto opacity-50" />
              <div>
                <p className="text-sm font-semibold text-[#20231F]">Belum ada layanan terdaftar</p>
                <p className="text-xs text-[#686D66] mt-0.5">
                  Tambahkan layanan barbershop beserta komposisi resep HPP bahannya.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddService}
                className="px-4 py-2 min-h-[44px] bg-[#26362E] text-[#FFFFFF] text-xs font-semibold rounded-[8px] inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Layanan Sekarang</span>
              </button>
            </div>
          ) : (
            filteredServices.map((srv) => {
              const currentHPP =
                srv.total_hpp ??
                (srv.hpp_breakdown || []).reduce(
                  (acc, item) => acc + (item.unit_cost || 0) * (item.quantity_used || 0),
                  0
                );
              const currentNet = srv.net_profit ?? (srv.selling_price - currentHPP);
              const currentMargin =
                srv.profit_percentage ??
                (srv.selling_price > 0
                  ? Math.round((currentNet / srv.selling_price) * 100)
                  : 0);

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
                        onClick={() => handleOpenEditService(srv)}
                        className="w-8 h-8 min-h-[32px] flex items-center justify-center rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC] active:scale-95 transition-all"
                        title="Edit Layanan"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteService(srv.id, srv.service_name)}
                        className="w-8 h-8 min-h-[32px] flex items-center justify-center rounded-[6px] text-[#686D66] hover:text-[#A84B45] bg-[#F1F1EC] active:scale-95 transition-all"
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
                      <span className="text-[10px] text-[#4F7A5A] font-semibold">
                        Laba ({currentMargin}%)
                      </span>
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
            })
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: MASTER BIAYA BAHAN HPP */}
      {/* ------------------------------------------------------------- */}
      {activeSegment === 'HPP' && (
        <div className="space-y-3">
          {/* Summary Stat Strip */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px] shadow-xs text-xs">
            <div>
              <span className="text-[10px] text-[#686D66]">Total Komponen</span>
              <p className="text-sm font-bold text-[#20231F] mt-0.5">{hppStats.total} Item</p>
            </div>
            <div>
              <span className="text-[10px] text-[#686D66]">Komponen Aktif</span>
              <p className="text-sm font-bold text-[#4F7A5A] mt-0.5">{hppStats.active} Aktif</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#686D66]">Rata-rata Biaya</span>
              <p className="text-sm font-bold text-[#26362E] mt-0.5">
                Rp {hppStats.avgCost.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          {/* Search and Category Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#92968F] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={hppSearch}
                onChange={(e) => setHppSearch(e.target.value)}
                placeholder="Cari komponen bahan HPP..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px] text-xs text-[#20231F] placeholder-[#92968F] focus:outline-none focus:border-[#26362E] shadow-xs"
              />
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {CATEGORY_PRESETS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-[#26362E] text-[#FFFFFF] font-semibold'
                      : 'bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* HPP Cards List */}
          {filteredHPPList.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] p-8 text-center space-y-3">
              <PackageCheck className="w-10 h-10 text-[#92968F] mx-auto opacity-50" />
              <div>
                <p className="text-sm font-semibold text-[#20231F]">Belum ada komponen HPP</p>
                <p className="text-xs text-[#686D66] mt-0.5">
                  Tambahkan biaya bahan, silet, pomade, tisu, atau operasional untuk kalkulasi margin presisi.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddHPP}
                className="px-4 py-2 min-h-[44px] bg-[#26362E] text-[#FFFFFF] text-xs font-semibold rounded-[8px] inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tambahkan HPP Sekarang</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHPPList.map((item) => {
                const isActive = item.is_active !== false;
                const isMenuOpen = activeMenuHPPId === item.id;
                const usedCount = item.used_in_services_count || 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-[#FFFFFF] border rounded-[12px] p-3.5 sm:p-4 transition-all relative ${
                      isActive ? 'border-[#E5E5DF]' : 'border-[#E5E5DF] opacity-70 bg-[#FAFAF8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-sm font-semibold text-[#20231F] truncate">
                            {item.item_name}
                          </h4>
                          <span className="text-[10px] bg-[#F1F1EC] text-[#686D66] px-2 py-0.5 rounded-[4px] font-medium">
                            {item.category || 'Bahan Baku & Steril'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              isActive
                                ? 'bg-[#E8ECE8] text-[#4F7A5A]'
                                : 'bg-[#F1F1EC] text-[#92968F]'
                            }`}
                          >
                            {isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#686D66]">
                          <span className="font-bold text-[#20231F]">
                            Rp {item.unit_cost.toLocaleString('id-ID')}
                            <span className="font-normal text-[#686D66]"> / {item.unit_type}</span>
                          </span>

                          <span className="text-[11px] text-[#92968F]">
                            • Digunakan di {usedCount} Layanan
                          </span>
                        </div>

                        {item.description && (
                          <p className="text-[11px] text-[#686D66] line-clamp-1 pt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Action Menu */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMenuHPPId(isMenuOpen ? null : item.id)
                          }
                          className="w-8 h-8 min-h-[32px] flex items-center justify-center rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC] active:scale-95 transition-all"
                          title="Menu Aksi"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-9 z-20 w-44 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px] shadow-xl py-1 text-xs">
                            <button
                              type="button"
                              onClick={() => handleOpenEditHPP(item)}
                              className="w-full px-3 py-2 text-left text-[#20231F] hover:bg-[#F7F6F2] flex items-center gap-2"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#686D66]" />
                              <span>Edit Komponen</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleHPPStatus(item)}
                              className="w-full px-3 py-2 text-left text-[#20231F] hover:bg-[#F7F6F2] flex items-center gap-2"
                            >
                              <Power className="w-3.5 h-3.5 text-[#686D66]" />
                              <span>{isActive ? 'Nonaktifkan' : 'Aktifkan'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePromptDeleteHPP(item)}
                              className="w-full px-3 py-2 text-left text-[#A84B45] hover:bg-[#A84B45]/10 flex items-center gap-2 border-t border-[#E5E5DF]"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#A84B45]" />
                              <span>Hapus Komponen</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM SHEET: TAMBAH / EDIT HPP MODAL */}
      {/* ------------------------------------------------------------- */}
      {showHPPModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            id="modal-hpp"
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
                  {editingHPP ? 'Edit Komponen HPP' : 'Komponen HPP Baru'}
                </span>
                <h3 className="font-display text-xl text-[#20231F]">
                  {editingHPP ? 'Perbarui Biaya Bahan' : 'Tambahkan Komponen HPP'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHPPModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {hppFormError && (
              <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 text-[#A84B45] rounded-[8px] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{hppFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveHPP} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Komponen HPP <span className="text-[#A84B45]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={hppItemName}
                  onChange={(e) => setHppItemName(e.target.value)}
                  placeholder="Contoh: Pisau Cukur Silet Platinum / Tisu Leher Steril"
                  className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#20231F]">
                  Kategori Bahan / Biaya
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Bahan Baku & Steril',
                    'Styling & Perawatan',
                    'Operasional & Utilitas',
                    'Lainnya',
                  ].map((cat) => {
                    const isSel = hppCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setHppCategory(cat)}
                        className={`p-2.5 text-xs rounded-[8px] border text-left font-medium transition-all flex items-center justify-between active:scale-[0.99] ${
                          isSel
                            ? 'border-[#26362E] bg-[#E8ECE8]/60 text-[#20231F] font-semibold ring-1 ring-[#26362E]'
                            : 'border-[#E5E5DF] bg-[#FFFFFF] text-[#686D66] hover:text-[#20231F]'
                        }`}
                      >
                        <span className="truncate">{cat}</span>
                        {isSel && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#26362E] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Satuan Takaran <span className="text-[#A84B45]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={hppUnitType}
                    onChange={(e) => setHppUnitType(e.target.value)}
                    placeholder="pcs / ml / gram"
                    className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                  {/* Preset Satuan */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {UNIT_PRESETS.slice(0, 4).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setHppUnitType(unit)}
                        className="text-[10px] px-1.5 py-0.5 bg-[#F1F1EC] hover:bg-[#E5E5DF] rounded text-[#686D66]"
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Biaya per Satuan (Rp) <span className="text-[#A84B45]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100"
                    value={hppUnitCost}
                    onChange={(e) => setHppUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs font-bold text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                  <p className="text-[10px] text-[#686D66] mt-1">
                    Rp {Number(hppUnitCost || 0).toLocaleString('id-ID')} / {hppUnitType || 'satuan'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Deskripsi / Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={hppDescription}
                  onChange={(e) => setHppDescription(e.target.value)}
                  placeholder="Catatan merek bahan, dosis rata-rata per sesi, dll..."
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E] resize-none"
                />
              </div>

              {/* Status Switch */}
              <div className="flex items-center justify-between p-3 bg-[#F7F6F2] rounded-[8px] border border-[#E5E5DF]">
                <div>
                  <p className="text-xs font-semibold text-[#20231F]">Status Komponen</p>
                  <p className="text-[11px] text-[#686D66]">
                    {hppIsActive
                      ? 'Komponen aktif dan dapat dipilih pada resep layanan'
                      : 'Komponen nonaktif (disembunyikan dari pilihan baru)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHppIsActive(!hppIsActive)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-all ${
                    hppIsActive ? 'bg-[#26362E] justify-end' : 'bg-[#E5E5DF] justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-[#FFFFFF] shadow-sm" />
                </button>
              </div>

              <button
                id="btn-submit-save-hpp"
                type="submit"
                disabled={savingHPP}
                className="w-full min-h-[46px] py-3 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {savingHPP ? 'Menyimpan...' : editingHPP ? 'Simpan Perubahan' : 'Tambahkan Komponen HPP'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM SHEET: KONFIRMASI HAPUS HPP */}
      {/* ------------------------------------------------------------- */}
      {deleteConfirmationHPP && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl space-y-4"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center gap-2.5 text-[#A84B45]">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="font-display text-lg text-[#20231F]">
                Hapus Komponen HPP?
              </h3>
            </div>

            <div className="space-y-2 text-xs text-[#20231F]">
              <p>
                Anda akan menghapus komponen:{' '}
                <strong className="text-[#20231F]">{deleteConfirmationHPP.item.item_name}</strong>.
              </p>

              {deleteConfirmationHPP.usedInServices && deleteConfirmationHPP.usedInServices > 0 ? (
                <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/20 rounded-[8px] text-[#A84B45] space-y-1">
                  <p className="font-semibold">Perhatian Integritas Resep:</p>
                  <p>
                    Komponen ini digunakan dalam <strong>{deleteConfirmationHPP.usedInServices} resep layanan</strong>
                    {deleteConfirmationHPP.serviceNames && deleteConfirmationHPP.serviceNames.length > 0 && (
                      <span> ({deleteConfirmationHPP.serviceNames.join(', ')})</span>
                    )}.
                  </p>
                  <p className="text-[11px] text-[#686D66] mt-1">
                    Disarankan untuk <strong>Menonaktifkan</strong> komponen agar tidak merusak resep kalkulasi historis.
                  </p>
                </div>
              ) : (
                <p className="text-[#686D66]">
                  Komponen ini belum digunakan dalam resep layanan manapun dan aman untuk dihapus.
                </p>
              )}
            </div>

            <div className="space-y-2 pt-2">
              {deleteConfirmationHPP.usedInServices && deleteConfirmationHPP.usedInServices > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleHPPStatus(deleteConfirmationHPP.item);
                    setDeleteConfirmationHPP(null);
                  }}
                  className="w-full min-h-[44px] py-2.5 bg-[#26362E] text-[#FFFFFF] text-xs font-semibold rounded-[8px] transition-all"
                >
                  Nonaktifkan Saja (Disarankan)
                </button>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmationHPP(null)}
                  className="flex-1 min-h-[44px] py-2.5 bg-[#F1F1EC] text-[#686D66] hover:text-[#20231F] text-xs font-semibold rounded-[8px]"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deletingHPP}
                  onClick={() => handleConfirmDeleteHPP(true)}
                  className="flex-1 min-h-[44px] py-2.5 bg-[#A84B45] hover:bg-[#8F3F3A] text-[#FFFFFF] text-xs font-semibold rounded-[8px] transition-all disabled:opacity-50"
                >
                  {deletingHPP ? 'Menghapus...' : 'Tetap Hapus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM SHEET: TAMBAH / EDIT SERVICE MODAL */}
      {/* ------------------------------------------------------------- */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            id="modal-service"
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
                  {isServiceEditMode ? 'Edit Layanan' : 'Layanan Baru'}
                </span>
                <h3 className="font-display text-xl text-[#20231F]">
                  {isServiceEditMode ? 'Perbarui Layanan' : 'Tambah Layanan Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsServiceModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {serviceError && (
              <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 text-[#A84B45] rounded-[8px] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{serviceError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitService} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Layanan <span className="text-[#A84B45]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Contoh: Premium Haircut & Scalp Treatment"
                  className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Harga Jual (Rp) <span className="text-[#A84B45]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Durasi (Menit) <span className="text-[#A84B45]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={durationMins}
                    onChange={(e) => setDurationMins(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Deskripsi Layanan
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Potong presisi, hair wash, scalp massage, hair tonic..."
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E] resize-none"
                />
              </div>

              {/* Dynamic Recipe Assignment Section */}
              <div className="space-y-2 pt-2 border-t border-[#E5E5DF]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#20231F]">
                    Komposisi HPP Bahan ({selectedHPPItems.length} Terpilih)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsServiceModalOpen(false);
                      setActiveSegment('HPP');
                      handleOpenAddHPP();
                    }}
                    className="text-[10px] text-[#26362E] font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Buat HPP Baru</span>
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 no-scrollbar border border-[#E5E5DF] rounded-[8px] p-2 bg-[#F7F6F2]">
                  {hppList.length === 0 ? (
                    <div className="py-4 text-center space-y-1">
                      <p className="text-xs text-[#686D66]">
                        Belum ada master bahan HPP yang terdaftar.
                      </p>
                    </div>
                  ) : (
                    hppList.map((h) => {
                      const isChecked = !!selectedHPPItems.find((i) => i.hpp_id === h.id);
                      const currentQty =
                        selectedHPPItems.find((i) => i.hpp_id === h.id)?.quantity_used || 1;

                      return (
                        <div
                          key={h.id}
                          className={`p-2.5 bg-[#FFFFFF] border rounded-[8px] flex items-center justify-between text-xs transition-all ${
                            isChecked ? 'border-[#26362E] bg-[#E8ECE8]/40' : 'border-[#E5E5DF]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleHPPInService(h.id)}
                              className="w-4 h-4 rounded text-[#26362E] focus:ring-[#26362E]"
                            />
                            <div className="min-w-0">
                              <span className="truncate text-[#20231F] font-medium block">
                                {h.item_name}
                              </span>
                              <span className="text-[10px] text-[#686D66]">
                                Rp {h.unit_cost.toLocaleString('id-ID')} / {h.unit_type}
                              </span>
                            </div>
                          </div>

                          {isChecked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={currentQty}
                                onChange={(e) =>
                                  handleQtyChangeInService(h.id, Number(e.target.value))
                                }
                                className="w-14 px-1.5 py-1 border border-[#E5E5DF] rounded text-center text-xs font-bold text-[#20231F]"
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

              {/* Profitability Preview */}
              <div className="p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#686D66]">Harga Jual:</span>
                  <span className="font-semibold text-[#20231F]">
                    Rp {sellingPrice.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#686D66]">Total Estimasi HPP Bahan:</span>
                  <span className="font-semibold text-[#20231F]">
                    Rp {modalServiceHPP.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#E5E5DF] text-[#4F7A5A] font-bold">
                  <span>Estimasi Laba Bersih:</span>
                  <span>
                    Rp {modalServiceProfit.toLocaleString('id-ID')} ({modalServiceMargin}%)
                  </span>
                </div>
              </div>

              <button
                id="btn-submit-save-service"
                type="submit"
                disabled={submittingService}
                className="w-full min-h-[46px] py-3 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {submittingService
                  ? 'Menyimpan...'
                  : isServiceEditMode
                  ? 'Simpan Perubahan Layanan'
                  : 'Buat Layanan Baru'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sleek Minimalist In-App Confirm Modal */}
      <ConfirmModal
        dialog={confirmDialog}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
