import type { Page } from '@playwright/test'
import { agregarProducto, crearCaja, expect, irA, test } from './helpers'

/** No se abre WhatsApp de verdad: se anota el link que se iba a abrir */
async function anotarLinks(page: Page) {
  await page.evaluate(() => {
    window.open = ((url: string) => {
      ;(window as unknown as { abierto: string }).abierto = url
      return null
    }) as typeof window.open
  })
}
const linkAbierto = (page: Page) => page.evaluate(() => (window as unknown as { abierto: string }).abierto)

test.describe('Pedido por proveedor', () => {
  test('el mensaje lleva solo lo que trae el proveedor elegido', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Bilz 1.5L', precio: 1590, cuantos: '0', proveedor: 'CCU' })
    await agregarProducto(page, { nombre: 'Hallulla bolsa', precio: 1500, cuantos: '0', proveedor: 'Panadería Luis' })

    await irA(page, 'Inicio')
    await anotarLinks(page)
    await page.getByRole('button', { name: /Pedido al proveedor/ }).click()
    const pedido = page.getByRole('dialog', { name: 'Pedido al proveedor' })
    await pedido.getByRole('button', { name: 'CCU (1)' }).click()

    await expect(pedido.getByText('Hallulla bolsa')).toBeHidden()
    await pedido.getByRole('button', { name: 'Mandar a CCU' }).click()
    let url = await linkAbierto(page)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    let texto = decodeURIComponent(url.split('text=')[1])
    expect(texto).toContain('Bilz 1.5L')
    expect(texto).not.toContain('Hallulla')

    // Con su WhatsApp guardado, el link va directo a su conversación
    await pedido.getByRole('button', { name: 'Guardar el WhatsApp de CCU' }).click()
    await pedido.getByLabel(/¿Cuál es el WhatsApp de CCU/).fill('9 1234 5678')
    await pedido.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(pedido.getByText('+56 9 1234 5678')).toBeVisible()
    await pedido.getByRole('button', { name: 'Mandar a CCU' }).click()
    url = await linkAbierto(page)
    expect(url.startsWith('https://wa.me/56912345678?text=')).toBe(true)

    // "Todos" vuelve a mostrar los dos, separados por proveedor
    await pedido.getByRole('button', { name: 'Todos (2)' }).click()
    await pedido.getByRole('button', { name: 'WhatsApp', exact: true }).click()
    texto = decodeURIComponent((await linkAbierto(page)).split('text=')[1])
    expect(texto).toContain('*CCU*')
    expect(texto).toContain('*Panadería Luis*')
  })

  test('anotar proveedores de varios productos de una vez', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Bilz 1.5L', precio: 1590, cuantos: '0' })
    await agregarProducto(page, { nombre: 'Pap 1.5L', precio: 1590, cuantos: '0' })

    await irA(page, 'Inicio')
    await page.getByRole('button', { name: /Pedido al proveedor/ }).click()
    const pedido = page.getByRole('dialog', { name: 'Pedido al proveedor' })
    await pedido.getByRole('button', { name: 'Anotar proveedores' }).click()

    const anotar = page.getByRole('dialog', { name: 'Anotar proveedores' })
    await anotar.getByLabel(/¿Quién te lo trae/).fill('CCU')
    await anotar.getByRole('button', { name: 'Marcar estos 2' }).click()
    await anotar.getByRole('button', { name: 'Guardar 2 productos' }).click()
    await expect(anotar.getByText('¡Todos tienen proveedor!')).toBeVisible()
    await anotar.getByRole('button', { name: 'Terminar' }).click()

    await expect(pedido.getByRole('button', { name: 'CCU (2)' })).toBeVisible()
  })
})
