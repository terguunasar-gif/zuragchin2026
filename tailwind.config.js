/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        brand: ['Unbounded', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
