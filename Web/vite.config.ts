import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Agrocuentas Directiva',
        short_name: 'Agrocuentas',
        // F07-WEB-01 (#23): Web online-first de Directiva/Administrador; el
        // service worker sólo cachea el app-shell, nunca respuestas del API.
        description: 'Vistas colectivas de la Directiva y el Administrador del sindicato (en línea).',
        theme_color: '#166534',
        background_color: '#f8faf4',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        // Local por defecto; cada entorno de prueba puede apuntar a su API.
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
