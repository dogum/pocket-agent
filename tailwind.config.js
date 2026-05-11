/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cormorant', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        signal: 'var(--signal)',
        cool: 'var(--cool)',
        green: 'var(--green)',
        amber: 'var(--amber)',
        red: 'var(--red)',
      },
    },
  },
  plugins: [],
}
