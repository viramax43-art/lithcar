/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#000000',
        accent: '#22EA36',
        'accent-dark': '#206915',
        surface: '#F6F6F6',
        border: '#E6E6E6',
        muted: '#858585',
        'point-a': '#EF4444',
        'point-b': '#3B82F6',
        driver: '#3B82F6',
      },
      borderRadius: {
        pill: '100px',
        card: '24px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)',
        bar: '0 -4px 20px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
