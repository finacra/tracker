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
          'navy-light': '#2A4A6F',
          'navy-dark': '#152A45',
          orange: '#FF6B35', // Keep for accents/CTAs if needed
          dark: '#1E3A5F', // Changed to navy
          'dark-gray': '#2A4A6F',
          'dark-card': '#1E3A5F',
        },
      },
      backgroundImage: {
        'circuit-pattern': 'radial-gradient(circle at 20% 50%, rgba(30, 58, 95, 0.2) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(30, 58, 95, 0.25) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
}
export default config
