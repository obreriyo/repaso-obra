/**
 * Copia en el móvil de las fotos que ya se han visto (y de las que se subieron desde este móvil),
 * para no descargarlas otra vez cada vez que se abre un fallo, y poder verlas sin conexión.
 * Si se llena el espacio reservado, se borran primero las más antiguas.
 * No importa api.ts ni sync.ts (los dos dependen de esta pieza).
 */
import * as local from './local'

const PREFIJO = 'vista:'
const CLAVE_INDICE = 'fotos:indice'
/** Espacio máximo reservado para fotos vistas (unas 1.000 fotos de ~300 KB) */
export const MAX_BYTES = 300 * 1024 * 1024

type Indice = Record<string, { t: number; n: number }>

/** Ruta de la miniatura de una foto: «…/abc.jpg» → «…/abc_m.jpg» */
export function rutaMiniatura(path: string): string {
  return path.replace(/\.jpg$/i, '_m.jpg')
}

// Las escrituras van de una en una para no pisar el índice
let cola: Promise<unknown> = Promise.resolve()
function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const p = cola.then(tarea, tarea)
  cola = p.catch(() => undefined)
  return p
}

export async function leerVista(path: string): Promise<Blob | undefined> {
  return local.leerBlob(PREFIJO + path)
}

export function guardarVista(path: string, blob: Blob): Promise<void> {
  return enCola(async () => {
    const clave = PREFIJO + path
    await local.guardarBlob(clave, blob)
    const indice = (await local.getCache<Indice>(CLAVE_INDICE)) ?? {}
    indice[clave] = { t: Date.now(), n: blob.size }
    let total = Object.values(indice).reduce((s, x) => s + x.n, 0)
    if (total > MAX_BYTES) {
      const porAntiguedad = Object.entries(indice).sort((a, b) => a[1].t - b[1].t)
      for (const [k, v] of porAntiguedad) {
        if (total <= MAX_BYTES || k === clave) continue
        await local.borrarBlob(k)
        delete indice[k]
        total -= v.n
      }
    }
    await local.setCache(CLAVE_INDICE, indice)
  })
}
