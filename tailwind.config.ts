import type { Config } from 'tailwindcss'

export default {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf4f5',
          100: '#fce8ec',
          200: '#f9d5dc',
          300: '#f4b3c0',
          400: '#ec8599',
          500: '#df5676',
          600: '#cc365c',
          700: '#ab284c',
          800: '#8f2444',
          900: '#7a223f',
          950: '#440e1f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
