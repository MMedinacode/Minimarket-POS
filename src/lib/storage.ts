// Persistencia local. Se usa IndexedDB (aguanta años de ventas); si el
// navegador no lo permite (ej: modo privado antiguo) se cae a localStorage.
import type { AppData } from '../types'

const DB_NAME = 'minimarket-pos'
const STORE = 'kv'
const LS_PREFIX = 'mm-pos:data:'
const KEYS = ['products', 'sales', 'expenses', 'settings', 'isDemo'] as const
type Key = (typeof KEYS)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'))
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        const db = req.result
        // Si el navegador cierra la conexión (pasa en iPhone al dejar la app en segundo plano),
        // la próxima operación abre una nueva en vez de fallar
        db.onclose = () => {
          dbPromise = null
        }
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('IndexedDB bloqueado'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** Hace una operación de IndexedDB; si falla, reabre la conexión y la intenta una vez más */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    dbPromise = null
    return await fn()
  }
}

async function idbGet(keys: readonly string[]): Promise<Record<string, unknown>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const req = store.get(k)
      req.onsuccess = () => {
        if (req.result !== undefined) out[k] = req.result
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Lectura cancelada'))
  })
}

async function idbPut(entries: [string, unknown][]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [k, v] of entries) store.put(v, k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Guardado cancelado'))
  })
}

async function idbDelete(keys: readonly string[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    for (const k of keys) tx.objectStore(STORE).delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Borrado cancelado'))
  })
}

// Cada guardado anota la hora (en IndexedDB y en la copia de localStorage). Si alguna vez
// IndexedDB falla y se guarda en localStorage, al abrir se usa la copia más nueva de las dos.
const SAVED_AT = 'savedAt'

function lsRead(key: string): unknown {
  try {
    const s = localStorage.getItem(LS_PREFIX + key)
    return s === null ? undefined : JSON.parse(s)
  } catch {
    return undefined // dato corrupto o almacenamiento bloqueado
  }
}

/** Borra la copia de respaldo de localStorage (ya está todo en IndexedDB) */
function clearLsCopy() {
  try {
    for (const k of [...KEYS, SAVED_AT]) localStorage.removeItem(LS_PREFIX + k)
  } catch {
    /* almacenamiento bloqueado: no hay copia que borrar */
  }
}

// true = la última vez IndexedDB falló (o hay datos más nuevos en localStorage):
// el próximo guardado bueno en IndexedDB escribe todo
let useFallback = false

/** Lee los datos guardados. Devuelve null si es la primera vez que se abre la app. */
export async function loadData(): Promise<AppData | null> {
  let raw: Partial<Record<Key, unknown>> = {}
  let idbSavedAt = 0
  let idbOk = true
  try {
    const got = await withRetry(() => idbGet([...KEYS, SAVED_AT]))
    idbSavedAt = Number(got[SAVED_AT] ?? 0)
    raw = got as Partial<Record<Key, unknown>>
  } catch {
    idbOk = false
  }
  // La copia de localStorage manda si IndexedDB no funciona o si es más nueva
  // (se guardó ahí durante una falla de IndexedDB)
  const lsSavedAt = Number(lsRead(SAVED_AT) ?? 0)
  const fromLs = !idbOk || lsSavedAt > idbSavedAt
  if (fromLs) {
    for (const k of KEYS) {
      const v = lsRead(k)
      if (v !== undefined) raw[k] = v
    }
  }
  useFallback = fromLs
  if (!raw.products || !raw.settings) return null
  const data: AppData = {
    products: raw.products as AppData['products'],
    sales: (raw.sales as AppData['sales']) ?? [],
    expenses: (raw.expenses as AppData['expenses']) ?? [],
    settings: raw.settings as AppData['settings'],
    isDemo: Boolean(raw.isDemo),
  }
  for (const k of KEYS) lastSaved.set(k, data[k])
  return data
}

// Recordamos la última versión guardada de cada colección para escribir solo lo que cambió
const lastSaved = new Map<Key, unknown>()

