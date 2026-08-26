import React from 'react';
import { User } from '../types';
import { Scissors } from 'lucide-react';
import { getUserInitials } from './ProfileSheet';

interface HeaderProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  setActiveTab,
  onOpenAuth,
  onOpenProfile,
}) => {
  const isOwner = currentUser?.role === 'OWNER';
  const isStaff = currentUser?.role === 'STAFF';

  const initials = currentUser
    ? getUserInitials(currentUser.full_name, currentUser.role)
    : 'AZ';

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-30 w-full bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E5DF] transition-colors"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[680px] mx-auto px-4 h-[52px] flex items-center justify-between gap-3">
        {/* Brand Wordmark (Compact & Focused) */}
        <button
          type="button"
          onClick={() => setActiveTab(isOwner || isStaff ? 'pos' : 'queue')}
          className="flex items-center gap-2 cursor-pointer select-none text-left focus:outline-none group"
          title="Arez Barbershop"
        >
          <div className="w-7 h-7 rounded-[7px] bg-[#26362E] text-[#FFFFFF] flex items-center justify-center shrink-0 group-active:scale-95 transition-transform shadow-2xs">
            <Scissors className="w-3.5 h-3.5 text-[#FFFFFF]" />
          </div>
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="font-display font-medium text-lg tracking-tight text-[#20231F]">
              Arez
            </span>
            <span className="text-[10px] font-semibold tracking-[0.18em] text-[#686D66] uppercase">
              Barbershop
            </span>
          </div>
        </button>

        {/* Right Identity / Profile Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          {currentUser ? (
            <button
              id="btn-header-profile-trigger"
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 p-1 pl-1.5 pr-1 rounded-full bg-[#F7F6F2] hover:bg-[#EFEFEA] border border-[#E5E5DF] active:scale-95 transition-all select-none group"
              aria-label="Buka Profil & Pengaturan"
              title={`${currentUser.full_name} (${currentUser.role})`}
            >
              <div className="w-7 h-7 rounded-full bg-[#26362E] text-[#FFFFFF] text-[11px] font-semibold flex items-center justify-center tracking-wider shadow-2xs">
                {initials}
              </div>
            </button>
          ) : (
            <button
              id="btn-header-login-trigger"
              type="button"
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 bg-[#26362E] hover:bg-[#1A2620] text-[#FFFFFF] text-xs font-medium rounded-[8px] active:scale-95 transition-all shadow-xs"
            >
              Masuk
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
