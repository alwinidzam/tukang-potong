import React, { useState, useEffect } from 'react';
import { User, StaffCreatePayload, StaffUpdatePayload } from '../types';
import { api } from '../lib/api';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  KeyRound,
  Trash2,
  Edit2,
  RefreshCw,
  Phone,
  Mail,
  ShieldCheck,
  AlertCircle,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface UserManagementProps {
  currentUser: User | null;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [staffList, setStaffList] = useState<User[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [resetPasswordStaff, setResetPasswordStaff] = useState<User | null>(null);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<User | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState<StaffCreatePayload>({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    status: 'ACTIVE',
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState<StaffUpdatePayload>({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
  });

  // Reset Password Form State
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Load Staff Data
  const fetchStaffData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStaffUsers();
      setStaffList(res.staff);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data staf.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffData();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  // Handle Create Staff
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.full_name || !createForm.username || !createForm.password) {
      setError('Nama, Username, dan Password wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await api.createStaff(createForm);
      playSuccessSound();
      showNotification(`Staf "${createForm.full_name}" berhasil didaftarkan.`);
      setIsCreateModalOpen(false);
      setCreateForm({
        full_name: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        status: 'ACTIVE',
      });
      fetchStaffData();
    } catch (err: any) {
      setError(err.message || 'Gagal mendaftarkan staf.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Staff
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    try {
      setSubmitting(true);
      setError(null);
      await api.updateStaff(editingStaff.id, editForm);
      playSuccessSound();
      showNotification(`Data staf "${editForm.full_name}" berhasil diperbarui.`);
      setEditingStaff(null);
      fetchStaffData();
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui staf.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Reset Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordStaff || !newPassword) return;

    try {
      setSubmitting(true);
      setError(null);
      await api.resetStaffPassword(resetPasswordStaff.id, newPassword);
      playSuccessSound();
      showNotification(`Password staf "${resetPasswordStaff.full_name}" berhasil direset.`);
      setResetPasswordStaff(null);
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Gagal mereset password.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Toggle Status
  const handleToggleStatus = async (staff: User) => {
    const nextStatus = staff.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.updateStaffStatus(staff.id, nextStatus);
      showNotification(`Status ${staff.full_name} diubah menjadi ${nextStatus}.`);
      fetchStaffData();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah status staf.');
    }
  };

  // Handle Delete Staff
  const handleDeleteStaff = async () => {
    if (!deleteConfirmStaff) return;
    try {
      setSubmitting(true);
      await api.deleteStaff(deleteConfirmStaff.id);
      showNotification(`Staf "${deleteConfirmStaff.full_name}" telah dinonaktifkan.`);
      setDeleteConfirmStaff(null);
      fetchStaffData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus staf.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.username && s.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.phone && s.phone.includes(searchQuery));

    const matchesStatus =
      statusFilter === 'ALL' || (s.status || 'ACTIVE') === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 py-3 sm:py-4 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#686D66]">
            Manajemen Tim & Staf
          </span>
          <h1 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Kelola Staf & Barber
          </h1>
        </div>

        <button
          type="button"
          onClick={fetchStaffData}
          title="Refresh Data"
          className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#FFFFFF] border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-3 bg-[#E8ECE8] border border-[#4F7A5A]/30 text-[#4F7A5A] rounded-[10px] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 text-[#A84B45] rounded-[10px] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold text-[#686D66]">Total Tim</span>
          <p className="text-lg font-bold text-[#20231F] mt-0.5">{summary.total}</p>
        </div>
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold text-[#4F7A5A]">Staf Aktif</span>
          <p className="text-lg font-bold text-[#4F7A5A] mt-0.5">{summary.active}</p>
        </div>
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]">
          <span className="text-[10px] uppercase font-semibold text-[#686D66]">Nonaktif</span>
          <p className="text-lg font-bold text-[#686D66] mt-0.5">{summary.inactive}</p>
        </div>
      </div>

      {/* Action & Search Bar */}
      <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#686D66]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau username..."
              className="w-full pl-9 pr-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tambah Staf</span>
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[8px] border border-[#E5E5DF]">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`flex-1 py-1 text-xs font-medium rounded-[6px] transition-all capitalize ${
                statusFilter === filter
                  ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
                  : 'text-[#686D66] hover:text-[#20231F]'
              }`}
            >
              {filter === 'ALL' ? 'Semua' : filter === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
            </button>
          ))}
        </div>
      </div>

      {/* Staff Cards List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center text-xs text-[#686D66] rounded-[12px]">
            Memuat daftar personel staf...
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E5E5DF] p-6 text-center text-xs text-[#686D66] rounded-[12px]">
            Tidak ada staf yang sesuai kriteria pencarian.
          </div>
        ) : (
          filteredStaff.map((staff) => {
            const isActive = (staff.status || 'ACTIVE') === 'ACTIVE';
            return (
              <div
                key={staff.id}
                className="bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[12px] shadow-[0_2px_8px_rgba(32,35,31,0.02)] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-[8px] bg-[#26362E] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center shrink-0">
                      {staff.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-semibold text-[#20231F] truncate">
                        {staff.full_name}
                      </h4>
                      <p className="text-[11px] text-[#686D66] truncate">@{staff.username || 'staff'}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                      isActive
                        ? 'bg-[#E8ECE8] text-[#4F7A5A] border border-[#4F7A5A]/30'
                        : 'bg-[#F1F1EC] text-[#686D66] border border-[#E5E5DF]'
                    }`}
                  >
                    {isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#686D66] pt-2 border-t border-[#E5E5DF]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3 h-3 text-[#92968F] shrink-0" />
                    <span className="truncate">{staff.phone || 'Tanpa No. HP'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 text-[#92968F] shrink-0" />
                    <span className="truncate">{staff.email || 'Tanpa Email'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[#E5E5DF]">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(staff)}
                    className={`text-xs font-medium ${
                      isActive ? 'text-[#A84B45] hover:underline' : 'text-[#4F7A5A] hover:underline'
                    }`}
                  >
                    {isActive ? 'Nonaktifkan' : 'Aktifkan Kembali'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordStaff(staff);
                        setNewPassword('');
                      }}
                      title="Reset Password"
                      className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC]"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStaff(staff);
                        setEditForm({
                          full_name: staff.full_name,
                          username: staff.username || '',
                          email: staff.email || '',
                          phone: staff.phone || '',
                          status: staff.status || 'ACTIVE',
                        });
                      }}
                      title="Edit Staf"
                      className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#20231F] bg-[#F1F1EC]"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmStaff(staff)}
                      title="Hapus Staf"
                      className="p-1.5 rounded-[6px] text-[#686D66] hover:text-[#A84B45] bg-[#F1F1EC]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* BOTTOM SHEET 1: CREATE STAFF */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-[#20231F]">Tambah Staf Barber</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Lengkap Staf
                </label>
                <input
                  type="text"
                  required
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Misal: Andi Barber"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Username Login
                </label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="andi_barber"
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Password Staf
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 pr-10 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686D66]"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    No. WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Email (Opsional)
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="andi@barber.com"
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {submitting ? 'Mendaftarkan...' : 'Daftarkan Staf'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET 2: EDIT STAFF */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-[#20231F]">Edit Data Staf</h3>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    No. WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#20231F] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {submitting ? 'Menyimpan...' : 'Perbarui Data Staf'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET 3: RESET PASSWORD */}
      {resetPasswordStaff && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
          <div
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar space-y-4"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase text-[#686D66]">Kredensial</span>
                <h3 className="font-display text-xl text-[#20231F]">
                  Reset Kata Sandi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordStaff(null)}
                className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-[#F1F1EC] text-[#686D66]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#686D66]">
              Masukkan kata sandi baru untuk staf <strong>{resetPasswordStaff.full_name}</strong> (@{resetPasswordStaff.username}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#20231F] mb-1">
                  Kata Sandi Baru
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 pr-10 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686D66]"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
              >
                {submitting ? 'Mereset...' : 'Simpan Kata Sandi Baru'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deleteConfirmStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#20231F]/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[#FFFFFF] border border-[#E5E5DF] rounded-[16px] p-5 relative shadow-2xl space-y-3">
            <h3 className="font-display text-lg text-[#20231F]">Hapus Staf</h3>
            <p className="text-xs text-[#686D66] leading-relaxed">
              Apakah Anda yakin ingin menonaktifkan akun staf <strong>{deleteConfirmStaff.full_name}</strong>?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleDeleteStaff}
                disabled={submitting}
                className="flex-1 py-2 bg-[#A84B45] text-[#FFFFFF] text-xs font-semibold rounded-[8px] active:scale-95 transition-all"
              >
                {submitting ? 'Memproses...' : 'Ya, Nonaktifkan'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmStaff(null)}
                className="px-4 py-2 bg-[#F1F1EC] text-xs font-medium text-[#20231F] rounded-[8px]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
