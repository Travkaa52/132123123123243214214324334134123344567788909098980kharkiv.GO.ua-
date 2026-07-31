import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project-сайти живуть на /<repo-name>/, а не на корені домену.
// GitHub Action передає BASE_PATH=/<repo-name>/ під час білда; локально — корінь.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest замість generateSW: власний src/sw.ts дає повний
      // контроль над стратегіями кешування (важливо, щоб не повторити
      // баг зі старим index.html, який тягнув видалені після редеплою
      // хеші чанків — див. lazyWithRetry.ts).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'offline.html'],
      manifest: {
        name: 'Kharkiv GO',
        short_name: 'Kharkiv GO',
        description: 'Транспорт Харкова у реальному часі: маршрути, зупинки, метро, трамваї, тролейбуси та автобуси.',
        theme_color: '#05522E',
        background_color: '#05522E',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl']
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
