/**
 * Envío de los cambios hechos en el móvil (con o sin conexión) a Supabase.
 * Cada cambio se apunta en una cola; esta pieza la vacía en orden cuando hay internet.
 * No importa api.ts (api.ts depende de esta pieza).
 */
import { supabase } from './supabase'
import * as local from './local'
import type { Op } from './local'

export interface ErrorSync {
  texto: string
  mensaje: string
  cuando: number
}

const CLAVE_ERRORES = 'sync:errores'

let sincronizando = false
let errores: ErrorSync[] = []
let erroresCargados = false

export function enLinea(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** ¿El fallo es por falta de conexión (y por tanto hay que reintentar más tarde)? */
export function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = (e instanceof Error ? e.message : typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? '')).toLowerCase()
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted|abort|timeout|timed out|err_internet|err_network|offline|sin conexi/.test(m)
}

function esPermisoCaducado(e: { message?: string; status?: number } | null | undefined): boolean {
  if (!e) return false
  return e.status === 401 || /jwt expired|jwt is expired|invalid jwt|token is expired/i.test(e.message ?? '')
}

export function estadoSync() {
  return { sincronizando, errores }
}

async function cargarErrores() {
  if (erroresCargados) return
  erroresCargados = true
  errores = (await local.getCache<ErrorSync[]>(CLAVE_ERRORES)) ?? []
}

export async function listarErrores(): Promise<ErrorSync[]> {
  await cargarErrores()
  return errores
}

export async function limpiarErrores(): Promise<void> {
  errores = []
  await local.setCache(CLAVE_ERRORES, errores)
  local.avisar()
}

async function anotarError(texto: string, mensaje: string) {
  await cargarErrores()
  errores = [...errores, { texto, mensaje, cuando: Date.now() }].slice(-20)
  await local.setCache(CLAVE_ERRORES, errores)
}

function describir(op: Op): string {
  const d = op.datos as Record<string, string | undefined>
  switch (op.tipo) {
    case 'fallo_crear':
      return `Fallo nuevo «${(d.descripcion ?? '').slice(0, 40)}»`
    case 'fallo_actualizar':
      return 'Cambios en un fallo'
    case 'fallo_borrar':
      return 'Eliminar un fallo'
    case 'foto_subir':
      return 'Subir una foto'
    case 'foto_borrar':
      return 'Quitar una foto'
    case 'vivienda_estado':
      return 'Estado de una vivienda'
    case 'subcontrata_crear':
      return `Subcontrata «${d.nombre ?? ''}»`
    default:
      return op.tipo
  }
}

interface ErrSb {
  message: string
  code?: string
  status?: number
}

/** Resultado de ejecutar una operación: ok, o error (con el motivo). */
async function ejecutar(op: Op): Promise<ErrSb | null> {
  const d = op.datos as Record<string, any>
  switch (op.tipo) {
    case 'fallo_crear': {
      const r = await supabase.from('fallos').insert(d)
      // 23505 = ya existe (se envió antes y la respuesta no llegó): vale
      if (r.error && (r.error as ErrSb).code !== '23505') return r.error as ErrSb
      return null
    }
    case 'fallo_actualizar': {
      const r = await supabase.from('fallos').update(d.cambios).eq('id', d.id)
      return (r.error as ErrSb | null) ?? null
    }
    case 'fallo_borrar': {
      const f = await supabase.from('fotos').select('path').eq('fallo_id', d.id)
      if (f.error) return f.error as ErrSb
      const rutas = (f.data ?? []).map((x: { path: string }) => x.path)
      if (rutas.length > 0) {
        const q = await supabase.storage.from('fotos').remove(rutas)
        if (q.error) return q.error as unknown as ErrSb
      }
      const r = await supabase.from('fallos').delete().eq('id', d.id)
      return (r.error as ErrSb | null) ?? null
    }
    case 'foto_subir': {
      const blob = await local.leerBlob(d.path)
      if (!blob) return null // la foto ya no existe en el móvil (se quitó antes de subirla)
      const s = await supabase.storage.from('fotos').upload(d.path, blob, { contentType: 'image/jpeg', upsert: true })
      if (s.error) return s.error as unknown as ErrSb
      const r = await supabase.from('fotos').insert({ id: d.foto_id, obra_id: d.obra_id, fallo_id: d.fallo_id, path: d.path })
      const codigo = (r.error as ErrSb | null)?.code
      if (r.error && codigo !== '23505') {
        // 23503 = el fallo ya no existe: se limpia la foto subida y se da por hecho
        if (codigo === '23503') {
          await supabase.storage.from('fotos').remove([d.path])
          await local.borrarBlob(d.path)
          return null
        }
        return r.error as ErrSb
      }
      await local.borrarBlob(d.path)
      return null
    }
    case 'foto_borrar': {
      const q = await supabase.storage.from('fotos').remove([d.path])
      if (q.error) return q.error as unknown as ErrSb
      const r = await supabase.from('fotos').delete().eq('id', d.foto_id)
      return (r.error as ErrSb | null) ?? null
    }
    case 'vivienda_estado': {
      let q = supabase.from('viviendas').update({ estado: d.estado }).eq('id', d.id)
      if (d.soloSiPendiente) q = q.eq('estado', 'pendiente')
      const r = await q
      return (r.error as ErrSb | null) ?? null
    }
    case 'subcontrata_crear': {
      const r = await supabase
        .from('subcontratas')
        .upsert({ id: d.id, obra_id: d.obra_id, nombre: d.nombre }, { onConflict: 'obra_id,nombre', ignoreDuplicates: true })
      return (r.error as ErrSb | null) ?? null
    }
    default:
      return null // operación desconocida: se descarta
  }
}

async function vaciarCola(): Promise<void> {
  await cargarErrores()
  if (!enLinea()) return
  // Si el permiso caducó mientras no había conexión, esto lo renueva
  try {
    await supabase.auth.getSession()
  } catch {
    /* se reintentará */
  }

  for (;;) {
    const ops = await local.listarOps()
    const op = ops[0]
    if (!op || op.id === undefined) break

    let fallo: ErrSb | null
    try {
      fallo = await ejecutar(op)
    } catch (e) {
      fallo = { message: e instanceof Error ? e.message : String(e) }
    }

    if (!fallo) {
      await local.quitarOp(op.id)
      continue
    }
    if (esErrorDeRed(fallo) || esPermisoCaducado(fallo)) break // se reintenta luego

    // Error "de verdad" (permisos, datos…): se descarta para no bloquear el resto y se avisa
    await anotarError(describir(op), fallo.message)
    await local.quitarOp(op.id)
  }
  local.avisar()
}

let enCurso: Promise<void> | null = null

/** Envía los cambios pendientes. Si ya hay un envío en marcha, espera a ese. */
export function sincronizar(): Promise<void> {
  if (enCurso) return enCurso
  sincronizando = true
  local.avisar()
  enCurso = vaciarCola()
    .catch(() => {
      /* se reintentará */
    })
    .finally(() => {
      sincronizando = false
      enCurso = null
      local.avisar()
    })
  return enCurso
}
