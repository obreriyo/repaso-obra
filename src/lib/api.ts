import { supabase } from './supabase'
import { comprimir } from './images'
import type {
  Actividad,
  Bloque,
  BloqueNuevo,
  EstadoFallo,
  EstadoVivienda,
  Fallo,
  Foto,
  Invitacion,
  Miembro,
  NuevoFallo,
  Obra,
  Vivienda
} from './types'

interface Respuesta<T> {
  data: T | null
  error: { message: string } | null
}

/** Devuelve los datos o lanza un Error con el mensaje de Supabase. */
function ok<T>(r: Respuesta<T>): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

/** Lee todas las filas de una consulta, de 1000 en 1000 (límite de Supabase). */
async function leerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<Respuesta<T[]>>
): Promise<T[]> {
  const paso = 1000
  const todo: T[] = []
  for (let desde = 0; ; desde += paso) {
    const filas = ok(await consulta(desde, desde + paso - 1))
    todo.push(...filas)
    if (filas.length < paso) break
  }
  return todo
}

// ---------------------------------------------------------------- obras

export async function listObras(): Promise<Obra[]> {
  // Acepta las invitaciones pendientes de esta persona antes de listar
  await supabase.rpc('aceptar_invitaciones')
  const r = await supabase.from('obras_resumen').select('*').order('created_at', { ascending: false })
  return ok(r) as unknown as Obra[]
}

export async function getObra(id: string): Promise<Obra> {
  const r = await supabase.from('obras_resumen').select('*').eq('id', id).single()
  return ok(r) as unknown as Obra
}

export async function crearObra(
  nombre: string,
  direccion: string,
  bloques: BloqueNuevo[]
): Promise<string> {
  const r = await supabase.rpc('crear_obra', {
    p_nombre: nombre,
    p_direccion: direccion,
    p_bloques: bloques
  })
  return ok(r) as unknown as string
}

export async function borrarObra(id: string): Promise<void> {
  // Primero se borran las fotos del almacenamiento
  const fotos = await leerTodo<{ path: string }>((d, h) =>
    supabase.from('fotos').select('path').eq('obra_id', id).range(d, h)
  )
  for (let i = 0; i < fotos.length; i += 100) {
    await supabase.storage.from('fotos').remove(fotos.slice(i, i + 100).map((f) => f.path))
  }
  ok(await supabase.from('obras').delete().eq('id', id))
}

// ------------------------------------------------------ bloques / viviendas

export async function listBloques(obraId: string): Promise<Bloque[]> {
  const r = await supabase.from('bloques').select('*').eq('obra_id', obraId).order('nombre')
  return ok(r) as unknown as Bloque[]
}

export async function listViviendas(bloqueId: string): Promise<Vivienda[]> {
  const r = await supabase
    .from('viviendas_resumen')
    .select('*')
    .eq('bloque_id', bloqueId)
    .order('planta')
    .order('letra')
  return ok(r) as unknown as Vivienda[]
}

/** Todas las viviendas de la obra (para la copia de seguridad). */
export async function listViviendasObra(obraId: string): Promise<Vivienda[]> {
  return leerTodo<Vivienda>((d, h) =>
    supabase
      .from('viviendas_resumen')
      .select('*')
      .eq('obra_id', obraId)
      .order('bloque_nombre')
      .order('planta')
      .order('letra')
      .range(d, h) as unknown as PromiseLike<Respuesta<Vivienda[]>>
  )
}

export async function getVivienda(id: string): Promise<Vivienda> {
  const r = await supabase.from('viviendas_resumen').select('*').eq('id', id).single()
  return ok(r) as unknown as Vivienda
}

export async function setEstadoVivienda(id: string, estado: EstadoVivienda): Promise<void> {
  ok(await supabase.from('viviendas').update({ estado }).eq('id', id))
}

/** Al apuntar el primer fallo, la vivienda pasa de "pendiente" a "en curso". */
export async function marcarEnCurso(viviendaId: string): Promise<void> {
  await supabase
    .from('viviendas')
    .update({ estado: 'en_curso' })
    .eq('id', viviendaId)
    .eq('estado', 'pendiente')
}

// ---------------------------------------------------------------- fallos

const SELECCION_FALLO =
  '*, vivienda:viviendas(planta,letra,bloque:bloques(nombre)), editor:editado_por(nombre), creador:creado_por(nombre), fotos(id,path)'

export async function listFallos(obraId: string, viviendaId?: string): Promise<Fallo[]> {
  const filas = await leerTodo<Fallo>((desde, hasta) => {
    let q = supabase.from('fallos').select(SELECCION_FALLO).eq('obra_id', obraId)
    if (viviendaId) q = q.eq('vivienda_id', viviendaId)
    return q
      .order('created_at', { ascending: false })
      .order('id')
      .range(desde, hasta) as unknown as PromiseLike<Respuesta<Fallo[]>>
  })
  return filas
}

