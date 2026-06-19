import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#b9dffd',
          300: '#7cc5fc',
          400: '#36a9f8',
          500: '#0c8de9',
          600: '#0070c7',
          700: '#0159a1',
          800: '#064b85',
          900: '#0b3f6e',
          950: '#072849',
        },
        surface: {
          DEFAULT: 'rgba(var(--surface) / <alpha-value>)',
          light: 'rgba(var(--surface-light) / <alpha-value>)',
          lighter: 'rgba(var(--surface-lighter) / <alpha-value>)',
          dark: 'rgba(var(--surface-dark) / <alpha-value>)',
        },
        dark: {
          600: 'rgba(var(--border-hover) / <alpha-value>)',
          700: 'rgba(var(--border-color) / <alpha-value>)',
        },
        text: {
          100: 'rgba(var(--text-100) / <alpha-value>)',
          200: 'rgba(var(--text-200) / <alpha-value>)',
          300: 'rgba(var(--text-300) / <alpha-value>)',
          400: 'rgba(var(--text-400) / <alpha-value>)',
          500: 'rgba(var(--text-500) / <alpha-value>)',
          600: 'rgba(var(--text-600) / <alpha-value>)',
        },
        ghost: {
          DEFAULT: 'var(--ghost)',
          hover: 'rgba(var(--ghost-hover) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
