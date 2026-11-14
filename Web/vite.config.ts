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
        // Rediseño v2: tinta de la cabecera y fondo claro de la página.
        theme_color: '#0f2a1d',
        background_color: '#f2f4ee',
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
        // Rediseño v2: también las tipografías autoalojadas (public/fonts, ~350 KB), para que la copia
        // de la estimación sin conexión se vea con DM Sans y Bricolage. Son archivos estáticos, no datos.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,ttf}'],
        // F12-EST-07-WEB (#180): ninguna respuesta del API pasa por el service worker ni
        // se cachea; la única copia institucional es la de IndexedDB (lib/estimation-copy).
        navigateFallbackDenylist: [/^\/api\//],
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
