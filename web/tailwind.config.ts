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
        // Dark theme palette inspired by Lemmy
        dark: {
          50: '#f8f9fc',
          100: '#eef0f6',
          200: '#d5d9e8',
          300: '#a8b0c9',
          400: '#7a85aa',
          500: '#565f8a',
          600: '#3d4570',
          700: '#2a3055',
          800: '#1e2340',
          900: '#151930',
          950: '#0d1020',
        },
        // Bluesky-inspired palette
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
        // Surface colors for dark theme
        surface: {
          DEFAULT: '#1a1d2e',
          light: '#242840',
          lighter: '#2e3350',
          dark: '#121525',
        },
      },
    },
  },
  plugins: [],
};

export default config;
