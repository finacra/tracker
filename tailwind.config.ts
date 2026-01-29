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
          orange: '#FF6B35',
          dark: '#0a0a0a',
          'dark-gray': '#1a1a1a',
          'dark-card': '#151515',
        },
      },
      backgroundImage: {
        'circuit-pattern': 'radial-gradient(circle at 20% 50%, rgba(255, 107, 53, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 107, 53, 0.15) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
}
export default config
