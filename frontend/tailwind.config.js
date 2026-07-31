/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: 'rgb(var(--color-forest) / <alpha-value>)',
          light: 'rgb(var(--color-forest-light) / <alpha-value>)',
          dark: 'rgb(var(--color-forest-dark) / <alpha-value>)'
        },
        gold: {
          DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)',
          light: 'rgb(var(--color-gold-light) / <alpha-value>)',
          dark: 'rgb(var(--color-gold-dark) / <alpha-value>)'
        },
        mint: { DEFAULT: 'rgb(var(--color-mint) / <alpha-value>)' },
        accentBlue: { DEFAULT: 'rgb(var(--color-blue) / <alpha-value>)' },
        graphite: { DEFAULT: 'rgb(var(--color-graphite) / <alpha-value>)' },
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          soft: 'rgb(var(--color-surface-soft) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)'
        },
        border: 'rgb(var(--color-border))',
        ink: {
          text: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted))',
          inverted: 'rgb(var(--color-text-inverted) / <alpha-value>)'
        }
      },
      fontFamily: {
        display: ['"Manrope"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl2: 'var(--radius-lg)',
        xl3: 'var(--radius-xl)'
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        'glass-lg': 'var(--shadow-glass-lg)'
      },
      keyframes: {
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        'slide-up': { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        'splash-emblem-in': {
          '0%': { opacity: '0', transform: 'scale(0.82) translateY(10px)' },
          '60%': { opacity: '1', transform: 'scale(1.04) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        'splash-ring': {
          '0%': { opacity: '0.55', transform: 'scale(0.9)' },
          '100%': { opacity: '0', transform: 'scale(1.55)' }
        },
        'splash-word-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'splash-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(1.03)' }
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%': { transform: 'translateX(20%) scaleX(0.7)' },
          '100%': { transform: 'translateX(120%) scaleX(0.4)' }
        }
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.22,1,0.36,1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.22,1,0.36,1)',
        'sheet-up': 'sheet-up 0.3s cubic-bezier(0.22,1,0.36,1)',
        marquee: 'marquee 4s linear infinite',
        'splash-emblem-in': 'splash-emblem-in 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'splash-ring-1': 'splash-ring 2.4s cubic-bezier(0.4,0,0.2,1) infinite',
        'splash-ring-2': 'splash-ring 2.4s cubic-bezier(0.4,0,0.2,1) infinite 0.8s',
        'splash-ring-3': 'splash-ring 2.4s cubic-bezier(0.4,0,0.2,1) infinite 1.6s',
        'splash-word-in': 'splash-word-in 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s both',
        'splash-out': 'splash-out 0.45s cubic-bezier(0.4,0,1,1) both',
        'progress-indeterminate': 'progress-indeterminate 1.2s cubic-bezier(0.4,0,0.2,1) infinite'
      }
    }
  },
  plugins: []
};
