// Pruebas de la sincronización contra un PostgreSQL REAL (PGlite, corre en
// Node sin Docker) usando el mismo supabase/schema.sql que va a Supabase.
// Se simula lo que hace Supabase: auth.uid() y el rol "authenticated" con RLS.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Product, Sale } from '../../types'
import { SyncEngine, MemorySyncStorage } from './engine'
import { NetworkError, toWire, type Cursors, type PendingOp, type PullResult, type Remote } from './types'

const USER_A = '11111111-1111-1111-1111-111111111111'
const USER_B = '22222222-2222-2222-2222-222222222222'

const PRELUDE = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  end $$;
  grant usage on schema public, auth to authenticated, anon;
  insert into auth.users values ('${USER_A}'), ('${USER_B}') on conflict do nothing;
`

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(PRELUDE)
  await db.exec(readFileSync(new URL('../../../supabase/schema.sql', import.meta.url), 'utf8'))
  // Se ejecuta dos veces para comprobar que el script es re-ejecutable
  await db.exec(readFileSync(new URL('../../../supabase/schema.sql', import.meta.url), 'utf8'))
}, 60_000)

afterEach(async () => {
  await db.exec('truncate public.products, public.sales, public.expenses, public.applied_ops, public.stores')
})

/** Ejecuta una consulta como un usuario con sesión (RLS activo, como en Supabase) */
async function asUser<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user])
    await tx.query('set local role authenticated')
    const r = await tx.query<T>(sql, params)
    return r.rows
  })
}

/** "Servidor" de pruebas: mismas funciones SQL que usará Supabase */
class PgliteRemote implements Remote {
  online = true
  private listeners = new Set<() => void>()
  constructor(
    private user: string,
    private bus: Set<() => void>,
  ) {}
  async applyOps(ops: PendingOp[]) {
    if (!this.online) throw new NetworkError()
    const [row] = await asUser<{ r: { errors: [] } }>(this.user, 'select public.apply_ops($1::jsonb) as r', [
      JSON.stringify(ops.map(toWire)),
    ])
    for (const fn of this.bus) fn()
    return row.r
  }
  async pull(cursors: Cursors, overlap: number, max: number) {
    if (!this.online) throw new NetworkError()
    const [row] = await asUser<{ r: PullResult }>(this.user, 'select public.pull_changes($1::jsonb, $2, $3) as r', [
      JSON.stringify(cursors),
      overlap,
      max,
    ])
    return row.r
  }
  subscribe(onChange: () => void) {
    this.listeners.add(onChange)
    this.bus.add(onChange)
    return () => {
      this.listeners.delete(onChange)
      this.bus.delete(onChange)
    }
  }
}

const product = (over: Partial<Product> = {}): Product => ({
  id: 'coca',
  barcode: '7801',
  name: 'Coca-Cola 1.5L',
  category: 'Bebidas',
  cost: 1290,
  price: 1990,
  stock: 20,
  unit: 'un',
  rotation: 'Alta',
  minStock: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...over,
})

const sale = (id: string, qty: number, productId = 'coca'): Omit<Sale, 'number'> => ({
  id,
  date: new Date().toISOString(),
  items: [{ productId, barcode: '7801', name: 'Coca-Cola 1.5L', category: 'Bebidas', unit: 'un', qty, unitPrice: 1990, unitCost: 1290 }],
  total: 1990 * qty,
  cost: 1290 * qty,
  payment: 'Efectivo',
  received: null,
  change: null,
  voided: false,
})

/** Crea un "dispositivo" (PC o celular) de un usuario */
function device(user: string, bus = new Set<() => void>()) {
  const remote = new PgliteRemote(user, bus)
  const storage = new MemorySyncStorage()
  const failures: string[] = []
  const engine = new SyncEngine(remote, storage, (f) => failures.push(f.error))
  const stock = (id = 'coca') => engine.getSnapshot().data?.products.find((p) => p.id === id)?.stock
  return { remote, storage, engine, failures, stock }
}

describe('sincronización con PostgreSQL real', () => {
  it('dos dispositivos venden el mismo producto sin internet y el stock final es correcto', async () => {
    const bus = new Set<() => void>()
    const pc = device(USER_A, bus)
    const cel = device(USER_A, bus)
    await pc.engine.start()
    await cel.engine.start()

    pc.engine.dispatch({ type: 'addProduct', product: product({ stock: 20 }) })
    await pc.engine.syncNow()
    await cel.engine.syncNow()
    expect(cel.stock()).toBe(20)

    // Se corta internet en ambos y cada uno vende
    pc.remote.online = false
    cel.remote.online = false
    pc.engine.dispatch({ type: 'registerSale', sale: sale('v-pc', 2) })
    cel.engine.dispatch({ type: 'registerSale', sale: sale('v-cel', 3) })
    await pc.engine.syncNow()
    await cel.engine.syncNow()
    // Cada uno ve su propia venta de inmediato, aunque no haya internet
    expect(pc.stock()).toBe(18)
    expect(cel.stock()).toBe(17)
    expect(pc.engine.getSnapshot().status).toBe('offline')
    expect(pc.engine.getSnapshot().pending).toBe(1)

    // Vuelve internet: el servidor resta AMBAS ventas
    pc.remote.online = true
    cel.remote.online = true
    await pc.engine.syncNow()
    await cel.engine.syncNow()
    await pc.engine.syncNow()
    expect(pc.stock()).toBe(15)
    expect(cel.stock()).toBe(15)
    expect(pc.engine.getSnapshot().data?.sales.map((s) => s.number).sort()).toEqual([1, 2])
    expect(cel.engine.getSnapshot().pending).toBe(0)

    const [row] = await asUser<{ stock: string }>(USER_A, `select stock from products where id = 'coca'`)
    expect(Number(row.stock)).toBe(15)
    pc.engine.destroy()
    cel.engine.destroy()
  })

  it('una operación reenviada (se cortó la respuesta) se aplica una sola vez', async () => {
    const d = device(USER_A)
    await d.engine.start()
    d.engine.dispatch({ type: 'addProduct', product: product({ stock: 10 }) })
    d.engine.dispatch({ type: 'registerSale', sale: sale('v1', 4) })
    await d.engine.syncNow()
    // Reenvío manual de la misma operación (mismo opId)
    const op: PendingOp = { opId: 'dup-1', at: Date.now(), action: { type: 'registerSale', sale: sale('v2', 1) } }
    await d.remote.applyOps([op])
    await d.remote.applyOps([op])
    await d.engine.syncNow()
    expect(d.stock()).toBe(5)
    d.engine.destroy()
  })

  it('anular una venta devuelve el stock una sola vez aunque dos cajas la anulen', async () => {
    const bus = new Set<() => void>()
    const a = device(USER_A, bus)
    const b = device(USER_A, bus)
    await a.engine.start()
    a.engine.dispatch({ type: 'addProduct', product: product({ stock: 10 }) })
    a.engine.dispatch({ type: 'registerSale', sale: sale('v1', 3) })
    await a.engine.syncNow()
    await b.engine.start()
    a.engine.dispatch({ type: 'voidSale', id: 'v1' })
    b.engine.dispatch({ type: 'voidSale', id: 'v1' })
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()
    expect(a.stock()).toBe(10)
    expect(b.stock()).toBe(10)
    expect(a.engine.getSnapshot().data?.sales[0].voided).toBe(true)
    a.engine.destroy()
    b.engine.destroy()
  })

  it('editar el precio no pisa el stock que cambió otra caja', async () => {
    const bus = new Set<() => void>()
    const a = device(USER_A, bus)
    const b = device(USER_A, bus)
    await a.engine.start()
    a.engine.dispatch({ type: 'addProduct', product: product({ stock: 10 }) })
    await a.engine.syncNow()
    await b.engine.start()
    // B vende mientras A tiene abierto el formulario de edición
    b.engine.dispatch({ type: 'registerSale', sale: sale('v1', 4) })
    await b.engine.syncNow()
    a.engine.dispatch({ type: 'updateProduct', id: 'coca', patch: { price: 2090, name: 'Coca-Cola 1.5L retornable' } })
    await a.engine.syncNow()
    const p = a.engine.getSnapshot().data?.products[0]
    expect(p).toMatchObject({ price: 2090, stock: 6, name: 'Coca-Cola 1.5L retornable' })
    a.engine.destroy()
    b.engine.destroy()
  })

  it('una operación con error no bloquea la cola', async () => {
    const d = device(USER_A)
    await d.engine.start()
    // Venta con fecha inválida: el servidor la rechaza
    d.engine.dispatch({ type: 'registerSale', sale: { ...sale('mala', 1), date: 'no-es-fecha' } })
    d.engine.dispatch({ type: 'addProduct', product: product() })
    await d.engine.syncNow()
    expect(d.failures).toHaveLength(1)
    expect(d.engine.getSnapshot().pending).toBe(0)
    expect(d.engine.getSnapshot().data?.products).toHaveLength(1)
    expect(d.engine.getSnapshot().data?.sales).toHaveLength(0)
    d.engine.destroy()
  })

  it('borrados, importación "reemplazar todo" y ajustes llegan al otro dispositivo', async () => {
    const bus = new Set<() => void>()
    const a = device(USER_A, bus)
    const b = device(USER_A, bus)
    await a.engine.start()
    a.engine.dispatch({ type: 'addProduct', product: product() })
    a.engine.dispatch({ type: 'addProduct', product: product({ id: 'pan', name: 'Pan', unit: 'kg', stock: 5.5 }) })
    a.engine.dispatch({ type: 'addExpense', expense: { id: 'g1', date: new Date().toISOString(), description: 'Luz', category: 'Servicios básicos', amount: 5000, paidFromCash: false } })
    a.engine.dispatch({ type: 'updateSettings', patch: { businessName: 'Bazar Rosita' } })
    await a.engine.syncNow()
    await b.engine.start()
    expect(b.engine.getSnapshot().data?.products).toHaveLength(2)
    expect(b.engine.getSnapshot().data?.settings.businessName).toBe('Bazar Rosita')
    expect(b.engine.getSnapshot().data?.expenses[0].amount).toBe(5000)

    a.engine.dispatch({ type: 'setProducts', products: [product({ id: 'pan', name: 'Pan amasado', unit: 'kg', stock: 3.25 })] })
    a.engine.dispatch({ type: 'deleteExpense', id: 'g1' })
    await a.engine.syncNow()
    await b.engine.syncNow()
    const data = b.engine.getSnapshot().data!
    expect(data.products.map((p) => [p.name, p.stock])).toEqual([['Pan amasado', 3.25]])
    expect(data.expenses).toHaveLength(0)
    a.engine.destroy()
    b.engine.destroy()
  })

  it('ajustes de stock y venta a granel respetan los decimales', async () => {
    const d = device(USER_A)
    await d.engine.start()
    d.engine.dispatch({ type: 'addProduct', product: product({ id: 'pan', unit: 'kg', stock: 2 }) })
    d.engine.dispatch({ type: 'registerSale', sale: sale('v1', 0.35, 'pan') })
    d.engine.dispatch({ type: 'adjustStock', id: 'pan', mode: 'add', qty: 1.125 })
    await d.engine.syncNow()
    expect(d.stock('pan')).toBe(2.775)
    d.engine.destroy()
  })

  it('subir los datos del dispositivo (importAll) conserva números de venta', async () => {
    const d = device(USER_A)
    await d.engine.start()
    d.engine.dispatch({
      type: 'importAll',
      products: [product({ stock: 9 })],
      sales: [{ ...sale('vieja', 1), number: 41 }],
      expenses: [],
      settings: { businessName: 'Almacén Don Luis' } as never,
    })
    d.engine.dispatch({ type: 'registerSale', sale: sale('nueva', 1) })
    await d.engine.syncNow()
    const data = d.engine.getSnapshot().data!
    expect(data.sales.map((s) => s.number).sort((x, y) => x - y)).toEqual([41, 42])
    // La venta vieja no descuenta stock (ya estaba descontado); la nueva sí
    expect(d.stock()).toBe(8)
    d.engine.destroy()
  })

  it('cada cuenta ve solo sus datos (seguridad RLS)', async () => {
    const a = device(USER_A)
    const b = device(USER_B)
    await a.engine.start()
    a.engine.dispatch({ type: 'addProduct', product: product() })
    await a.engine.syncNow()
    await b.engine.start()
    expect(b.engine.getSnapshot().data?.products).toHaveLength(0)
    // Ni leyendo directo la tabla, ni modificando datos ajenos
    expect(await asUser(USER_B, 'select * from products')).toHaveLength(0)
    await asUser(USER_B, `update products set stock = 0 where id = 'coca'`)
    await a.engine.syncNow()
    expect(a.stock()).toBe(20)
    // Sin sesión no se puede usar la API
    await expect(asUser('', 'select public.apply_ops($1::jsonb)', ['[]'])).rejects.toThrow()
    a.engine.destroy()
    b.engine.destroy()
  })

  it('al reabrir la app offline se ve la copia local y la cola pendiente', async () => {
    const d = device(USER_A)
    await d.engine.start()
    d.engine.dispatch({ type: 'addProduct', product: product({ stock: 7 }) })
    await d.engine.syncNow()
    d.remote.online = false
    d.engine.dispatch({ type: 'registerSale', sale: sale('v1', 2) })
    await d.engine.syncNow()
    d.engine.destroy()

    // Se "cierra" la app y se abre de nuevo, todavía sin internet
    const reopened = new SyncEngine(d.remote, d.storage)
    await reopened.start()
    const snap = reopened.getSnapshot()
    expect(snap.status).toBe('offline')
    expect(snap.pending).toBe(1)
    expect(snap.data?.products[0].stock).toBe(5)
    d.remote.online = true
    await reopened.syncNow()
    expect(reopened.getSnapshot().pending).toBe(0)
    expect(reopened.getSnapshot().data?.products[0].stock).toBe(5)
    reopened.destroy()
  })
})
