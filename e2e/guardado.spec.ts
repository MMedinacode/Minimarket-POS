import type { Page } from '@playwright/test'
import { agregarProducto, buscarYAgregar, crearCaja, expect, irA, test } from './helpers'

/** Claves y valores guardados en IndexedDB por la caja */
async function leerGuardado(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = indexedDB.open('minimarket-pos', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readonly')
          const store = tx.objectStore('kv')
          const out: Record<string, unknown> = {}
          const cursor = store.openCursor()
          cursor.onsuccess = () => {
            const c = cursor.result
            if (!c) return
            out[String(c.key)] = c.value
            c.continue()
          }
          tx.oncomplete = () => {
            req.result.close()
            resolve(out)
          }
        }
      }),
  )
}

async function venderUna(page: Page, numero: number) {
  await irA(page, 'Vender')
  await buscarYAgregar(page, 'Galletas Tritón')
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  const comprobante = page.getByRole('dialog', { name: new RegExp(`Venta N° ${numero} registrada`) })
  await expect(comprobante).toBeVisible()
  await comprobante.getByRole('button', { name: 'Nueva venta' }).click()
}

/** Espera a que el autoguardado escriba (corre ~200 ms después del cambio) */
async function esperarGuardado(page: Page, ok: (kv: Record<string, unknown>) => boolean) {
  await expect.poll(async () => ok(await leerGuardado(page)), { timeout: 5000 }).toBe(true)
}

test.describe('Guardado en el equipo', () => {
  test('las ventas se guardan por mes y siguen ahí al recargar', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })
    await venderUna(page, 1)
    await venderUna(page, 2)

    await esperarGuardado(page, (kv) => {
      const meses = kv['sales@meses'] as string[] | undefined
      return !!meses?.length && (kv[`sales@${meses[0]}`] as unknown[] | undefined)?.length === 2
    })
    const kv = await leerGuardado(page)
    expect(kv.sales).toBeUndefined() // ya no hay una clave con todas las ventas juntas

    await page.reload() // la sesión sigue abierta: no pide la clave
    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$3.000')).toBeVisible()
  })

  test('una caja con ventas guardadas a la antigua las conserva y las pasa al formato nuevo', async ({ page }) => {
    await crearCaja(page)
    await agregarProducto(page, { nombre: 'Galletas Tritón', precio: 1500, cuantos: '10' })
    await venderUna(page, 1)
    await venderUna(page, 2)
    await esperarGuardado(page, (kv) => Array.isArray(kv['sales@meses']))

    // Deja IndexedDB como lo guardaba la versión anterior: todas las ventas en la clave "sales"
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('minimarket-pos', 1)
          req.onsuccess = () => {
            const tx = req.result.transaction('kv', 'readwrite')
            const store = tx.objectStore('kv')
            const all = store.getAll()
            const keys = store.getAllKeys()
            tx.oncomplete = () => {
              const sales: unknown[] = []
              keys.result.forEach((k, i) => {
                if (String(k).startsWith('sales@') && k !== 'sales@meses') sales.push(...(all.result[i] as unknown[]))
              })
              const tx2 = req.result.transaction('kv', 'readwrite')
              const s2 = tx2.objectStore('kv')
              keys.result.forEach((k) => String(k).startsWith('sales@') && s2.delete(k))
              s2.put(sales, 'sales')
              tx2.oncomplete = () => {
                req.result.close()
                resolve()
              }
              tx2.onerror = () => reject(tx2.error)
            }
          }
          req.onerror = () => reject(req.error)
        }),
    )

    // Al abrir de nuevo, las 2 ventas siguen ahí
    await page.reload() // la sesión sigue abierta: no pide la clave
    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$3.000')).toBeVisible()

    // Con la próxima venta se pasan al formato nuevo y se borra la clave antigua
    await venderUna(page, 3)
    await esperarGuardado(page, (kv) => {
      const meses = kv['sales@meses'] as string[] | undefined
      return kv.sales === undefined && !!meses && meses.reduce((n, m) => n + ((kv[`sales@${m}`] as unknown[])?.length ?? 0), 0) === 3
    })
    await irA(page, 'Caja')
    await expect(page.getByText('Vendiste', { exact: true }).locator('..').getByText('$4.500')).toBeVisible()
  })
})
