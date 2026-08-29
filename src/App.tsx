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
import { ToastProvider } from './components/Toast';
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

  // Application Data States (Initialized from LocalStorage cache for instant zero-flicker render)
  const [queues, setQueues] = useState<QueueItem[]>(() => {
    try {
      const stored = localStorage.getItem('arez_cache_queues');
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  });

  const [services, setServices] = useState<Service[]>(() => {
    try {
      const stored = localStorage.getItem('arez_cache_services');
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  });

  const [hppList, setHppList] = useState<MasterHPP[]>(() => {
    try {
      const stored = localStorage.getItem('arez_cache_hpp');
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = localStorage.getItem('arez_cache_transactions');
      return stored ? JSON.parse(stored) : [];
    } catch (_) {
      return [];
    }
  });

  const [analytics, setAnalytics] = useState<AnalyticsRecapResponse | null>(null);
  const [dailyRecap, setDailyRecap] = useState<DailyRecap | null>(null);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);

  // Safe State Updaters with Local Cache Persistence
  const updateServicesState = useCallback((freshServices: Service[]) => {
    if (Array.isArray(freshServices)) {
      setServices(freshServices);
      try {
        localStorage.setItem('arez_cache_services', JSON.stringify(freshServices));
      } catch (_) {}
    }
  }, []);

  const updateQueuesState = useCallback((freshQueues: QueueItem[]) => {
    if (Array.isArray(freshQueues)) {
      freshQueues.sort((a, b) => (Number(a.queue_number) || 0) - (Number(b.queue_number) || 0));
      setQueues(freshQueues);
      try {
        localStorage.setItem('arez_cache_queues', JSON.stringify(freshQueues));
      } catch (_) {}
    }
  }, []);

  const updateHppState = useCallback((freshHpp: MasterHPP[]) => {
    if (Array.isArray(freshHpp)) {
      setHppList(freshHpp);
      try {
        localStorage.setItem('arez_cache_hpp', JSON.stringify(freshHpp));
      } catch (_) {}
    }
  }, []);

  const updateTransactionsState = useCallback((freshTx: Transaction[]) => {
    if (Array.isArray(freshTx)) {
      setTransactions(freshTx);
      try {
        localStorage.setItem('arez_cache_transactions', JSON.stringify(freshTx));
      } catch (_) {}
    }
  }, []);

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

  // Fetch all data safely (Stale-While-Revalidate: never overwrites existing state on network error)
  const loadAllData = useCallback(async () => {
    try {
      // 1. Public Data (Queues & Services available to everyone)
      try {
        const qData = await api.getQueues();
        if (Array.isArray(qData)) updateQueuesState(qData);
      } catch (err) {
        console.warn('[Sync] Queues fetch deferred:', err);
      }

      try {
        const sData = await api.getServices();
        if (Array.isArray(sData)) updateServicesState(sData);
      } catch (err) {
        console.warn('[Sync] Services fetch deferred:', err);
      }

      // 2. Staff / Owner Restricted Data
      if (isOwner || isStaff) {
        try {
          const hData = await api.getHPP();
          if (Array.isArray(hData)) updateHppState(hData);
        } catch (_) {}

        try {
          const tData = await api.getTransactions();
          if (Array.isArray(tData)) updateTransactionsState(tData);
        } catch (_) {}
      }

      // 3. Owner Only Analytics
      if (isOwner) {
        try {
          const aData = await api.getAnalyticsRecap();
          if (aData) {
            setAnalytics(aData);
            setDailyRecap(aData.daily || null);
          }
        } catch (_) {}
      }

      // 4. Customer Notifications
      if (currentUser && currentUser.role === 'CUSTOMER') {
        try {
          const notifs = await api.getNotifications(currentUser.id);
          if (Array.isArray(notifs)) {
            const unread = notifs.filter((n) => !n.read).length;
            setUnreadNotifsCount(unread);
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('Data load exception:', err);
    }
  }, [
    currentUser,
    isOwner,
    isStaff,
    updateQueuesState,
    updateServicesState,
    updateHppState,
    updateTransactionsState,
  ]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Real-Time Multi-Layered Synchronization (Supabase Realtime + Reconnecting SSE + Visibility Triggers)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let sseRetryTimer: any = null;
    let supabaseChannel: any = null;
    let debounceTimer: any = null;

    const triggerDebouncedLoad = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadAllData();
      }, 300);
    };

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
              triggerDebouncedLoad();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'services' },
            () => {
              triggerDebouncedLoad();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'hpp_items' },
            () => {
              if (isOwner || isStaff) {
                triggerDebouncedLoad();
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'transactions' },
            () => {
              if (isOwner || isStaff) {
                triggerDebouncedLoad();
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
            triggerDebouncedLoad();
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

    // 3. Immediate Debounced Refresh when user switches tab or unlocks phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerDebouncedLoad();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    // 4. Marathon Mode: Screen Wake Lock (keeps counter/tablet screen awake 24/7 without timeout)
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
      clearTimeout(debounceTimer);
      clearTimeout(sseRetryTimer);
      if (supabase && supabaseChannel) {
        supabase.removeChannel(supabaseChannel);
      }
      if (eventSource) {
        eventSource.close();
      }
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleWakeLockVisibility);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [loadAllData, isOwner, isStaff]);

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
    return (
      <ToastProvider>
        <LoginLandingPage onLoginSuccess={handleLoginSuccess} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}
