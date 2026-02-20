/** @type {import('tailwindcss').Config} */
export default {
  content: ['index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dcff',
          300: '#80c1ff',
          400: '#38a3ff',
          500: '#0f8df6',
          600: '#0071d4',
          700: '#0059a8',
          800: '#004783',
          900: '#033c6b',
        },
      },
      boxShadow: {
        card: '0 10px 30px rgba(15, 141, 246, 0.08)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwind-scrollbar')({ nocompatible: true }),
  ],
}