export async function getFallo(id: string): Promise<Fallo> {
  const r = await supabase.from('fallos').select(SELECCION_FALLO).eq('id', id).single()
  return ok(r) as unknown as Fallo
}

export async function crearFallo(datos: NuevoFallo): Promise<string> {
  const r = await supabase.from('fallos').insert(datos).select('id').single()
  const fila = ok(r) as unknown as { id: string }
  return fila.id
}

export async function actualizarFallo(
  id: string,
  cambios: Partial<Omit<NuevoFallo, 'obra_id' | 'vivienda_id'>> & { estado?: EstadoFallo }
): Promise<void> {
  ok(await supabase.from('fallos').update(cambios).eq('id', id))
}

export async function borrarFallo(id: string): Promise<void> {
  const fotos = ok(await supabase.from('fotos').select('path').eq('fallo_id', id)) as unknown as {
    path: string
  }[]
  if (fotos.length > 0) {
    await supabase.storage.from('fotos').remove(fotos.map((f) => f.path))
  }
  ok(await supabase.from('fallos').delete().eq('id', id))
}

/** Subcontratas ya usadas en la obra, para sugerirlas al escribir. */
export async function subcontratas(obraId: string): Promise<string[]> {
  const r = await supabase
    .from('fallos')
    .select('subcontrata')
    .eq('obra_id', obraId)
    .not('subcontrata', 'is', null)
    .limit(1000)
  const filas = ok(r) as unknown as { subcontrata: string }[]
  return Array.from(new Set(filas.map((f) => f.subcontrata))).sort()
}

// ----------------------------------------------------------------- fotos

export async function subirFoto(obraId: string, falloId: string, archivo: File): Promise<void> {
  const blob = await comprimir(archivo)
  const path = `${obraId}/${falloId}/${crypto.randomUUID()}.jpg`
  const subida = await supabase.storage.from('fotos').upload(path, blob, {
    contentType: 'image/jpeg'
  })
  if (subida.error) throw new Error(subida.error.message)
  ok(await supabase.from('fotos').insert({ obra_id: obraId, fallo_id: falloId, path }))
}

export async function borrarFoto(foto: Foto): Promise<void> {
  await supabase.storage.from('fotos').remove([foto.path])
  ok(await supabase.from('fotos').delete().eq('id', foto.id))
}

/** Direcciones temporales (1 hora por defecto) para ver fotos privadas. */
export async function urlsFotos(paths: string[], segundos = 3600): Promise<Record<string, string>> {
  const salida: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 100) {
    const lote = paths.slice(i, i + 100)
    const r = await supabase.storage.from('fotos').createSignedUrls(lote, segundos)
    if (r.error) throw new Error(r.error.message)
    for (const f of r.data ?? []) {
      if (f.path && f.signedUrl) salida[f.path] = f.signedUrl
    }
  }
  return salida
}

// ---------------------------------------------------------------- equipo

export async function listMiembros(obraId: string): Promise<Miembro[]> {
  const r = await supabase
    .from('obra_miembros')
    .select('user_id, profiles(nombre,cargo,email)')
    .eq('obra_id', obraId)
  return ok(r) as unknown as Miembro[]
}

export async function listInvitaciones(obraId: string): Promise<Invitacion[]> {
  const r = await supabase.from('invitaciones').select('email,created_at').eq('obra_id', obraId)
  return ok(r) as unknown as Invitacion[]
}

/** Devuelve 'anadido' si ya tenía cuenta o 'pendiente' si se registrará más tarde. */
export async function invitar(obraId: string, email: string): Promise<'anadido' | 'pendiente'> {
  const r = await supabase.rpc('invitar_miembro', { p_obra: obraId, p_email: email })
  return ok(r) as unknown as 'anadido' | 'pendiente'
}

export async function quitarMiembro(obraId: string, userId: string): Promise<void> {
  ok(await supabase.from('obra_miembros').delete().eq('obra_id', obraId).eq('user_id', userId))
}

export async function cancelarInvitacion(obraId: string, email: string): Promise<void> {
  ok(await supabase.from('invitaciones').delete().eq('obra_id', obraId).eq('email', email))
}

export async function listActividad(obraId: string, limite = 30): Promise<Actividad[]> {
  const r = await supabase
    .from('actividad')
    .select('id,texto,created_at,profiles(nombre,email)')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })
    .limit(limite)
  return ok(r) as unknown as Actividad[]
}
