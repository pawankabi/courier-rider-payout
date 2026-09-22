import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function safeTailwindcss() {
  const plugins = tailwindcss();
  return plugins.map((plugin) => {
    if (plugin && plugin.name === '@tailwindcss/vite:generate:serve') {
      const origHotUpdate = (plugin as any).hotUpdate;
      if (typeof origHotUpdate === 'function') {
        (plugin as any).hotUpdate = function (ctx: any) {
          if (!ctx?.server?.hot && !ctx?.server?.ws) {
            return [];
          }
          try {
            return origHotUpdate.call(this, ctx);
          } catch {
            return [];
          }
        };
      }
    }
    return plugin;
  });
}

function oldAppSyncProxyPlugin() {
  return {
    name: 'old-app-sync-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/proxy-old-app', async (req: any, res: any) => {
        try {
          const urlObj = new URL(req.url, 'http://localhost:3000');
          const targetUrl = urlObj.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing "url" parameter' }));
            return;
          }

          const fetchRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CourierAppSync/1.0',
              'Accept': '*/*',
            },
          });

          const contentType = fetchRes.headers.get('content-type') || 'text/plain';
          const text = await fetchRes.text();

          res.statusCode = fetchRes.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Content-Type', contentType);
          res.end(text);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err?.message || 'Proxy fetch failed' }));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  return {
    plugins: [
      react(),
      safeTailwindcss(),
      oldAppSyncProxyPlugin(),
      !isDev && VitePWA({
        disable: false,
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Courier Rider Payout & Delivery Manager',
          short_name: 'RiderPayout',
          description: 'Courier Rider delivery tracking, ₹13 base + ₹2 incentive payout, settlement & WhatsApp slips.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/__.*$/],
          runtimeCaching: [
            {
              // Core HTML document navigation: Stale-While-Revalidate so app opens in < 1s from cache even on Cloud Run cold start
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pwa-app-shell',
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Core JS, CSS, and worker scripts: Cache-First strategy for instant offline / cold-start execution
              urlPattern: ({ request }) =>
                request.destination === 'script' || request.destination === 'style' || request.destination === 'worker',
              handler: 'CacheFirst',
              options: {
                cacheName: 'pwa-static-assets',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              // Images and icons: Cache-First
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'pwa-static-images',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              // Web Fonts: Cache-First
              urlPattern: ({ request }) => request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'pwa-fonts',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
    },
  };
});
