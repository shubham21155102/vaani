/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050505",
        panel: "#111111",
        "panel-2": "#1a1a1a",
        border: "#2a2a2a",
        text: "#f0f0f0",
        muted: "#888888",
        accent: "#ff2a5f",
        "accent-hover": "#ff4d79",
        "accent-2": "#ff7e27",
        ok: "#00e676",
        err: "#ff1744",
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
        display: ['"Syncopate"', '"Inter"', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-glow': 'pulseGlow 2s infinite',
        'adrenaline': 'adrenaline 0.3s ease-in-out',
        'gradient-x': 'gradientX 3s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 42, 95, 0.4)', textShadow: '0 0 10px rgba(255, 42, 95, 0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 42, 95, 0.8)', textShadow: '0 0 20px rgba(255, 42, 95, 0.8)' },
        },
        adrenaline: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        gradientX: {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          },
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'adrenaline-gradient': 'linear-gradient(135deg, #ff2a5f 0%, #ff7e27 100%)',
      }
    },
  },
  plugins: [],
};
