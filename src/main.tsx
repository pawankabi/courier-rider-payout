import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { liveUpdateService } from './services/liveUpdateService.ts';

// Auto-register service worker in production builds for instant PWA cache loading,
// and trigger immediate background updates for installed riders and admin without needing APK re-downloads.
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        liveUpdateService.setRegistration(registration);
        // Immediate check on app startup
        registration.update().catch(() => {});
        // Periodic background poll every 15 minutes while app is running
        setInterval(() => {
          registration.update().catch(() => {});
        }, 1000 * 60 * 15);
      })
      .catch((err) => {
        console.warn('ServiceWorker registration skipped:', err);
      });
  });

  // When a newly activated service worker takes control, refresh to run latest code
  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!isRefreshing) {
      isRefreshing = true;
      window.location.reload();
    }
  });
}

// Production Anti-Tamper & Anti-Copy Protection:
// Blocks right-click context menu and inspect shortcuts (F12, Ctrl+Shift+I, Ctrl+U) to prevent code inspection & theft
if (import.meta.env.PROD && typeof window !== 'undefined') {
  window.addEventListener('contextmenu', (e) => {
    // Allow context menu inside input fields and textareas for easy pasting
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    // Disable F12 (DevTools)
    if (e.key === 'F12') {
      e.preventDefault();
      return;
    }
    // Disable Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (Inspect Element)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      return;
    }
    // Disable Ctrl+U (View Source) & Ctrl+S (Save Page)
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      return;
    }
  });
}


import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
