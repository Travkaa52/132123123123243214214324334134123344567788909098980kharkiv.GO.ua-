import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project-сайти живуть на /<repo-name>/, а не на корені домену.
// GitHub Action передає BASE_PATH=/<repo-name>/ під час білда; локально — корінь.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  server: {
    proxy: {
      '/api/alerts': {
        target: 'https://ubilling.net.ua',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/alerts/, '/aerialalerts/?source=klimenko&raw'),
      },
    },
  },
});

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
      // Власний сервіс-воркер (src/sw.ts) замість автогенерованого — саме
      // там реалізована стратегія NetworkFirst для HTML/навігацій з
      // офлайн-фолбеком (щоб уникнути "чорного екрана" зі старим index.html
      // після редеплою) і окремі стратегії кешування по типах ресурсів.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      // registerType 'prompt' + injectRegister: false — реєструємо сервіс-воркер
      // самі через virtual:pwa-register/react (components/PwaUpdateBanner.tsx),
      // бо sw.ts свідомо чекає на повідомлення SKIP_WAITING від UI, а не
      // оновлюється мовчки сам: це дає змогу показати користувачу кнопку
      // "Оновити", а не перезавантажити застосунок непомітно під час активної
      // роботи (відкрита картка маршруту, форма скарги на затримку тощо).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        id: base,
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
