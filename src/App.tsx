/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, QueueItem, Service, MasterHPP, Transaction, AnalyticsRecapResponse, DailyRecap } from './types';
import { api } from './lib/api';
import { Header } from './components/Header';
import { ProfileSheet } from './components/ProfileSheet';
import { BottomNav } from './components/BottomNav';
import { AuthModal } from './components/AuthModal';
import { CustomerView } from './components/CustomerView';
import { OwnerPOSView } from './components/OwnerPOSView';
import { UserManagement } from './components/UserManagement';
import { HPPManagement } from './components/HPPManagement';
import { ServicesView } from './components/ServicesView';
import { AnalyticsView } from './components/AnalyticsView';
import { CRMBehaviorView } from './components/CRMBehaviorView';
import { LoginLandingPage } from './components/LoginLandingPage';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { playQueueCallSound } from './lib/audio';
import { supabase } from './lib/supabase';

export default function App() {
  // Authentication & Role State (Server session is authoritative)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('arez_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return null;
  });

  const isOwner = currentUser?.role === 'OWNER' || (currentUser?.role as any) === 'SUPER_ADMIN' || (currentUser?.role as any) === 'ADMIN';
  const isStaff = currentUser?.role === 'STAFF' || (currentUser?.role as any) === 'BARBER' || (currentUser?.role as any) === 'CASHIER';

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    const stored = localStorage.getItem('arez_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.role === 'OWNER' || u?.role === 'STAFF') return 'pos';
      } catch (e) {}
    }
    return 'queue';
  });

  // Verify server-side session on mount
  useEffect(() => {
    let isMounted = true;
    api.getAuthMe().then((res) => {
      if (!isMounted) return;
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        if (localStorage.getItem('arez_user')) {
          localStorage.removeItem('arez_user');
          localStorage.removeItem('arez_token');
          setCurrentUser(null);
          // Optional: window.location.reload() but changing currentUser should trigger effect to go back to queue view
        }
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Application Data States
  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [hppList, setHppList] = useState<MasterHPP[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecapResponse | null>(null);
  const [dailyRecap, setDailyRecap] = useState<DailyRecap | null>(null);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);

  // PWA Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Sync current user to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('arez_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('arez_user');
    }
  }, [currentUser]);

  // Adjust active tab on role change
  useEffect(() => {
    if (isOwner) {
      if (['history', 'notifications'].includes(activeTab)) {
        setActiveTab('pos');
      }
    } else if (isStaff) {
      if (!['pos', 'queue'].includes(activeTab)) {
        setActiveTab('pos');
      }
    } else {
      if (['pos', 'staff', 'hpp', 'services', 'analytics', 'crm'].includes(activeTab)) {
        setActiveTab('queue');
      }
    }
  }, [isOwner, isStaff, activeTab]);

  // PWA Install prompt listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  // Fetch all data safely according to user role permissions
  const loadAllData = useCallback(async () => {
    try {
      // 1. Public Data (Queues & Services available to everyone)
      const [qData, sData] = await Promise.all([
        api.getQueues().catch(() => []),
        api.getServices().catch(() => []),
      ]);
      setQueues(Array.isArray(qData) ? qData : []);
      setServices(Array.isArray(sData) ? sData : []);

      // 2. Staff / Owner Restricted Data
      if (isOwner || isStaff) {
        const [hData, tData] = await Promise.all([
          api.getHPP().catch(() => []),
          api.getTransactions().catch(() => []),
        ]);
        setHppList(Array.isArray(hData) ? hData : []);
        setTransactions(Array.isArray(tData) ? tData : []);
      }

      // 3. Owner Only Analytics
      if (isOwner) {
        const aData = await api.getAnalyticsRecap().catch(() => null);
        if (aData) {
          setAnalytics(aData);
          setDailyRecap(aData.daily || null);
        }
      }

      // 4. Customer Notifications
      if (currentUser && currentUser.role === 'CUSTOMER') {
        const notifs = await api.getNotifications(currentUser.id).catch(() => []);
        const unread = Array.isArray(notifs) ? notifs.filter((n) => !n.read).length : 0;
        setUnreadNotifsCount(unread);
      }
    } catch (err) {
      console.error('Data load failed:', err);
    }
  }, [currentUser, isOwner, isStaff]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Real-Time Multi-Layered Synchronization (Supabase Realtime + Reconnecting SSE + Visibility Triggers)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let sseRetryTimer: any = null;
    let supabaseChannel: any = null;
    try {
      if (supabase) {
        supabaseChannel = supabase
          .channel('arez-live-sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'queues' },
            (payload) => {
              if (payload.eventType === 'UPDATE' && (payload.new as any)?.status === 'IN_PROGRESS') {
                playQueueCallSound();
              }
              api.getQueues().then((freshQueues) => {
                freshQueues.sort((a, b) => (Number(a.queue_number) || 0) - (Number(b.queue_number) || 0));
                setQueues(freshQueues);
              }).catch(() => {});
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'services' },
            () => {
              api.getServices().then(setServices).catch(() => {});
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'hpp_items' },
            () => {
              if (isOwner || isStaff) {
                api.getHPP().then(setHppList).catch(() => {});
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'transactions' },
            () => {
              if (isOwner || isStaff) {
                api.getTransactions().then(setTransactions).catch(() => {});
              }
            }
          )
          .subscribe();
      }
    } catch (e) {
      console.warn('[Supabase Realtime Setup Note]:', e);
    }

    // 2. Reconnecting Server-Sent Events (SSE) Listener with Exponential Backoff
    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'QUEUE_STARTED') {
              playQueueCallSound();
            }
          } catch (_) {}
        };

        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          clearTimeout(sseRetryTimer);
          sseRetryTimer = setTimeout(connectSSE, 5000);
        };
      } catch (_) {}
    };

    connectSSE();

    // 3. Immediate Refresh when user switches tab or unlocks phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAllData();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    // 4. Fast 3-Second Smart Polling Safety Net (DISABLED TO PREVENT FIREBASE QUOTA DDOS)
    // const interval = setInterval(loadAllData, 3000);

    // 5. Marathon Mode: Screen Wake Lock (keeps counter/tablet screen awake 24/7 without timeout)
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        } catch (_) {}
      }
    };

    requestWakeLock();

    const handleWakeLockVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleWakeLockVisibility);

    return () => {
      if (supabase && supabaseChannel) {
        supabase.removeChannel(supabaseChannel);
      }
      eventSource?.close();
      clearTimeout(sseRetryTimer);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleWakeLockVisibility);
      wakeLockSentinel?.release().catch(() => {});
    };
  }, [loadAllData]);

  const handleLoginSuccess = (user: User) => {
    const roleUpper = String(user.role || '').toUpperCase();
    const canonicalRole: User['role'] = (roleUpper === 'OWNER' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN')
      ? 'OWNER'
      : (roleUpper === 'STAFF' || roleUpper === 'BARBER' || roleUpper === 'CASHIER')
      ? 'STAFF'
      : 'CUSTOMER';
    const normalizedUser = { ...user, role: canonicalRole };
    setCurrentUser(normalizedUser);
    if (canonicalRole === 'OWNER' || canonicalRole === 'STAFF') {
      setActiveTab('pos');
    } else {
      setActiveTab('queue');
    }
    loadAllData();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (_) {}
    setCurrentUser(null);
    setActiveTab('queue');
  };

  // Gatekeeper: Unauthenticated users are strictly served the Login Landing Page
  if (!currentUser) {
    return <LoginLandingPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div
      id="arez-barbershop-root"
      className="min-h-screen min-h-[100dvh] bg-[#F7F6F2] text-[#20231F] flex flex-col font-sans selection:bg-[#E8ECE8] selection:text-[#26362E] w-full max-w-full overflow-x-hidden"
    >
      {/* PWA Install Banner */}
      <PWAInstallBanner deferredPrompt={deferredPrompt} onInstall={handleInstallPWA} />

      {/* Mobile-First Header */}
      <Header
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenProfile={() => setProfileSheetOpen(true)}
      />

      {/* Main Content Container (with bottom nav safe area padding) */}
      <main className="flex-1 w-full max-w-full px-0 pb-[calc(76px+env(safe-area-inset-bottom,0px))]">
        {isOwner ? (
          <>
            {activeTab === 'pos' && (
              <OwnerPOSView
                queues={queues}
                services={services}
                dailyRecap={dailyRecap}
                onRefreshData={loadAllData}
              />
            )}
            {activeTab === 'staff' && (
              <UserManagement currentUser={currentUser} />
            )}
            {(activeTab === 'services' || activeTab === 'hpp') && (
              <ServicesView
                services={services}
                hppList={hppList}
                onRefreshData={loadAllData}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView
                analytics={analytics}
                transactions={transactions}
                onRefreshData={loadAllData}
              />
            )}
            {activeTab === 'crm' && (
              <CRMBehaviorView onRefreshData={loadAllData} />
            )}
            {activeTab === 'queue' && (
              <CustomerView
                currentUser={currentUser}
                queues={queues}
                services={services}
                activeSubTab="queue"
                onOpenAuth={() => setAuthModalOpen(true)}
                onRefreshData={loadAllData}
              />
            )}
          </>
        ) : isStaff ? (
          <>
            {activeTab === 'pos' && (
              <OwnerPOSView
                queues={queues}
                services={services}
                dailyRecap={dailyRecap}
                onRefreshData={loadAllData}
              />
            )}
            {activeTab === 'queue' && (
              <CustomerView
                currentUser={currentUser}
                queues={queues}
                services={services}
                activeSubTab="queue"
                onOpenAuth={() => setAuthModalOpen(true)}
                onRefreshData={loadAllData}
              />
            )}
          </>
        ) : (
          <CustomerView
            currentUser={currentUser}
            queues={queues}
            services={services}
            activeSubTab={activeTab as 'queue' | 'services_view' | 'history' | 'notifications'}
            onOpenAuth={() => setAuthModalOpen(true)}
            onRefreshData={loadAllData}
          />
        )}
      </main>

      {/* Mobile-First Tactile Bottom Navigation */}
      <BottomNav
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadNotifsCount={unreadNotifsCount}
      />

      {/* Mobile Profile & Preferences Bottom Sheet */}
      <ProfileSheet
        isOpen={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => {
          setProfileSheetOpen(false);
          setAuthModalOpen(true);
        }}
        canInstallPWA={!!deferredPrompt}
        onInstallPWA={handleInstallPWA}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
