import React from 'react';
import { User } from '../types';
import {
  Scissors,
  CreditCard,
  Users,
  Sparkles,
  BarChart3,
  ListOrdered,
  History,
  Bell,
  ShieldCheck,
} from 'lucide-react';

interface BottomNavProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadNotifsCount?: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  unreadNotifsCount = 0,
}) => {
  const isOwner = currentUser?.role === 'OWNER';
  const isStaff = currentUser?.role === 'STAFF';

  // 5 distinct, uncrowded tabs for Owner
  const ownerNavItems: NavItem[] = [
    { id: 'pos', label: 'Kasir & Sesi', icon: CreditCard },
    { id: 'analytics', label: 'Laporan', icon: BarChart3 },
    { id: 'services', label: 'Katalog & HPP', icon: Sparkles },
    { id: 'staff', label: 'Tim Staf', icon: ShieldCheck },
    { id: 'crm', label: 'Tamu CRM', icon: Users },
  ];

  // 2 ultra-focused operational tabs for Staff
  const staffNavItems: NavItem[] = [
    { id: 'pos', label: 'Kasir & Sesi', icon: Scissors },
    { id: 'queue', label: 'Antrean Tamu', icon: ListOrdered },
  ];

  // 4 welcoming tabs for Customer
  const customerNavItems: NavItem[] = [
    { id: 'queue', label: 'Antrean', icon: Scissors },
    { id: 'services_view', label: 'Layanan', icon: Sparkles },
    { id: 'history', label: 'Riwayat', icon: History },
    { id: 'notifications', label: 'Notifikasi', icon: Bell, badge: unreadNotifsCount },
  ];

  const items: NavItem[] = isOwner ? ownerNavItems : isStaff ? staffNavItems : customerNavItems;

  return (
    <nav
      id="mobile-bottom-nav"
      aria-label="Navigasi Utama"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-t border-[#E5E5DF] shadow-[0_-2px_12px_rgba(32,35,31,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-[680px] mx-auto flex items-center justify-around h-[58px] px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id ||
            (isOwner && item.id === 'services' && activeTab === 'hpp');

          return (
            <button
              key={item.id}
              id={`bottom-nav-${item.id}`}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 min-h-[46px] rounded-[8px] transition-all duration-150 relative select-none ${
                isActive
                  ? 'text-[#26362E]'
                  : 'text-[#686D66] hover:text-[#20231F] active:scale-95'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'stroke-[2.25] scale-105 text-[#26362E]' : 'stroke-[1.75]'
                  }`}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] bg-[#A84B45] text-[#FFFFFF] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none shadow-2xs">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[10px] mt-1 tracking-tight leading-none truncate max-w-[68px] text-center whitespace-nowrap ${
                  isActive
                    ? 'font-semibold text-[#26362E]'
                    : 'font-normal text-[#686D66]'
                }`}
              >
                {item.label}
              </span>

              {/* Quiet Luxury Active Dot */}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-[#A47C45] mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
