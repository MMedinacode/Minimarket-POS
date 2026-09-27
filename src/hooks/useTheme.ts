import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
export type TextSize = 'normal' | 'grande'

const THEME_KEY = 'mm-pos:theme'
const SIZE_KEY = 'mm-pos:textSize'

// index.html ya aplicó las clases antes de pintar; se leen de ahí
const initialTheme = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
const initialSize = (): TextSize => (document.documentElement.classList.contains('text-grande') ? 'grande' : 'normal')

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value) // texto plano: lo lee index.html
  } catch {
    /* sin almacenamiento */
  }
}

/** Apariencia de la app en este dispositivo: tema claro/oscuro y tamaño de letra */
export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [textSize, setTextSize] = useState<TextSize>(initialSize)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#047857')
    save(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('text-grande', textSize === 'grande')
    save(SIZE_KEY, textSize)
  }, [textSize])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, setTheme, toggleTheme, textSize, setTextSize }
}
