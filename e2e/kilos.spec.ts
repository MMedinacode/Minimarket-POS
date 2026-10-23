import { agregarProducto, crearCaja, expect, irA, stockEnLista, test } from './helpers'

test.describe('Vender por kilo', () => {
  test('0,5 kg y 1.250 (= 1,25 kg): total y stock correctos', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Tomates', precio: 3300, cuantos: '5', porKilo: true })
    // En la lista se ve que es por kilo
    expect(await stockEnLista(page, 'Tomates')).toBe('5 kg')

    await irA(page, 'Vender')
    const total = page.getByText('Total a pagar').locator('..')
    const cobrar = page.getByRole('button', { name: /^Cobrar/ })

    // Venta 1: medio kilo escrito con coma
    await page.getByRole('button', { name: /Tomates/ }).click()
    const peso = page.getByRole('dialog', { name: 'Tomates' })
    await expect(peso.getByText(/quedan 5 kg/)).toBeVisible()
    await peso.getByLabel('Peso en kilos').fill('0,5')
    await expect(peso.getByRole('button', { name: /Agregar \$1\.650/ })).toBeVisible()
    await peso.getByRole('button', { name: /Agregar/ }).click()
    await expect(total.getByText('$1.650')).toBeVisible()
    await cobrar.click()
    await page.getByRole('dialog', { name: /Venta N° 1 registrada/ }).getByRole('button', { name: 'Nueva venta' }).click()

    // Venta 2: "1.250" en kilos es 1,25 kg (no mil doscientos cincuenta)
    await page.getByRole('button', { name: /Tomates/ }).click()
    const peso2 = page.getByRole('dialog', { name: 'Tomates' })
    await expect(peso2.getByText(/quedan 4,5 kg/)).toBeVisible()
    await peso2.getByLabel('Peso en kilos').fill('1.250')
    await expect(peso2.getByRole('button', { name: /Agregar \$4\.125/ })).toBeVisible()
    await peso2.getByRole('button', { name: /Agregar/ }).click()
    await expect(total.getByText('$4.125')).toBeVisible()
    await cobrar.click()
    const comprobante = page.getByRole('dialog', { name: /Venta N° 2 registrada/ })
    await expect(comprobante.getByText('1,25 kg ×')).toBeVisible()
    await comprobante.getByRole('button', { name: 'Nueva venta' }).click()

    // Stock: 5 - 0,5 - 1,25 = 3,25 kg
    expect(await stockEnLista(page, 'Tomates')).toBe('3,25 kg')

    // Caja: 1.650 + 4.125 = 5.775
    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$5.775')).toBeVisible()
    await expect(page.getByText('2 ventas', { exact: true }).first()).toBeVisible()
  })

  test('no deja vender más kilos de los que hay', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Manzanas', precio: 1990, cuantos: '2', porKilo: true })
    await irA(page, 'Vender')
    await page.getByRole('button', { name: /Manzanas/ }).click()
    await page.getByLabel('Peso en kilos').fill('2,5')
    await page.getByRole('button', { name: /Agregar/ }).click()
    await expect(page.getByText('Solo quedan 2 kg de "Manzanas"')).toBeVisible()
  })

  test('el botón rápido "500 g" y anular devuelven los kilos', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Papas', precio: 1200, cuantos: '10', porKilo: true })
    await irA(page, 'Vender')
    await page.getByRole('button', { name: /Papas/ }).click()
    await page.getByRole('button', { name: '500 g' }).click()
    await expect(page.getByLabel('Peso en kilos')).toHaveValue('0,5')
    await page.getByRole('button', { name: /Agregar \$600/ }).click()
    await page.getByRole('button', { name: /^Cobrar/ }).click()
    await page.getByRole('dialog', { name: /Venta N° 1 registrada/ }).getByRole('button', { name: 'Nueva venta' }).click()
    expect(await stockEnLista(page, 'Papas')).toBe('9,5 kg')

    await irA(page, 'Caja')
    await page.getByRole('button', { name: /Ventas de hoy/ }).click()
    await page.getByRole('button', { name: /1 producto · Efectivo/ }).click()
    await page.getByRole('button', { name: 'Anular venta' }).click()
    await page.getByRole('dialog', { name: '¿Anular esta venta?' }).getByRole('button', { name: 'Anular venta' }).click()
    expect(await stockEnLista(page, 'Papas')).toBe('10 kg')
  })
})
