/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E2C97E',
          dark: '#A07830',
        },
        dome: {
          DEFAULT: '#5A9BCB',
          light: '#8BBEDD',
          dark: '#3D6A8A',
        },
        studio: {
          bg: '#0a0a0a',
          surface: '#141414',
          border: '#1e1e1e',
          muted: '#2a2a2a',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
        tighter:  '-0.02em',
        tight:    '-0.015em',
        normal:   '0em',
        wide:     '0.06em',
        wider:    '0.12em',
        widest:   '0.2em',
        brand:    '0.18em',
      },
      lineHeight: {
        display: '1.15',
        tight:   '1.25',
        snug:    '1.4',
        normal:  '1.65',
        relaxed: '1.75',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4', letterSpacing: '0.08em' }],
        'xs':  ['12px', { lineHeight: '1.5' }],
        'sm':  ['14px', { lineHeight: '1.55' }],
        'base':['15px', { lineHeight: '1.65' }],
        'lg':  ['17px', { lineHeight: '1.5' }],
        'xl':  ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
        '3xl': ['30px', { lineHeight: '1.2',  letterSpacing: '-0.02em'  }],
        '4xl': ['36px', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
        '5xl': ['48px', { lineHeight: '1.1',  letterSpacing: '-0.03em'  }],
      },
    },
  },
  plugins: [],
};
