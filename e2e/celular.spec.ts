import type { Locator, Page } from '@playwright/test'
import { agregarProducto, anchoSinScroll, crearCaja, enlaceMenu, expect, irA, test, type Seccion } from './helpers'

// Celular chico: 375 px de ancho (el mínimo que debe verse bien según CLAUDE.md)
test.use({ viewport: { width: 375, height: 800 } })

/** Algo que solo existe en cada sección, para saber que ya terminó de cargar (las pantallas son lazy) */
const MARCA: Record<Seccion, (page: Page) => Locator> = {
  Inicio: (page) => page.getByRole('heading', { name: '¿Qué quieres hacer?' }),
  Vender: (page) => page.getByRole('textbox', { name: 'Buscar producto', exact: true }),
  Productos: (page) => page.getByRole('textbox', { name: 'Buscar productos' }),
  Caja: (page) => page.getByRole('button', { name: 'Anotar un gasto' }),
  Más: (page) => page.getByRole('heading', { name: 'Cómo se ve' }),
}
const SECCIONES = Object.keys(MARCA) as Seccion[]

const NOMBRE_LARGO = 'Aceite de maravilla Chef botella plástica 1 litro pack familiar'

/** Caja con un producto de nombre largo y una venta hecha, para que las pantallas tengan datos de verdad */
async function cajaConDatos(page: Page) {
  await crearCaja(page, { negocio: 'Minimarket Los Aromos de la Esquina' })
  await agregarProducto(page, { nombre: NOMBRE_LARGO, precio: 12990, cuantos: '24' })
  await agregarProducto(page, { nombre: 'Tomates', precio: 3300, cuantos: '5', porKilo: true })

  // En celular el carrito se abre con "Ver venta y cobrar"
  await irA(page, 'Vender')
  await page.getByRole('button', { name: new RegExp(NOMBRE_LARGO) }).click()
  await page.getByRole('button', { name: /Ver venta y cobrar/ }).click()
  const cobro = page.getByRole('dialog', { name: 'Cobrar venta' })
  await expect(cobro).toBeVisible()
  await cobro.getByRole('button', { name: /^Cobrar/ }).click()
  await page.getByRole('dialog', { name: /Venta N° 1 registrada/ }).getByRole('button', { name: 'Nueva venta' }).click()
}

/** Recorre las 5 secciones y comprueba que ninguna se salga del ancho de la pantalla */
async function revisarSecciones(page: Page, etiqueta: string) {
  for (const seccion of SECCIONES) {
    await irA(page, seccion)
    await expect(MARCA[seccion](page)).toBeVisible()
    if (seccion === 'Caja') {
      // Con las ventas del día abiertas la pantalla es más ancha
      const ventas = page.getByRole('button', { name: /Ventas de hoy/ })
      if ((await ventas.getAttribute('aria-expanded')) !== 'true') await ventas.click()
      await page.getByRole('button', { name: /1 producto · Efectivo/ }).click()
    }
    const { scrollWidth, innerWidth } = await anchoSinScroll(page)
    expect(scrollWidth, `${etiqueta}: ${seccion} se sale del ancho (${scrollWidth} > ${innerWidth})`).toBeLessThanOrEqual(innerWidth)
  }
}

test.describe('Celular 375 px', () => {
  test('ninguna de las 5 secciones tiene scroll horizontal', async ({ page }) => {
    await cajaConDatos(page)
    expect((await anchoSinScroll(page)).innerWidth).toBe(375)
    await revisarSecciones(page, 'Letra normal')
  })

  test('con letra grande tampoco hay scroll horizontal', async ({ page }) => {
    await cajaConDatos(page)

    // Más → Cómo se ve → Tamaño de la letra → Grande
    await irA(page, 'Más')
    await page.getByRole('radiogroup', { name: 'Tamaño de la letra' }).getByRole('radio', { name: 'Grande' }).click()
    await expect(page.locator('html')).toHaveClass(/text-grande/)

    await revisarSecciones(page, 'Letra grande')

    // Volver a "Normal" quita la clase
    await irA(page, 'Más')
    await page.getByRole('radiogroup', { name: 'Tamaño de la letra' }).getByRole('radio', { name: 'Normal' }).click()
    await expect(page.locator('html')).not.toHaveClass(/text-grande/)
  })

  test('la letra grande se recuerda al recargar', async ({ page }) => {
    await crearCaja(page)
    await irA(page, 'Más')
    await page.getByRole('radio', { name: 'Grande' }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/text-grande/)
  })

  test('los botones del menú de abajo miden al menos 44 px de alto', async ({ page }) => {
    await crearCaja(page)
    for (const seccion of SECCIONES) {
      const caja = await enlaceMenu(page, seccion).boundingBox()
      expect(caja, `${seccion} no se ve`).not.toBeNull()
      expect(caja!.height, `${seccion} es muy bajo`).toBeGreaterThanOrEqual(44)
    }
  })
})
