import { useEffect, useState } from 'react'

export const ROUTES = ['inicio', 'vender', 'productos', 'caja', 'mas', 'reportes', 'excel', 'ajustes', 'cuenta', 'ayuda'] as const
export type Route = (typeof ROUTES)[number]

/** Pantallas que viven dentro de "Más" (el menú marca "Más" y muestran "Volver") */
export const MORE_ROUTES: readonly Route[] = ['reportes', 'excel', 'ajustes', 'cuenta', 'ayuda']

interface Location {
  route: Route
  params: URLSearchParams
}

function parse(): Location {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : 'inicio'
  return { route, params: new URLSearchParams(query) }
}

/** Ir a otra pantalla: navigate('productos', { filtro: 'critico' }) → #/productos?filtro=critico */
export function navigate(route: Route, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : ''
  window.location.hash = `/${route}${q}`
}

/**
 * Navegación simple por hash (#/vender, #/productos?filtro=critico).
 * Funciona en cualquier hosting estático sin configurar el servidor.
 */
export function useHashRoute() {
  const [loc, setLoc] = useState<Location>(parse)

  useEffect(() => {
    const onChange = () => {
      const next = parse()
      setLoc((prev) => {
        if (prev.route !== next.route) window.scrollTo(0, 0) // cada pantalla parte desde arriba
        return next
      })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return { ...loc, navigate }
}
