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
        // they switch with [data-theme].
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
        sans: ['var(--font-sans)', 'Poppins', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',     // 16px — primary cards
        'token-2xl': 'var(--radius-2xl)',   // 20px — hero panels
      },
      boxShadow: {
        // Layered scale (Stripe-style elevation). Use these over ad-hoc
        // shadow-2xl etc. for consistent depth across the app.
        'token-xs': 'var(--shadow-xs)',
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
        // Legacy aliases — kept so existing `shadow-popover` / `shadow-elevated`
        // consumers don't break. New code should prefer the scale above.
        popover: 'var(--shadow-popover)',
        elevated: 'var(--shadow-elevated)',
      },
      transitionTimingFunction: {
        token: 'var(--ease-token)',
        emphasized: 'var(--ease-emphasized)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        token: 'var(--duration-token)',
        slow: 'var(--duration-slow)',
      },
      backgroundImage: {
        'circuit-pattern': 'radial-gradient(circle at 20% 50%, rgba(30, 58, 95, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(30, 58, 95, 0.18) 0%, transparent 50%)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
        slideInRight: 'slideInRight 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        scaleIn: 'scaleIn 180ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
export default config
