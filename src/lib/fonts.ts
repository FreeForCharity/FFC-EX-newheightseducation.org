import localFont from 'next/font/local'

// Self-hosted in src/fonts so builds never fetch from Google:
//   - Open Sans  -> .aria-font / #header
//   - Lato       -> .lato-font (and Tailwind --font-sans)
//   - Faustina   -> body default / .faustina-font (and --font-serif-display)
export const openSans = localFont({
  src: '../fonts/open-sans-400-800.woff2',
  display: 'swap',
  variable: '--font-open-sans',
  weight: '400 800',
})

export const lato = localFont({
  src: [
    { path: '../fonts/lato-400.woff2', weight: '400' },
    { path: '../fonts/lato-700.woff2', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-lato',
})

export const faustina = localFont({
  src: '../fonts/faustina-400-700.woff2',
  display: 'swap',
  variable: '--font-faustina',
  weight: '400 700',
})
