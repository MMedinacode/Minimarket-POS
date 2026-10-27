import { crearCaja, expect, filaProducto, irA, test } from './helpers'

test.describe('Importar Excel', () => {
  test('avisa si los productos nuevos no traen cuántos hay', async ({ page }) => {
    await crearCaja(page)
    await page.goto('/#/excel')

    // Una lista de precios del proveedor: trae nombre y precio, pero no el stock
    const csv = 'Nombre;Precio\nArroz Tucapel 1 kg;1890\nFideos Carozzi 400 g;990\n'
    await page.locator('input[type="file"]').setInputFiles({
      name: 'lista-proveedor.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    })

    const dialogo = page.getByRole('dialog', { name: 'Revisar importación' })
    await expect(dialogo.getByText('2 productos van a quedar con 0 unidades')).toBeVisible()
    await dialogo.getByRole('button', { name: /Importar 2 productos/ }).click()

    await irA(page, 'Productos')
    await expect(filaProducto(page, 'Arroz Tucapel 1 kg')).toBeVisible()
  })

  test('si el Excel trae el stock no aparece el aviso', async ({ page }) => {
    await crearCaja(page)
    await page.goto('/#/excel')

    const csv = 'Nombre;Precio;Stock\nArroz Tucapel 1 kg;1890;12\n'
    await page.locator('input[type="file"]').setInputFiles({
      name: 'inventario.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    })

    const dialogo = page.getByRole('dialog', { name: 'Revisar importación' })
    await expect(dialogo.getByText('listos para importar')).toBeVisible()
    await expect(dialogo.getByText(/van a quedar con 0 unidades|va a quedar con 0 unidades/)).toBeHidden()
  })
})
