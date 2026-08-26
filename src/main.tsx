import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// PWA Standalone Detection & Native UI enhancement
export function isRunningAsPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

if (typeof window !== 'undefined') {
  const syncPWAMode = () => {
    if (isRunningAsPWA()) {
      document.body.classList.add('is-pwa');
      const installBtn = document.getElementById('install-app-btn');
      if (installBtn) installBtn.style.display = 'none';
    }
  };

  syncPWAMode();
  window.addEventListener('load', syncPWAMode);

  // Prevent double-tap zoom on interactive elements
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'BUTTON' || target.closest('button') || target.tagName === 'A')) {
          e.preventDefault();
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Prevent drag on images
  document.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'IMG' || target.tagName === 'SVG' || target.classList.contains('icon'))) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
