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
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('IndexedDB bloqueado'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

async function idbGetAll(): Promise<Partial<Record<Key, unknown>>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out: Partial<Record<Key, unknown>> = {}
    for (const k of KEYS) {
      const req = store.get(k)
      req.onsuccess = () => {
        if (req.result !== undefined) out[k] = req.result
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

async function idbPut(entries: [Key, unknown][]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [k, v] of entries) store.put(v, k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function idbClear(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let useFallback = false

/** Lee los datos guardados. Devuelve null si es la primera vez que se abre la app. */
export async function loadData(): Promise<AppData | null> {
  let raw: Partial<Record<Key, unknown>> = {}
  try {
    raw = await idbGetAll()
  } catch {
    useFallback = true
    for (const k of KEYS) {
      try {
        const s = localStorage.getItem(LS_PREFIX + k)
        if (s !== null) raw[k] = JSON.parse(s)
      } catch {
        /* dato corrupto: se ignora */
      }
    }
  }
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

/** Guarda solo las colecciones que cambiaron. Devuelve true si escribió algo. */
export async function saveData(data: AppData): Promise<boolean> {
  const changed = KEYS.filter((k) => lastSaved.get(k) !== data[k]).map((k) => [k, data[k]] as [Key, unknown])
  if (!changed.length) return false
  if (!useFallback) {
    try {
      await idbPut(changed)
      changed.forEach(([k, v]) => lastSaved.set(k, v))
      return true
    } catch {
      useFallback = true
    }
  }
  for (const [k, v] of changed) {
    localStorage.setItem(LS_PREFIX + k, JSON.stringify(v))
    lastSaved.set(k, v)
  }
  return true
}

export async function clearData(): Promise<void> {
  lastSaved.clear()
  try {
    await idbClear()
  } catch {
    /* ignorar */
  }
  for (const k of KEYS) localStorage.removeItem(LS_PREFIX + k)
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

export function writePref(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(`mm-pos:${key}`)
    else localStorage.setItem(`mm-pos:${key}`, JSON.stringify(value))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}
