import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    // Injected into the service worker (and all other modules) at build time
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@ingenious/shared': path.resolve(__dirname, '../shared/index.ts'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        swSrc: 'src/sw.ts',
        swDest: 'dist/sw.js',
      },
      manifest: {
        name: 'Ingenious',
        short_name: 'Ingenious',
        description: 'Multiplayer hex tile board game',
        id: '/',
        start_url: '/',
        scope: '/',
        theme_color: '#062f38',
        background_color: '#062f38',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        handle_links: 'preferred',
        orientation: 'any',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
