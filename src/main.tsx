import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auto-register service worker in production builds for instant PWA cache loading,
// and trigger immediate background updates for installed riders without needing APK re-downloads.
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
