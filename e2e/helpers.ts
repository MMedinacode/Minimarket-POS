import { test as base, expect, type Locator, type Page } from '@playwright/test'

/** Clave de prueba (cumple las reglas: 6 o más, sin patrones fáciles) */
export const CLAVE = '482915'
export const NEGOCIO = 'Almacén de Prueba'

/**
 * `test` con una garantía extra: cualquier pedido a un sitio que no sea la
 * propia caja (localhost) se corta. Así las pruebas nunca tocan Supabase ni
 * ninguna otra red externa.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(
      (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
      (route) => route.abort(),
    )
    // Con la versión compilada (npm run test:e2e:build) rige la política de seguridad (CSP):
    // si bloquea algo de la propia caja, la prueba falla
    const bloqueos: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) bloqueos.push(msg.text())
    })
    await use(page)
    expect(bloqueos, 'La política de seguridad (CSP) bloqueó algo').toEqual([])
  },
})
export { expect }

/** Menú principal (el del celular o el del computador, el que esté a la vista) */
export const menu = (page: Page) => page.getByRole('navigation', { name: 'Principal' })

export type Seccion = 'Inicio' | 'Vender' | 'Productos' | 'Caja' | 'Más'

/** Enlace de una sección. Productos puede traer un número pegado (los que se están acabando) */
export const enlaceMenu = (page: Page, seccion: Seccion) =>
  menu(page).getByRole('link', { name: new RegExp('^' + seccion + '( \\d+)?$') })

/** Toca una de las 5 secciones del menú, como lo hace el dueño */
export async function irA(page: Page, seccion: Seccion) {
  await enlaceMenu(page, seccion).click()
  await expect(enlaceMenu(page, seccion)).toHaveAttribute('aria-current', 'page')
}

/**
 * Primera vez: pasa por el asistente (clave, nombre del negocio, "empezar con mis productos")
 * y termina en Inicio con la caja vacía.
 */
export async function crearCaja(page: Page, opciones: { negocio?: string; clave?: string } = {}) {
  const { negocio = NEGOCIO, clave = CLAVE } = opciones
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '¡Bienvenido!' })).toBeVisible()
  await page.getByRole('button', { name: 'Comenzar' }).click()

  await expect(page.getByRole('heading', { name: 'Crea tu clave' })).toBeVisible()
  await page.getByLabel('Tu clave', { exact: true }).fill(clave)
  await page.getByLabel('Escríbela otra vez').fill(clave)
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: '¿Cómo se llama tu negocio?' })).toBeVisible()
  await page.getByPlaceholder('Ej: Bazar Rosita').fill(negocio)
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible()
  await page.getByRole('button', { name: /Empezar con mis productos/ }).click()

  await expect(page.getByRole('heading', { name: /¡Hola!/ })).toBeVisible()
}

interface DatosProducto {
  nombre: string
  /** Precio en pesos (por unidad o por kilo) */
  precio: number
  /** Cuántos tiene, como lo escribiría el dueño: "10" o "5,5" */
  cuantos: string
  porKilo?: boolean
}

/** Productos → Agregar producto → llena el formulario → Guardar */
export async function agregarProducto(page: Page, p: DatosProducto) {
  await irA(page, 'Productos')
  await page.getByRole('button', { name: 'Agregar producto' }).or(page.getByRole('button', { name: 'Agregar el primero' })).first().click()
  const form = page.getByRole('dialog', { name: 'Agregar producto' })
  await expect(form).toBeVisible()

  if (p.porKilo) await form.getByRole('radio', { name: 'Kilo' }).click()
  await form.getByLabel('¿Cómo se llama?').fill(p.nombre)
  await form.getByLabel(p.porKilo ? '¿A cuánto vendes el kilo?' : '¿A cuánto lo vendes?').fill(String(p.precio))
  await form.getByLabel(p.porKilo ? '¿Cuántos kilos tienes?' : '¿Cuántos tienes?').fill(p.cuantos)
  await form.getByRole('button', { name: 'Guardar' }).click()

  await expect(form).toBeHidden()
  await expect(filaProducto(page, p.nombre)).toBeVisible()
}

/** Fila de un producto en la lista de Productos */
export function filaProducto(page: Page, nombre: string): Locator {
  return page.getByRole('listitem').filter({ hasText: nombre })
}

/** Lo que dice "Quedan …" en la fila del producto (en Productos) */
export async function stockEnLista(page: Page, nombre: string): Promise<string> {
  await irA(page, 'Productos')
  const texto = await filaProducto(page, nombre).getByText(/^Quedan /).innerText()
  return texto.replace('Quedan ', '').trim()
}

/** Vender: busca el producto y lo toca (los de unidad se suman de a 1) */
export async function buscarYAgregar(page: Page, nombre: string) {
  await page.getByRole('textbox', { name: 'Buscar producto', exact: true }).fill(nombre)
  await page.getByRole('button', { name: new RegExp(nombre) }).first().click()
}

/** Todo el ancho de la página cabe en la pantalla (sin scroll horizontal) */
export async function anchoSinScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}
