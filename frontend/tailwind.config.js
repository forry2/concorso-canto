/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1520',
        stage: '#c45c26',
        gold: '#d4a017',
        cream: '#f7f0e6',
        mist: '#ebe2d6',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'stage-glow':
          'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(196,92,38,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(212,160,23,0.12), transparent)',
      },
    },
  },
  plugins: [],
};
