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
        primary: {
          navy: '#1E3A5F',
          green: '#217346',
          orange: '#1E3A5F', // deprecated alias — migrate usages to primary-navy
          dark: '#0a0a0a',
          'dark-gray': '#1a1a1a',
          'dark-card': '#151515',
        },
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
