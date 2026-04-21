/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#f97316',
          'orange-dark': '#ea580c',
        }
      },
      fontFamily: {
        heading: ['Russo One', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
