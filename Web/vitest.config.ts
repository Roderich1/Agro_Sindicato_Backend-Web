import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// F07: pruebas focalizadas de la Web (sin PWA ni Tailwind). HTTP siempre simulado.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
