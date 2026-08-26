import React, { useState, useEffect } from 'react';
import { Smartphone, X } from 'lucide-react';

interface PWAInstallBannerProps {
  deferredPrompt: any;
  onInstall: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ deferredPrompt, onInstall }) => {
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect standalone PWA mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(standalone);

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIosDevice && !standalone) {
      setIsIOS(true);
    }
  }, []);

  if (dismissed || isStandalone) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div
      id="pwa-install-banner"
      className="bg-[#FCFBF8] text-[#20231F] px-4 py-3 border-b border-[#DDD9D0] shadow-xs"
    >
      <div className="max-w-[720px] mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#DCE2D8] text-[#3F4B41] flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#20231F]">
              Pasang Aplikasi Arez (PWA)
            </p>
            <p className="text-[11px] text-[#73776F] leading-tight">
              {isIOS
                ? 'Tekan tombol Share lalu pilih "Add to Home Screen" untuk akses cepat.'
                : 'Akses cepat & notifikasi real-time langsung di layar smartphone Anda.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {deferredPrompt && (
            <button
              id="install-app-btn"
              onClick={onInstall}
              className="px-3 py-1.5 bg-[#59665A] hover:bg-[#3F4B41] text-[#FCFBF8] text-xs font-medium rounded-[8px] active:scale-95 transition-all shadow-xs"
            >
              Pasang
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-[#73776F] hover:text-[#20231F] rounded-[6px] hover:bg-[#F5F3EE] transition-colors"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
