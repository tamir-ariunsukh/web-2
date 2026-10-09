import type { Config } from 'tailwindcss';

/**
 * Shared Tailwind CSS configuration.
 *
 * Tailwind v4 reads design tokens from CSS via `@theme`, so this preset mainly
 * holds content globs and plugin wiring. Token values live in `packages/ui/src/styles/theme.css`.
 */
const preset = {
  content: [],
  theme: {
    extend: {
      colors: {
        // Brand palette — overridden by CSS @theme tokens in the UI package.
        brand: {
          50: 'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          200: 'var(--color-brand-200)',
          300: 'var(--color-brand-300)',
          400: 'var(--color-brand-400)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          800: 'var(--color-brand-800)',
          900: 'var(--color-brand-900)',
          950: 'var(--color-brand-950)',
        },
        // Semantic seat states used by the seat-map renderer.
        seat: {
          available: 'var(--color-seat-available)',
          selected: 'var(--color-seat-selected)',
          held: 'var(--color-seat-held)',
          occupied: 'var(--color-seat-occupied)',
          blocked: 'var(--color-seat-blocked)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      keyframes: {
        'pulse-seat': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'pulse-seat': 'pulse-seat 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default preset;
