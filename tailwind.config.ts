import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        '1500': '1500ms',
      },
      colors: {
        charcoal: {
          900: '#2d2326',
          700: '#4a3f42',
          500: '#6b5f62',
          300: '#b0a5a8',
          200: '#e0d8da',
          100: '#f2eeef',
        },
        champagne: {
          600: '#b5757b',
          500: '#c4848a',
          400: '#d4a0a7',
          100: '#fdf2f3',
        },
        ivory: {
          50: '#FEFBFB',
          100: '#FBF6F6',
          200: '#F5ECEC',
          300: '#EDE0E0',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
