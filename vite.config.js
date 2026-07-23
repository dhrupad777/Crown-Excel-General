import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Regression suite. These lock down the invariants behind real data-loss incidents (unique ids
  // under bulk load, region stamping, registration completeness, confirmed writes). `npm run ship`
  // runs them, so a broken invariant blocks the deploy.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true
  }
})
