import React, { useState } from 'react';
import { api } from '../lib/api';
import { User } from '../types';
import {
  X,
  Lock,
  User as UserIcon,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { playSuccessSound } from '../lib/audio';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'owner' | 'customer'>('owner');

  // Owner Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Customer Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setOwnerError('Username dan kata sandi wajib diisi.');
      return;
    }
    setOwnerLoading(true);
    setOwnerError(null);
    try {
      const res = await api.loginOwner(username.trim(), password);
      playSuccessSound();
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setOwnerError(err.message || 'Login gagal. Periksa kembali username dan kata sandi Anda.');
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerEmail.trim()) {
      setCustomerError('Nama dan email wajib diisi.');
      return;
    }
    setCustomerLoading(true);
    setCustomerError(null);
    try {
      const res = await api.loginGoogleSSO({
        google_id: `g-${Date.now()}`,
        full_name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim() || undefined,
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerName.trim())}`,
      });
      playSuccessSound();
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setCustomerError(err.message || 'Gagal masuk akun pelanggan.');
    } finally {
      setCustomerLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#20231F]/50 backdrop-blur-xs">
      <div
        id="auth-modal"
        className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E5DF] rounded-t-[20px] sm:rounded-[16px] p-5 sm:p-6 relative shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Drag Handle on Mobile */}
        <div className="w-10 h-1 bg-[#E5E5DF] rounded-full mx-auto sm:hidden -mt-1 mb-2" />

        {/* Close button */}
        <button
          id="btn-close-auth-modal"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#686D66] hover:text-[#20231F] rounded-[8px] hover:bg-[#F1F1EC] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-left">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#686D66] uppercase">
            Akses Masuk Sistem
          </span>
          <h2 className="font-display text-2xl text-[#20231F] font-normal leading-tight mt-0.5">
            Arez Barbershop
          </h2>
          <p className="text-xs text-[#686D66] mt-1">
            Pilih jenis akun untuk masuk ke dashboard operasional atau mengambil antrean pangkas.
          </p>
        </div>

        {/* Segment Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F1EC] rounded-[8px] border border-[#E5E5DF]">
          <button
            id="tab-auth-owner"
            type="button"
            onClick={() => setActiveTab('owner')}
            className={`flex-1 py-2 text-xs font-medium rounded-[6px] transition-all ${
              activeTab === 'owner'
                ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
                : 'text-[#686D66] hover:text-[#20231F]'
            }`}
          >
            Owner / Staf Barber
          </button>
          <button
            id="tab-auth-customer"
            type="button"
            onClick={() => setActiveTab('customer')}
            className={`flex-1 py-2 text-xs font-medium rounded-[6px] transition-all ${
              activeTab === 'customer'
                ? 'bg-[#FFFFFF] text-[#20231F] font-semibold shadow-xs'
                : 'text-[#686D66] hover:text-[#20231F]'
            }`}
          >
            Pelanggan
          </button>
        </div>

        {/* TAB 1: OWNER / STAFF LOGIN */}
        {activeTab === 'owner' && (
          <form onSubmit={handleOwnerSubmit} className="space-y-3 pt-1">
            {ownerError && (
              <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 rounded-[8px] text-xs text-[#A84B45] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ownerError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1">
                Username / ID Akses
              </label>
              <input
                id="input-owner-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username atau ID akses"
                className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1">
                Kata Sandi
              </label>
              <input
                id="input-owner-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
              />
            </div>

            <button
              id="btn-submit-owner-login"
              type="submit"
              disabled={ownerLoading}
              className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
            >
              <Lock className="w-3.5 h-3.5" />
              {ownerLoading ? 'Memverifikasi...' : 'Masuk Dashboard'}
            </button>
          </form>
        )}

        {/* TAB 2: CUSTOMER LOGIN / REGISTER */}
        {activeTab === 'customer' && (
          <form onSubmit={handleCustomerSubmit} className="space-y-3 pt-1">
            {customerError && (
              <div className="p-3 bg-[#A84B45]/10 border border-[#A84B45]/30 rounded-[8px] text-xs text-[#A84B45] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{customerError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1">
                Nama Lengkap <span className="text-[#A84B45]">*</span>
              </label>
              <input
                id="input-customer-name"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1">
                Alamat Email <span className="text-[#A84B45]">*</span>
              </label>
              <input
                id="input-customer-email"
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#20231F] mb-1">
                Nomor WhatsApp <span className="text-[10px] text-[#686D66] font-normal">(Disarankan untuk notifikasi)</span>
              </label>
              <input
                id="input-customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[8px] text-xs text-[#20231F] focus:outline-none focus:border-[#26362E]"
              />
            </div>

            <button
              id="btn-submit-customer-login"
              type="submit"
              disabled={customerLoading}
              className="w-full min-h-[46px] py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[8px] flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-xs mt-2"
            >
              <ArrowRight className="w-4 h-4" />
              {customerLoading ? 'Memproses...' : 'Lanjutkan Sebagai Pelanggan'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
