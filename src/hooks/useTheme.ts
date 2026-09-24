import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'mm-pos:theme'

function initialTheme(): Theme {
  // index.html ya aplicó la clase antes de pintar; la leemos de ahí
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Tema claro/oscuro con preferencia guardada (texto plano, lo lee index.html) */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#047857')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* sin almacenamiento */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
