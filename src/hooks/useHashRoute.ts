import { useCallback, useEffect, useState } from 'react'

export const ROUTES = ['inicio', 'vender', 'productos', 'caja', 'excel', 'ajustes'] as const
export type Route = (typeof ROUTES)[number]

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

/**
 * Navegación simple por hash (#/vender, #/productos?filtro=critico).
 * Funciona en cualquier hosting estático sin configurar el servidor.
 */
export function useHashRoute() {
  const [loc, setLoc] = useState<Location>(parse)

  useEffect(() => {
    const onChange = () => setLoc(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((route: Route, params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : ''
    window.location.hash = `/${route}${q}`
  }, [])

  return { ...loc, navigate }
}

export function navigate(route: Route, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : ''
  window.location.hash = `/${route}${q}`
}
