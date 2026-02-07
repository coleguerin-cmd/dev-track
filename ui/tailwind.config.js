/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core palette — inspired by Linear/Cursor dark theme
        surface: {
          0: '#0a0a0b',    // Deepest background
          1: '#111113',    // Main background
          2: '#18181b',    // Card/panel background
          3: '#1f1f23',    // Elevated surface
          4: '#27272b',    // Hover state
        },
        border: {
          DEFAULT: '#2a2a2e',
          subtle: '#1f1f23',
          strong: '#3f3f46',
        },
        text: {
          primary: '#fafafa',
          secondary: '#a1a1aa',
          tertiary: '#71717a',
          inverse: '#09090b',
        },
        accent: {
          blue: '#3b82f6',
          green: '#22c55e',
          yellow: '#eab308',
          red: '#ef4444',
          purple: '#a855f7',
          orange: '#f97316',
          cyan: '#06b6d4',
        },
        // Status colors
        status: {
          pass: '#22c55e',
          fail: '#ef4444',
          warn: '#eab308',
          info: '#3b82f6',
          neutral: '#71717a',
        },
        // Size badge colors
        size: {
          S: '#06b6d4',
          M: '#3b82f6',
          L: '#a855f7',
          XL: '#f97316',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
