import type { Config } from 'tailwindcss'

export default {
  theme: {
    extend: {
      transitionDuration: {
        '1500': '1500ms',
      },
      colors: {
        primary: {
          50: '#f1f4f8',
          100: '#dde4ef',
          200: '#bac8dc',
          300: '#8ea3c3',
          400: '#6180ab',
          500: '#43608f',
          600: '#314571',
          700: '#253558',
          800: '#1a2640',
          900: '#101722',
          950: '#0b0f18',
        },
        ivory: {
          50: '#FEFDF9',
          100: '#FBF8F0',
          200: '#F5EFDF',
          300: '#EDE4CC',
          400: '#DDD0AF',
          500: '#C4B48A',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
