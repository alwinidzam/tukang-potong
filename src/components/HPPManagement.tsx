import React, { useState } from 'react';
import { MasterHPP, Service } from '../types';
import { api } from '../lib/api';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  RefreshCw,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface HPPManagementProps {
  hppList: MasterHPP[];
  services: Service[];
  onRefreshData: () => void;
}

export const HPPManagement: React.FC<HPPManagementProps> = ({
  hppList,
  services,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'MASTER'>('SERVICES');

  // Master HPP CRUD state
  const [showAddHPPModal, setShowAddHPPModal] = useState(false);
  const [editingHPP, setEditingHPP] = useState<MasterHPP | null>(null);
  const [itemType, setItemType] = useState('Bahan Baku & Steril');
  const [itemName, setItemName] = useState('');
  const [unitCost, setUnitCost] = useState<number | ''>(1500);
  const [unitType, setUnitType] = useState('pcs');
  const [description, setDescription] = useState('');
  const [savingHPP, setSavingHPP] = useState(false);

  // Service Recipe Assignment Modal
  const [selectedServiceForRecipe, setSelectedServiceForRecipe] = useState<Service | null>(null);
  const [recipeItems, setRecipeItems] = useState<{ hpp_id: string; quantity_used: number }[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Master HPP Handlers
  const handleOpenAddHPP = () => {
    setEditingHPP(null);
    setItemName('');
    setUnitCost(1500);
    setUnitType('pcs');
    setShowAddHPPModal(true);
  };

  const handleOpenEditHPP = (item: MasterHPP) => {
    setEditingHPP(item);
    setItemName(item.item_name);
    setUnitCost(item.unit_cost);
    setUnitType(item.unit_type);
    setShowAddHPPModal(true);
  };

  const handleSaveHPP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || unitCost === undefined) return;

    setSavingHPP(true);
    try {
      if (editingHPP) {
        await api.updateHPP(editingHPP.id, {
          item_name: itemName.trim(),
          unit_cost: Number(unitCost),
          unit_type: unitType.trim(),
        });
      } else {
        await api.createHPP({
          item_name: itemName.trim(),
          unit_cost: Number(unitCost),
          unit_type: unitType.trim(),
        });
      }
      playSuccessSound();
      setShowAddHPPModal(false);
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan komponen HPP');
    } finally {
      setSavingHPP(false);
    }
  };

  const handleDeleteHPP = async (id: string, name: string) => {
    if (confirm(`Hapus komponen biaya "${name}"?`)) {
      try {
        await api.deleteHPP(id);
        onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Gagal menghapus HPP');
      }
    }
  };

  // Recipe Modal Handlers
  const handleOpenRecipeModal = (service: Service) => {
    setSelectedServiceForRecipe(service);
    const existing = (service.hpp_breakdown || []).map((b) => ({
      hpp_id: b.hpp_id,
      quantity_used: b.quantity_used,
    }));
    setRecipeItems(existing);
  };

  const handleToggleRecipeItem = (hppId: string) => {
    const exists = recipeItems.find((r) => r.hpp_id === hppId);
    if (exists) {
      setRecipeItems(recipeItems.filter((r) => r.hpp_id !== hppId));
    } else {
      setRecipeItems([...recipeItems, { hpp_id: hppId, quantity_used: 1 }]);
    }
  };

  const handleQuantityChange = (hppId: string, qty: number) => {
    setRecipeItems(
      recipeItems.map((r) => (r.hpp_id === hppId ? { ...r, quantity_used: Math.max(0.1, qty) } : r))
    );
  };

  const handleSaveRecipe = async () => {
    if (!selectedServiceForRecipe) return;

    setSavingRecipe(true);
    try {
      await api.updateService(selectedServiceForRecipe.id, {
        hpp_items: recipeItems,
      });
      playSuccessSound();
      setSelectedServiceForRecipe(null);
      onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan komposisi HPP layanan');
    } finally {
      setSavingRecipe(false);
    }
  };

  // Live calculation of current recipe modal
  const calculatedModalHPP = recipeItems.reduce((acc, r) => {
    const found = hppList.find((h) => h.id === r.hpp_id);
    return acc + (found ? found.unit_cost * r.quantity_used : 0);
  }, 0);

  const modalServicePrice = selectedServiceForRecipe?.selling_price || 0;
  const modalProfit = modalServicePrice - calculatedModalHPP;
  const modalMargin = modalServicePrice > 0 ? Math.round((modalProfit / modalServicePrice) * 100) : 0;

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Kalkulasi Finansial
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Manajemen HPP
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab === 'MASTER' && (
            <button
              type="button"
              onClick={handleOpenAddHPP}
              className="px-3 py-1.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Bahan</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshData}
            title="Refresh Data"
            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Segment Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[8px] border border-[#E5E5DF]">
        <button
          type="button"
          onClick={() => setActiveTab('SERVICES')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all ${
            activeTab === 'SERVICES'
              ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
              : 'text-[#686D66] hover:text-[#20231F]'
          }`}
        >
          Resep per Layanan ({services.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('MASTER')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-all ${
            activeTab === 'MASTER'
              ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
              : 'text-[#686D66] hover:text-[#20231F]'
          }`}
        >
          Master Bahan HPP ({hppList.length})
        </button>
      </div>

      {/* TAB 1: SERVICE HPP RECIPES */}
      {activeTab === 'SERVICES' && (
        <div className="space-y-2.5">
          {services.map((srv) => {
            const currentHPP = srv.total_hpp ?? (srv.hpp_breakdown || []).reduce(
              (acc, item) => acc + (item.unit_cost || 0) * (item.quantity_used || 0),
              0
            );
            const netProfit = srv.net_profit ?? (srv.selling_price - currentHPP);
            const marginPct = srv.profit_percentage ?? (srv.selling_price > 0 ? Math.round((netProfit / srv.selling_price) * 100) : 0);

            return (
              <div
                key={srv.id}
                className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#20231F]">{srv.service_name}</h3>
                    <p className="text-xs text-[#686D66]">
                      Harga Jual: Rp {srv.selling_price.toLocaleString('id-ID')} ({srv.duration_mins} Menit)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenRecipeModal(srv)}
                    className="px-3 py-1.5 bg-[#E8ECE8] hover:bg-[#26362E] hover:text-[#FFFFFF] text-[#26362E] text-xs font-semibold rounded-[8px] transition-all"
                  >
                    Atur Resep
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 p-2.5 bg-[#F7F6F2] rounded-[8px] text-xs">
                  <div>
                    <span className="text-[10px] text-[#686D66]">Biaya HPP:</span>
                    <p className="font-semibold text-[#20231F]">Rp {currentHPP.toLocaleString('id-ID')}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#686D66]">Laba Bersih:</span>
                    <p className="font-semibold text-[#4F7A5A]">Rp {netProfit.toLocaleString('id-ID')}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#686D66]">Margin:</span>
                    <p className="font-bold text-[#26362E]">{marginPct}%</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: MASTER HPP LIST */}
      {activeTab === 'MASTER' && (
        <div className="space-y-2">
          {hppList.map((item) => (
            <div
              key={item.id}
              className="bg-[#FFFFFF] border border-[#E5E5DF] p-3 rounded-[10px] flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-semibold text-[#20231F] truncate">{item.item_name}</h4>
                </div>
                <p className="text-[11px] text-[#686D66] mt-0.5">
                  Rp {item.unit_cost.toLocaleString('id-ID')} per {item.unit_type}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenEditHPP(item)}
                  className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteHPP(item.id, item.item_name)}
                  className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#A84B45] bg-[#F1F1EC]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM SHEET 1: ADD / EDIT MASTER HPP MODAL */}
      {showAddHPPModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-[#20231F]">
                {editingHPP ? 'Edit Komponen HPP' : 'Tambah Komponen HPP'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddHPPModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHPP} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Komponen Bahan
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Contoh: Silet Platinum / Tisu Leher"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Satuan Takaran
                  </label>
                  <input
                    type="text"
                    required
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    placeholder="pcs / ml / gram"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Biaya per Satuan (Rp) <span className="text-[#A84B45]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingHPP}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {savingHPP ? 'Menyimpan...' : 'Simpan Komponen'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET 2: EDIT SERVICE RECIPE MODAL */}
      {selectedServiceForRecipe && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase text-[#686D66]">Resep HPP Layanan</span>
                <h3 className="font-display text-xl text-[#20231F]">
                  {selectedServiceForRecipe.service_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedServiceForRecipe(null)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
              {hppList.map((hpp) => {
                const isChecked = !!recipeItems.find((r) => r.hpp_id === hpp.id);
                const currentQty = recipeItems.find((r) => r.hpp_id === hpp.id)?.quantity_used || 1;

                return (
                  <div
                    key={hpp.id}
                    className={`p-3 border rounded-[8px] flex items-center justify-between gap-2 text-xs transition-all ${
                      isChecked ? 'border-[#26362E] bg-[#E8ECE8]/50' : 'border-[#E5E5DF] bg-[#FFFFFF]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleRecipeItem(hpp.id)}
                        className="w-4 h-4 rounded text-[#26362E] focus:ring-[#26362E]"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-[#20231F] truncate">{hpp.item_name}</p>
                        <p className="text-[10px] text-[#686D66]">
                          Rp {hpp.unit_cost.toLocaleString('id-ID')} / {hpp.unit_type}
                        </p>
                      </div>
                    </div>

                    {isChecked && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={currentQty}
                          onChange={(e) => handleQuantityChange(hpp.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[6px] text-xs text-center font-semibold text-[#20231F]"
                        />
                        <span className="text-[10px] text-[#686D66]">{hpp.unit_type}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live Financial Summary */}
            <div className="p-3 bg-[#F7F6F2] border border-[#E5E5DF] rounded-[10px] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#686D66]">Harga Jual:</span>
                <span className="font-semibold text-[#20231F]">Rp {modalServicePrice.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#686D66]">Total Biaya HPP:</span>
                <span className="font-semibold text-[#20231F]">Rp {calculatedModalHPP.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#E5E5DF] text-[#4F7A5A] font-bold">
                <span>Est. Laba Bersih:</span>
                <span>Rp {modalProfit.toLocaleString('id-ID')} ({modalMargin}%)</span>
              </div>
            </div>

            <button
              type="button"
              disabled={savingRecipe}
              onClick={handleSaveRecipe}
              className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs"
            >
              {savingRecipe ? 'Menyimpan...' : 'Simpan Komposisi Resep'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
