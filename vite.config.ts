import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { prerenderPlugin } from './scripts/prerenderPlugin.ts';
import { isSensitivePrecacheUrl } from './src/pwa/sensitivePaths.ts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifestFilename: 'site.webmanifest',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-32.png',
        'apple-touch-icon.png',
        'offline.html',
      ],
      manifest: {
        id: '/',
        name: 'Zuragchin.mn',
        short_name: 'Zuragchin',
        description: 'Арга хэмжээний зургаа олж, утсандаа шууд аваарай',
        lang: 'mn',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0c0a09',
        theme_color: '#0c0a09',
        prefer_related_applications: false,
        // Chrome/Edge-д «аль хэдийн суусан» эсэхийг getInstalledRelatedApps()-аар таниулна.
        // prefer_related_applications хэвээр false тул суулгалт Play Store руу үсрэхгүй.
        related_applications: [
          {
            platform: 'webapp',
            url: '/site.webmanifest',
            id: 'https://www.zuragchin.mn/',
          },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,woff2}'],
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', '**/auth/**', 'app.html'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter((entry) => {
              if (isSensitivePrecacheUrl(entry.url)) return false;
              // Face-detection bundles are optional and multi-megabyte. They stay
              // on the network so installing the app does not download them.
              return entry.size == null || entry.size <= 512 * 1024;
            }),
            warnings: [],
          }),
        ],
      },
      integration: { closeBundleOrder: 'post' },
      devOptions: { enabled: false },
    }),
    prerenderPlugin(),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