let frozen = false

/** Deja de guardar (se usa justo antes de borrar todo y recargar). false = vuelve a guardar. */
export function freezeStorage(on = true) {
  frozen = on
}

/**
 * Guarda solo las colecciones que cambiaron. Devuelve true si escribió algo.
 * Si no se puede guardar en ningún lado, LANZA un error (la app debe avisar: no se está guardando).
 */
export async function saveData(data: AppData): Promise<boolean> {
  if (frozen) return false
  const changed = KEYS.filter((k) => lastSaved.get(k) !== data[k])
  // Sin cambios no se escribe nada, salvo que haya que pasar la copia de localStorage a IndexedDB
  if (!changed.length && !useFallback) return false
  const savedAt = Date.now()
  // Saliendo de una falla se escribe todo, para que IndexedDB quede completo y al día
  const keys = useFallback ? KEYS : changed
  try {
    await withRetry(() => idbPut([...keys.map((k) => [k, data[k]] as [string, unknown]), [SAVED_AT, savedAt]]))
    keys.forEach((k) => lastSaved.set(k, data[k]))
    if (useFallback) {
      useFallback = false
      clearLsCopy()
    }
    return true
  } catch {
    useFallback = true
  }
  // IndexedDB no anda: copia COMPLETA en localStorage (si esto también falla, se lanza el error)
  for (const k of KEYS) localStorage.setItem(LS_PREFIX + k, JSON.stringify(data[k]))
  localStorage.setItem(LS_PREFIX + SAVED_AT, JSON.stringify(savedAt))
  KEYS.forEach((k) => lastSaved.set(k, data[k]))
  return true
}

/** Borra los datos de la caja de este equipo. Lanza un error si no se pudo borrar. */
export async function clearData(): Promise<void> {
  lastSaved.clear()
  await kvDelete([...KEYS, SAVED_AT])
}

// ---------- Clave-valor genérico (copia local de la cuenta en la nube) ----------
// Regla: si existe una copia en localStorage es porque el último guardado en IndexedDB falló,
// así que esa copia es la más nueva. Cada guardado bueno en IndexedDB la borra.

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const fallback = lsRead(key)
  if (fallback !== undefined) return fallback as T
  try {
    const got = await withRetry(() => idbGet([key]))
    return got[key] as T | undefined
  } catch {
    return undefined
  }
}

export async function kvSet(entries: [string, unknown][]): Promise<void> {
  try {
    await withRetry(() => idbPut(entries))
  } catch {
    // Si esto también falla, se lanza el error (quien guarda debe avisar)
    for (const [k, v] of entries) localStorage.setItem(LS_PREFIX + k, JSON.stringify(v))
    return
  }
  try {
    for (const [k] of entries) localStorage.removeItem(LS_PREFIX + k)
  } catch {
    /* almacenamiento bloqueado: no hay copia que borrar */
  }
}

/** Borra claves de los dos almacenes. Lanza un error si IndexedDB existe pero no se pudo borrar. */
export async function kvDelete(keys: string[]): Promise<void> {
  for (const k of keys) localStorage.removeItem(LS_PREFIX + k)
  if (typeof indexedDB === 'undefined') return
  await withRetry(() => idbDelete(keys))
}

/** Pide al navegador no borrar los datos cuando falte espacio (importante en una caja) */
export function requestPersistentStorage() {
  try {
    navigator.storage?.persist?.().catch(() => {})
  } catch {
    /* no soportado */
  }
}

// ---------- Preferencias pequeñas en localStorage ----------

export function readPref<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(`mm-pos:${key}`)
    return s === null ? fallback : (JSON.parse(s) as T)
  } catch {
    return fallback
  }
}

/** Guarda una preferencia chica. Devuelve false si no se pudo (almacenamiento lleno o bloqueado). */
export function writePref(key: string, value: unknown): boolean {
  try {
    if (value === undefined || value === null) localStorage.removeItem(`mm-pos:${key}`)
    else localStorage.setItem(`mm-pos:${key}`, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
