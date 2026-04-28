import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy brand tokens — DO NOT REMOVE. Used in 380+ places.
        // New work should prefer the semantic tokens below.
        primary: {
          navy: '#1E3A5F',
          green: '#217346',
          orange: '#1E3A5F', // deprecated alias — migrate usages to primary-navy
          dark: '#0a0a0a',
          'dark-gray': '#1a1a1a',
          'dark-card': '#151515',
        },
        // Semantic tokens (PR-1). Backed by CSS variables in globals.css so
        // they switch with [data-theme]. Until PR-3 ships the toggle, the
        // :root values mirror today's dark palette — zero visual change.
        bg: {
          base: 'rgb(var(--bg-base) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
          muted: 'rgb(var(--bg-muted) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg-primary) / <alpha-value>)',
          primary: 'rgb(var(--fg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--fg-secondary) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          inverse: 'rgb(var(--fg-inverse) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        accent: {
          brand: 'rgb(var(--accent-brand) / <alpha-value>)',
          success: 'rgb(var(--accent-success) / <alpha-value>)',
          warn: 'rgb(var(--accent-warn) / <alpha-value>)',
          danger: 'rgb(var(--accent-danger) / <alpha-value>)',
          info: 'rgb(var(--accent-info) / <alpha-value>)',
        },
      },
      fontFamily: {
        // PR-2 will swap layout.tsx to load Geist Sans + Mono and wire these.
        // Defining the keys now so consuming components can opt-in early.
        sans: ['var(--font-sans)', 'Poppins', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
      },
      boxShadow: {
        popover: 'var(--shadow-popover)',
        elevated: 'var(--shadow-elevated)',
      },
      transitionTimingFunction: {
        token: 'var(--ease-token)',
      },
      transitionDuration: {
        token: 'var(--duration-token)',
      },
      backgroundImage: {
        'circuit-pattern': 'radial-gradient(circle at 20% 50%, rgba(30, 58, 95, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(30, 58, 95, 0.18) 0%, transparent 50%)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
      },
    },
  },
  plugins: [],
}
export default config
