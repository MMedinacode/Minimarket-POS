import type { Page } from '@playwright/test'
import { agregarProducto, buscarYAgregar, crearCaja, expect, irA, stockEnLista, test } from './helpers'

/** Cobra lo que hay en la venta y cierra el comprobante ("Nueva venta") */
async function cobrar(page: Page, numero: number) {
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  const comprobante = page.getByRole('dialog', { name: new RegExp(`Venta N° ${numero} registrada`) })
  await expect(comprobante).toBeVisible()
  await comprobante.getByRole('button', { name: 'Nueva venta' }).click()
  await expect(comprobante).toBeHidden()
}

/** Caja: abre una venta de la lista y toca "Anular venta" (sale el aviso de confirmación) */
async function pedirAnular(page: Page) {
  await irA(page, 'Caja')
  await page.getByRole('button', { name: /Ventas de hoy/ }).click()
  await page.getByRole('button', { name: /1 producto · Efectivo/ }).click()
  await page.getByRole('button', { name: 'Anular venta' }).click()
  const aviso = page.getByRole('dialog', { name: '¿Anular esta venta?' })
  await expect(aviso).toBeVisible()
  return aviso
}

test.describe('Vender (productos por unidad)', () => {
  test('vender en efectivo: baja el stock y la venta aparece en Caja', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })

    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Galletas Tritón')
    await buscarYAgregar(page, 'Galletas Tritón') // 2 unidades

    await expect(page.getByText('Total a pagar').locator('..').getByText('$3.000')).toBeVisible()
    // Paga con $5.000 (billete sugerido): el vuelto es $2.000
    await page.getByRole('button', { name: '$5.000', exact: true }).click()
    await expect(page.getByText('Vuelto', { exact: true }).locator('..').getByText('$2.000')).toBeVisible()
    await page.getByRole('button', { name: /^Cobrar/ }).click()

    // Comprobante
    const comprobante = page.getByRole('dialog', { name: /Venta N° 1 registrada/ })
    await expect(comprobante).toBeVisible()
    await expect(comprobante.getByText('Vuelto a entregar')).toBeVisible()
    await expect(comprobante.getByText('$2.000').first()).toBeVisible()
    // En efectivo el SII exige boleta: la caja lo recuerda con el monto
    await expect(comprobante.getByText(/Recuerda darle su boleta por \$3\.000/)).toBeVisible()
    await comprobante.getByRole('button', { name: 'Nueva venta' }).click()
    await expect(comprobante).toBeHidden()

    // El stock bajó de 10 a 8
    expect(await stockEnLista(page, 'Galletas Tritón')).toBe('8')

    // Y la venta aparece en Caja con el total correcto
    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$3.000')).toBeVisible()
    await expect(page.getByText('En el cajón debería haber').locator('..').getByText('$3.000')).toBeVisible()
    await page.getByRole('button', { name: /Ventas de hoy/ }).click()
    const venta = page.getByRole('button', { name: /2 productos · Efectivo/ })
    await expect(venta).toBeVisible()
    await expect(venta).toContainText('$3.000')
  })

  test('mandar el resumen del día por WhatsApp', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })
    await irA(page, 'Caja')
    // Sin ventas ni gastos no hay nada que mandar
    await expect(page.getByRole('button', { name: /Resumen por WhatsApp/ })).toBeHidden()

    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Galletas Tritón')
    await cobrar(page, 1)
    await irA(page, 'Caja')
    // No se abre WhatsApp de verdad: se anota el link que se iba a abrir
    await page.evaluate(() => {
      window.open = ((url: string) => {
        ;(window as unknown as { abierto: string }).abierto = url
        return null
      }) as typeof window.open
    })
    await page.getByRole('button', { name: /Resumen por WhatsApp/ }).click()
    const url = await page.evaluate(() => (window as unknown as { abierto: string }).abierto)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    const texto = decodeURIComponent(url.split('text=')[1])
    expect(texto).toContain('Vendiste: $1.500 (1 venta)')
    expect(texto).toContain('Galletas Tritón')
  })

  test('no deja vender más de lo que hay', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Yogurt Frutilla', precio: 500, cuantos: '1' })

    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Yogurt Frutilla')
    await buscarYAgregar(page, 'Yogurt Frutilla') // ya no queda otro
    await expect(page.getByText('Solo quedan 1 de "Yogurt Frutilla"')).toBeVisible()
    await expect(page.getByText('Total a pagar').locator('..').getByText('$500')).toBeVisible()
  })

  test('pagar con tarjeta no suma al efectivo del cajón', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Bebida Cola', precio: 1800, cuantos: '6' })

    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Bebida Cola')
    await page.getByRole('radio', { name: 'Tarjeta' }).click()
    await cobrar(page, 1)

    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$1.800')).toBeVisible()
    await expect(page.getByText('En el cajón debería haber').locator('..').getByText('$0')).toBeVisible()
    await expect(page.getByText('Tarjeta', { exact: true }).locator('..').getByText('$1.800')).toBeVisible()
  })

  test('anular una venta: el stock vuelve y la venta deja de sumar', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })

    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Galletas Tritón')
    await cobrar(page, 1)
    expect(await stockEnLista(page, 'Galletas Tritón')).toBe('9')

    // Pide confirmación antes de anular
    const aviso = await pedirAnular(page)
    await aviso.getByRole('button', { name: 'Anular venta' }).click()
    await expect(page.getByText('Venta anulada: los productos volvieron al stock')).toBeVisible()

    // Ya no suma en la caja y queda marcada como anulada
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$0')).toBeVisible()
    await expect(page.getByText('Anulada', { exact: true })).toBeVisible()

    // El stock volvió a 10
    expect(await stockEnLista(page, 'Galletas Tritón')).toBe('10')
  })

  test('cancelar el aviso de anular no cambia nada', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })
    await irA(page, 'Vender')
    await buscarYAgregar(page, 'Galletas Tritón')
    await cobrar(page, 1)

    const aviso = await pedirAnular(page)
    await aviso.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.getByText('Anulada', { exact: true })).toBeHidden()
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$1.500')).toBeVisible()
    expect(await stockEnLista(page, 'Galletas Tritón')).toBe('9')
  })
})
