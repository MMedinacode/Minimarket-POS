import { CLAVE, crearCaja, expect, NEGOCIO, test } from './helpers'

test.describe('Primera vez', () => {
  test('crear la clave y llegar a Inicio', async ({ page }) => {
    await crearCaja(page)

    // Inicio con la caja vacía y el nombre del negocio arriba
    await expect(page.getByRole('heading', { name: '¿Qué quieres hacer?' })).toBeVisible()
    await expect(page.getByText(NEGOCIO).first()).toBeVisible()
    await expect(page.getByText('Vendiste hoy')).toBeVisible()
    await expect(page.getByRole('button', { name: /Vender/ }).first()).toBeVisible()
  })

  test('el asistente rechaza claves fáciles o que no coinciden', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Comenzar' }).click()
    const clave1 = page.getByLabel('Tu clave', { exact: true })
    const clave2 = page.getByLabel('Escríbela otra vez')
    const siguiente = page.getByRole('button', { name: 'Siguiente' })

    // Muy fácil de adivinar
    await clave1.fill('123456')
    await clave2.fill('123456')
    await siguiente.click()
    await expect(page.getByRole('alert')).toContainText('No uses números seguidos')

    // Dos claves distintas
    await clave1.fill(CLAVE)
    await clave2.fill('999123')
    await siguiente.click()
    await expect(page.getByRole('alert')).toContainText('Las dos claves no son iguales')

    // Sigue en el paso de la clave: no avanzó
    await expect(page.getByRole('heading', { name: 'Crea tu clave' })).toBeVisible()
  })

  test('recargar la página con la sesión abierta no vuelve a pedir la clave', async ({ page }) => {
    await crearCaja(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: /¡Hola!/ })).toBeVisible()
  })
})
