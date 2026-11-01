/**
 * Almacén local del móvil (IndexedDB): copia de los datos para verlos sin conexión,
 * cola de cambios pendientes de enviar y fotos que todavía no se han subido.
 * Si IndexedDB no está disponible se usa la memoria (no sobrevive al cerrar la app).
 */

const NOMBRE_BD = 'repaso-obra-local'
type Almacen = 'cache' | 'cola' | 'blobs'

export interface Op {
  id?: number
  tipo: string
  datos: Record<string, unknown>
  creada: number
}

// ------------------------------------------------------------ memoria (plan B)
const memCache = new Map<string, unknown>()
const memBlobs = new Map<string, Blob>()
let memCola: Op[] = []
let memSeq = 1

let bd: Promise<IDBDatabase | null> | null = null

function abrir(): Promise<IDBDatabase | null> {
  if (bd) return bd
  bd = new Promise((resolver) => {
    try {
      if (typeof indexedDB === 'undefined') return resolver(null)
      const peticion = indexedDB.open(NOMBRE_BD, 1)
      peticion.onupgradeneeded = () => {
        const db = peticion.result
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache')
        if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'id', autoIncrement: true })
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
      }
      peticion.onsuccess = () => resolver(peticion.result)
      peticion.onerror = () => resolver(null)
      peticion.onblocked = () => resolver(null)
    } catch {
      resolver(null)
    }
  })
  return bd
}

function pedir<T>(db: IDBDatabase, almacen: Almacen, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(almacen, modo)
    const r = fn(t.objectStore(almacen))
    t.oncomplete = () => resolver(r.result as T)
    t.onerror = () => rechazar(t.error ?? new Error('Error en el almacén local'))
    t.onabort = () => rechazar(t.error ?? new Error('Error en el almacén local'))
  })
}

// ------------------------------------------------------------------ avisos
const oyentes = new Set<() => void>()

/** Avisa de que algo cambió (cola, errores…). Devuelve la función para dejar de escuchar. */
export function suscribir(fn: () => void): () => void {
  oyentes.add(fn)
  return () => {
    oyentes.delete(fn)
  }
}

export function avisar(): void {
  for (const fn of Array.from(oyentes)) {
    try {
      fn()
    } catch {
      /* un oyente roto no debe parar a los demás */
    }
  }
}

// ------------------------------------------------------------------- caché
export async function getCache<T>(clave: string): Promise<T | undefined> {
  const db = await abrir()
  if (!db) return memCache.get(clave) as T | undefined
  try {
    return await pedir<T | undefined>(db, 'cache', 'readonly', (s) => s.get(clave))
  } catch {
    return undefined
  }
}

export async function setCache(clave: string, valor: unknown): Promise<void> {
  const db = await abrir()
  if (!db) {
    memCache.set(clave, valor)
    return
  }
  try {
    await pedir(db, 'cache', 'readwrite', (s) => s.put(valor, clave))
  } catch {
    memCache.set(clave, valor)
  }
}

export async function setCacheVarios(entradas: [string, unknown][]): Promise<void> {
  const db = await abrir()
  if (!db) {
    for (const [k, v] of entradas) memCache.set(k, v)
    return
  }
  try {
    await new Promise<void>((resolver, rechazar) => {
      const t = db.transaction('cache', 'readwrite')
      const s = t.objectStore('cache')
      for (const [k, v] of entradas) s.put(v, k)
      t.oncomplete = () => resolver()
      t.onerror = () => rechazar(t.error)
      t.onabort = () => rechazar(t.error)
    })
  } catch {
    for (const [k, v] of entradas) memCache.set(k, v)
  }
}

export async function delCache(clave: string): Promise<void> {
  const db = await abrir()
  if (!db) {
    memCache.delete(clave)
    return
  }
  try {
    await pedir(db, 'cache', 'readwrite', (s) => s.delete(clave))
  } catch {
    memCache.delete(clave)
  }
}

// -------------------------------------------------------------------- cola
export async function listarOps(): Promise<Op[]> {
  const db = await abrir()
  if (!db) return [...memCola]
  const todas = await pedir<Op[]>(db, 'cola', 'readonly', (s) => s.getAll())
  return todas.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
}

export async function contarOps(): Promise<number> {
  const db = await abrir()
  if (!db) return memCola.length
  return pedir<number>(db, 'cola', 'readonly', (s) => s.count())
}

export async function añadirOp(tipo: string, datos: Record<string, unknown>): Promise<void> {
  const op: Op = { tipo, datos, creada: Date.now() }
  const db = await abrir()
  if (!db) {
    memCola.push({ ...op, id: memSeq++ })
  } else {
    await pedir(db, 'cola', 'readwrite', (s) => s.add(op))
  }
  avisar()
}

export async function quitarOp(id: number): Promise<void> {
  const db = await abrir()
  if (!db) {
    memCola = memCola.filter((o) => o.id !== id)
  } else {
    await pedir(db, 'cola', 'readwrite', (s) => s.delete(id))
  }
  avisar()
}

// ------------------------------------------------------------------- fotos
export async function guardarBlob(ruta: string, blob: Blob): Promise<void> {
  const db = await abrir()
  if (!db) {
    memBlobs.set(ruta, blob)
    return
  }
  try {
    await pedir(db, 'blobs', 'readwrite', (s) => s.put(blob, ruta))
  } catch {
    memBlobs.set(ruta, blob)
  }
}

export async function leerBlob(ruta: string): Promise<Blob | undefined> {
  const db = await abrir()
  if (!db) return memBlobs.get(ruta)
  try {
    return (await pedir<Blob | undefined>(db, 'blobs', 'readonly', (s) => s.get(ruta))) ?? memBlobs.get(ruta)
  } catch {
    return memBlobs.get(ruta)
  }
}

export async function borrarBlob(ruta: string): Promise<void> {
  memBlobs.delete(ruta)
  const db = await abrir()
  if (!db) return
  try {
    await pedir(db, 'blobs', 'readwrite', (s) => s.delete(ruta))
  } catch {
    /* nada */
  }
}

// ------------------------------------------------------------------ sesión
/**
 * Sesión que Supabase guardó en el móvil. Sirve para no sacar a la persona
 * a la pantalla de entrada cuando abre la app sin conexión con el permiso caducado.
 */
export function sesionGuardada(): { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (clave && clave.startsWith('sb-') && clave.endsWith('-auth-token')) {
        const valor = JSON.parse(localStorage.getItem(clave) ?? 'null') as { user?: { id: string } } | null
        if (valor && valor.user && valor.user.id) return valor as never
      }
    }
  } catch {
    /* sin acceso */
  }
  return null
}
