import { agregarProducto, crearCaja, expect, filaProducto, irA, test } from './helpers'

test.describe('Productos', () => {
  test('crear un producto y verlo en la lista', async ({ page }) => {
    await crearCaja(page)
    await irA(page, 'Productos')
    await expect(page.getByText('Todavía no tienes productos')).toBeVisible()

    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })

    const fila = filaProducto(page, 'Galletas Tritón')
    await expect(fila.getByText('Quedan 10')).toBeVisible()
    await expect(fila.getByText('$1.500')).toBeVisible()
    await expect(page.getByText('Todavía no tienes productos')).toBeHidden()
  })

  test('el formulario avisa si falta el nombre o el precio', async ({ page }) => {
    await crearCaja(page)
    await irA(page, 'Productos')
    await page.getByRole('button', { name: 'Agregar el primero' }).click()
    const form = page.getByRole('dialog', { name: 'Agregar producto' })
    await form.getByRole('button', { name: 'Guardar' }).click()
    await expect(form.getByText('Escribe el nombre del producto')).toBeVisible()
    await expect(form.getByText('Escribe a cuánto lo vendes')).toBeVisible()
    // No se creó nada
    await form.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByText('Todavía no tienes productos')).toBeVisible()
  })

  test('buscar un producto en la lista', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Leche Entera', precio: 1100, cuantos: '12' })
    await agregarProducto(page, { nombre: 'Pan Hallulla', precio: 200, cuantos: '40' })

    await page.getByRole('textbox', { name: 'Buscar productos' }).fill('hallulla')
    await expect(filaProducto(page, 'Pan Hallulla')).toBeVisible()
    await expect(filaProducto(page, 'Leche Entera')).toBeHidden()
  })
})
