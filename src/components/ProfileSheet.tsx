import React, { useEffect, useState } from 'react';
import { User } from '../types';
import {
  X,
  Volume2,
  VolumeX,
  Download,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  Sparkles,
  Scissors,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { isSoundEnabled, toggleSound, playQueueCallSound } from '../lib/audio';

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onLogout: () => void;
  onOpenAuth: () => void;
  canInstallPWA?: boolean;
  onInstallPWA?: () => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export function getUserInitials(name?: string, role?: string): string {
  if (!name) return role === 'OWNER' ? 'AR' : 'AZ';
  const cleanName = name.replace(/\(.*?\)/g, '').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return role === 'OWNER' ? 'AR' : 'AZ';
  if (words.length === 1) {
    const single = words[0];
    return single.slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onOpenAuth,
  canInstallPWA,
  onInstallPWA,
  activeTab,
  setActiveTab,
}) => {
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleToggleSound = () => {
    const next = toggleSound();
    setSoundOn(next);
    if (next) {
      playQueueCallSound();
    }
  };

  const isOwner = currentUser?.role === 'OWNER';
  const isStaff = currentUser?.role === 'STAFF';
  const initials = getUserInitials(currentUser?.full_name, currentUser?.role);

  return (
    <>
      {/* Backdrop */}
      <div
        id="profile-sheet-backdrop"
        className="sheet-backdrop"
        data-open={isOpen}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Bottom Sheet Container */}
      <div
        id="profile-sheet"
        className="mobile-sheet border-t border-[#E5E5DF] shadow-[0_-8px_32px_rgba(32,35,31,0.12)]"
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-sheet-title"
      >
        <div className="w-full max-w-[540px] mx-auto space-y-4">
          {/* Native Drag Handle */}
          <div className="flex items-center justify-center pt-1 pb-1">
            <div className="w-10 h-1 rounded-full bg-[#D8D8D2]" />
          </div>

          {/* Sheet Header with Close Button */}
          <div className="flex items-center justify-between px-1">
            <span
              id="profile-sheet-title"
              className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#686D66]"
            >
              Akun & Preferensi
            </span>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-[#F1F1EC] text-[#686D66] hover:text-[#20231F] active:scale-95 transition-all"
              aria-label="Tutup"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {currentUser ? (
            <>
              {/* User Identity Card */}
              <div className="p-3.5 bg-[#F7F6F2] rounded-[14px] border border-[#E5E5DF] flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#26362E] text-[#FFFFFF] font-semibold text-base flex items-center justify-center shrink-0 shadow-xs border border-[#1A2620]/20 tracking-wider">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-[#20231F] truncate leading-snug">
                      {currentUser.full_name.replace(/\(.*?\)/g, '').trim()}
                    </h3>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${
                        isOwner
                          ? 'bg-[#F7F2EA] text-[#A47C45] border-[#E5E5DF]'
                          : isStaff
                          ? 'bg-[#E8ECE8] text-[#26362E] border-[#D0D8D0]'
                          : 'bg-[#EDF4EF] text-[#4F7A5A] border-[#D0DFD4]'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <p className="text-xs text-[#686D66] truncate mt-0.5">
                    {currentUser.email || currentUser.username || 'Arez Member'}
                  </p>
                </div>
              </div>

              {/* Account Quick Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px]">
                  <div className="flex items-center gap-1.5 text-[#686D66] text-[10px]">
                    <Calendar className="w-3 h-3 text-[#A47C45]" />
                    <span>Total Sesi Kunjungan</span>
                  </div>
                  <p className="font-semibold text-[#20231F] mt-1 text-sm">
                    {currentUser.total_visits || 0} Sesi
                  </p>
                </div>

                <div className="p-2.5 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[10px]">
                  <div className="flex items-center gap-1.5 text-[#686D66] text-[10px]">
                    <Sparkles className="w-3 h-3 text-[#4F7A5A]" />
                    <span>Layanan Favorit</span>
                  </div>
                  <p className="font-semibold text-[#20231F] mt-1 text-xs truncate">
                    {currentUser.favorite_service || 'Signature Cut'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Guest / Logged Out View */
            <div className="p-4 bg-[#F7F6F2] rounded-[14px] border border-[#E5E5DF] text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#E5E5DF] text-[#686D66] flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-[#686D66]" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[#20231F]">
                  Tamu Arez Barbershop
                </h3>
                <p className="text-xs text-[#686D66] mt-0.5">
                  Masuk sebagai Staf atau Pelanggan untuk akses riwayat dan fitur lengkap.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="w-full py-2.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-semibold rounded-[10px] active:scale-98 transition-all shadow-xs"
              >
                Masuk / Buat Akun
              </button>
            </div>
          )}

          {/* Preferences Section */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#686D66] px-1">
              Preferensi Aplikasi
            </span>

            {/* Sound Toggle Row */}
            <div className="p-3 bg-[#FFFFFF] border border-[#E5E5DF] rounded-[12px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-[8px] bg-[#F1F1EC] flex items-center justify-center shrink-0 text-[#20231F]">
                  {soundOn ? (
                    <Volume2 className="w-4 h-4 text-[#4F7A5A]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#92968F]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#20231F]">
                    Efek Suara Antrean
                  </p>
                  <p className="text-[11px] text-[#686D66] leading-tight">
                    Lonceng notifikasi saat nomor antrean dipanggil
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleSound}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  soundOn ? 'bg-[#26362E]' : 'bg-[#D8D8D2]'
                }`}
                role="switch"
                aria-checked={soundOn}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    soundOn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* PWA Install Option */}
            {canInstallPWA && onInstallPWA && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInstallPWA();
                }}
                className="w-full p-3 bg-[#FFFFFF] hover:bg-[#F7F6F2] border border-[#E5E5DF] rounded-[12px] flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-[8px] bg-[#E8ECE8] flex items-center justify-center shrink-0 text-[#26362E]">
                    <Download className="w-4 h-4 text-[#26362E]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#20231F]">
                      Pasang Aplikasi (PWA)
                    </p>
                    <p className="text-[11px] text-[#686D66]">
                      Tambahkan ke Layar Utama untuk akses cepat
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#26362E] bg-[#E8ECE8] px-2 py-0.5 rounded-[6px]">
                  Pasang
                </span>
              </button>
            )}
          </div>

          {/* Fast Role Navigation (for Owner/Staff convenience) */}
          {isOwner && setActiveTab && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#686D66] px-1">
                Akses Cepat Tampilan
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('pos');
                    onClose();
                  }}
                  className={`p-2.5 rounded-[10px] border text-xs font-medium flex items-center gap-2 transition-all ${
                    activeTab === 'pos'
                      ? 'bg-[#26362E] text-white border-[#26362E]'
                      : 'bg-white text-[#20231F] border-[#E5E5DF] hover:bg-[#F7F6F2]'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5 shrink-0" />
                  <span>Kasir & Sesi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('queue');
                    onClose();
                  }}
                  className={`p-2.5 rounded-[10px] border text-xs font-medium flex items-center gap-2 transition-all ${
                    activeTab === 'queue'
                      ? 'bg-[#26362E] text-white border-[#26362E]'
                      : 'bg-white text-[#20231F] border-[#E5E5DF] hover:bg-[#F7F6F2]'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Mode Pelanggan</span>
                </button>
              </div>
            </div>
          )}

          {/* Logout Action */}
          {currentUser && (
            <div className="pt-2 border-t border-[#E5E5DF]">
              <button
                id="btn-profile-sheet-logout"
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="w-full py-2.5 px-3 bg-[#FFF5F5] hover:bg-[#FDE8E8] border border-[#F5C6C6] text-[#A84B45] text-xs font-semibold rounded-[10px] flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          )}

          {/* Version / Info Footer */}
          <div className="text-center pt-1 pb-1">
            <p className="text-[10px] text-[#92968F]">
              Arez Barbershop v1.2 • Presisi 18 Menit
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
