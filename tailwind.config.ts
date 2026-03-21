import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        '1500': '1500ms',
      },
      colors: {
        charcoal: {
          900: '#1a1a1a',
          700: '#3d3d3d',
          500: '#6b6b6b',
          300: '#b0b0b0',
          200: '#e0e0e0',
          100: '#f0f0f0',
        },
        champagne: {
          600: '#b8944f',
          500: '#c9a96e',
          400: '#d4bc8a',
          100: '#faf6ee',
        },
        ivory: {
          50: '#FDFCF9',
          100: '#FAF8F3',
          200: '#F5EFDF',
          300: '#EDE4CC',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
