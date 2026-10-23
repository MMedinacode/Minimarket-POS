import type { Page } from '@playwright/test'
import { CLAVE, crearCaja, expect, irA, NEGOCIO, test } from './helpers'

/** Más → Bloquear pantalla (como lo hace el dueño con el celular) */
async function bloquear(page: Page) {
  await irA(page, 'Más')
  await page.getByRole('button', { name: 'Bloquear pantalla' }).last().click()
  await expect(page.getByText('Escribe tu clave para abrir la caja')).toBeVisible()
}

test.describe('Bloquear pantalla y clave', () => {
  test('bloquear y volver a entrar con la clave', async ({ page }) => {
    await crearCaja(page)
    await bloquear(page)
    await expect(page.getByRole('heading', { name: NEGOCIO })).toBeVisible()

    await page.getByLabel('Clave', { exact: true }).fill(CLAVE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { name: 'Cómo se ve' })).toBeVisible() // vuelve a la pantalla donde estaba
  })

  test('una clave equivocada no deja entrar', async ({ page }) => {
    await crearCaja(page)
    await bloquear(page)

    await page.getByLabel('Clave', { exact: true }).fill('000111')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Clave incorrecta. Inténtalo de nuevo.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cómo se ve' })).toBeHidden()
    // Sigue pidiendo la clave, con el campo vacío
    await expect(page.getByLabel('Clave', { exact: true })).toHaveValue('')

    // Y después la correcta sí entra
    await page.getByLabel('Clave', { exact: true }).fill(CLAVE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { name: 'Cómo se ve' })).toBeVisible()
  })

  test('recargar con la pantalla bloqueada sigue pidiendo la clave', async ({ page }) => {
    await crearCaja(page)
    await bloquear(page)
    await page.reload()
    await expect(page.getByText('Escribe tu clave para abrir la caja')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cómo se ve' })).toBeHidden()
  })

  test('tras varios intentos fallidos la caja se bloquea un rato', async ({ page }) => {
    await crearCaja(page)
    await bloquear(page)
    const campo = page.getByLabel('Clave', { exact: true })
    const entrar = page.getByRole('button', { name: 'Entrar' })

    for (let i = 0; i < 5; i++) {
      await expect(campo).toBeEnabled()
      await campo.fill(`mala${i}xyz`)
      await entrar.click()
      // Espera a que se registre el intento (el campo se vacía al fallar)
      await expect(campo).toHaveValue('')
    }
    await expect(page.getByText(/Muchos intentos seguidos/)).toBeVisible()
    await expect(campo).toBeDisabled()
  })

  test('bloquear desde el menú lateral del computador', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await crearCaja(page)
    await page.getByRole('complementary').getByRole('button', { name: 'Bloquear pantalla' }).click()
    await expect(page.getByText('Escribe tu clave para abrir la caja')).toBeVisible()
    await page.getByLabel('Clave', { exact: true }).fill(CLAVE)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { name: /¡Hola!/ })).toBeVisible()
  })
})
