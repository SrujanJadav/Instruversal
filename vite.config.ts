import { defineConfig, loadEnv, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.VITE_SITE_URL?.replace(/\/$/, '') || '';

  // Fail production builds with clear explanation if VITE_SITE_URL is missing
  if (command === 'build' && mode === 'production' && !siteUrl) {
    throw new Error(
      "[Instruversal Build Error] Missing required environment variable 'VITE_SITE_URL' for production build. " +
      "Please set VITE_SITE_URL (e.g. VITE_SITE_URL=https://instruversal.app) in your environment or .env file."
    );
  }

  const effectiveSiteUrl = siteUrl || 'https://instruversal.app';

  // Simple HTML transform plugin for replacing canonical site URL in metadata
  const htmlSiteUrlPlugin: Plugin = {
    name: 'html-site-url-transform',
    transformIndexHtml(html) {
      return html.replace(/%VITE_SITE_URL%/g, effectiveSiteUrl);
    },
  };

  return {
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
    plugins: [
      htmlSiteUrlPlugin,
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'script-defer',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'favicon-32x32.png',
          'favicon-16x16.png',
          'apple-touch-icon.png',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
          'robots.txt',
          'sitemap.xml',
          'og-image.png',
        ],
        manifest: {
          name: 'Instruversal',
          short_name: 'Instruversal',
          description: 'Draw to compose: a drawing-based loop sequencer for the web.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          categories: ['music', 'entertainment'],
          lang: 'en',
          theme_color: '#F3ECDD',
          background_color: '#F3ECDD',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,
            /^https:\/\/.*\.supabase\.co/,
          ],
          runtimeCaching: [
            // 1. Google Fonts stylesheets (Stale-While-Revalidate)
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 2. Google Fonts webfont binaries (CacheFirst, 1 year)
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 3. Supabase API, Auth, Realtime (NetworkOnly - NEVER CACHE)
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@supabase')) {
              return 'supabase';
            }
            if (id.includes('node_modules/tone')) {
              return 'tone';
            }
          },
        },
      },
    },
  };
});
