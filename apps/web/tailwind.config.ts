import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#ecfdf5', 500: '#10b981', 600: '#059669', 700: '#047857' },
      },
    },
  },
  plugins: [],
} satisfies Config;
