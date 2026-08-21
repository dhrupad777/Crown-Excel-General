import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
// Ported verbatim from the inline `tailwind.config` that used to sit in index.html alongside the
// Play CDN script. The CDN generated utilities in the browser at runtime; this builds them at
// compile time instead, so no third-party script executes in the app (and a real CSP becomes
// possible; the Play CDN needs 'unsafe-eval').
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        surface: '#ffffff',
        background: '#f7f9fb',
        'outline-variant': '#cbd5e1',
        'on-surface': '#0f172a',
        'on-surface-variant': '#475569'
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: [forms, containerQueries]
};
