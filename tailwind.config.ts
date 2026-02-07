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
          'navy-dark': '#152A47',
          'navy-light': '#2A4A6F',
          background: '#F8FAFC',
          card: '#FFFFFF',
          'text-primary': '#111827',
          'text-secondary': '#374151',
          'text-muted': '#6B7280',
          border: '#E5E7EB',
          link: '#1E3A5F',
        },
      },
      backgroundImage: {
        'circuit-pattern': 'radial-gradient(circle at 20% 50%, rgba(30, 58, 95, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(30, 58, 95, 0.08) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
}
export default config
