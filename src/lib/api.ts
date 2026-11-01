import { supabase } from './supabase'
import { comprimir } from './images'
import * as local from './local'
import { personaActiva } from './quien'
import { enLinea, esErrorDeRed, sincronizar } from './sync'
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
  Persona,
  PersonaCuenta,
  PlantaNueva,
  Subcontrata,
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

// ------------------------------------------------- caché y modo sin conexión

const SIN_DATOS =
  'Sin conexión, y estos datos todavía no están guardados en el móvil. Ábrelos una vez con internet.'

/**
 * Lee datos de Supabase y guarda una copia en el móvil. Sin conexión (o con cambios
 * pendientes de enviar) se devuelve la copia del móvil, que ya incluye lo apuntado sin conexión.
 */
async function leer<T>(clave: string, pedir: () => Promise<T>): Promise<T> {
  const pendientes = await local.contarOps()
  if (pendientes > 0 && enLinea()) {
    // Envía lo pendiente en segundo plano; mientras tanto se enseña la copia local
    const copia = await local.getCache<T>(clave)
    if (copia !== undefined) {
      void sincronizar()
      return copia
    }
    await sincronizar()
  }
  if (!enLinea()) {
    const copia = await local.getCache<T>(clave)
    if (copia !== undefined) return copia
    throw new Error(SIN_DATOS)
  }
  try {
    const datos = await pedir()
    // Si mientras tanto se apuntó algo sin enviar, no se pisa la copia local con datos viejos
    if ((await local.contarOps()) === 0) await local.setCache(clave, datos)
    else {
      const copia = await local.getCache<T>(clave)
      if (copia !== undefined) return copia
    }
    return datos
  } catch (e) {
    if (esErrorDeRed(e)) {
      const copia = await local.getCache<T>(clave)
      if (copia !== undefined) return copia
      throw new Error(SIN_DATOS)
    }
    throw e
  }
}

/** Cambia la copia local de una clave (si existe). */
async function parchear<T>(clave: string, cambio: (v: T) => T): Promise<void> {
  const v = await local.getCache<T>(clave)
  if (v === undefined) return
  await local.setCache(clave, cambio(v))
}

/** Persona que está usando la app (funciona sin conexión). */
async function yo(): Promise<Persona & { id: string }> {
  let u: { id?: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
  try {
    const { data } = await supabase.auth.getSession()
    u = data.session?.user ?? null
  } catch {
    /* sin conexión */
  }
  if (!u) u = local.sesionGuardada()?.user ?? null
  const meta = u?.user_metadata ?? {}
  const nombre = (meta.nombre as string | undefined) ?? (meta.name as string | undefined) ?? u?.email ?? null
  return { id: u?.id ?? '', nombre, email: u?.email ?? null }
}

/** Ajusta los contadores de la vivienda y de la obra en la copia local. */
async function ajustarContadores(
  obraId: string,
  viviendaId: string,
  abiertos: number,
  reparados: number
): Promise<void> {
  const v = await local.getCache<Vivienda>(`vivienda:${viviendaId}`)
  if (v) {
    const n = {
      ...v,
      fallos_abiertos: Math.max(0, v.fallos_abiertos + abiertos),
      fallos_reparados: Math.max(0, v.fallos_reparados + reparados)
    }
    await local.setCache(`vivienda:${viviendaId}`, n)
    await parchear<Vivienda[]>(`viviendas:${v.bloque_id}`, (l) => l.map((x) => (x.id === viviendaId ? n : x)))
  }
  if (abiertos !== 0) {
    const f = (o: Obra): Obra => ({ ...o, fallos_abiertos: Math.max(0, o.fallos_abiertos + abiertos) })
    await parchear<Obra>(`obra:${obraId}`, f)
    await parchear<Obra[]>('obras', (l) => l.map((o) => (o.id === obraId ? f(o) : o)))
  }
}

/** Cambia un fallo en todas las copias locales donde aparece. */
async function parchearFallo(falloId: string, cambio: (f: Fallo) => Fallo): Promise<Fallo | null> {
  const actual = await local.getCache<Fallo>(`fallo:${falloId}`)
  let nuevo: Fallo | null = null
  const aplicar = (l: Fallo[]) => l.map((f) => (f.id === falloId ? cambio(f) : f))
  if (actual) {
    nuevo = cambio(actual)
    await local.setCache(`fallo:${falloId}`, nuevo)
    await parchear<Fallo[]>(`fallos:${actual.obra_id}`, aplicar)
    await parchear<Fallo[]>(`fallos:${actual.obra_id}:${actual.vivienda_id}`, aplicar)
  }
  return nuevo
}

// ---------------------------------------------------------------- obras

async function pedirObras(): Promise<Obra[]> {
  // Acepta las invitaciones pendientes de esta persona antes de listar
  await supabase.rpc('aceptar_invitaciones')
  const r = await supabase.from('obras_resumen').select('*').order('created_at', { ascending: false })
  return ok(r) as unknown as Obra[]
}

export function listObras(): Promise<Obra[]> {
  return leer('obras', pedirObras)
}

async function pedirObra(id: string): Promise<Obra> {
  const r = await supabase.from('obras_resumen').select('*').eq('id', id).single()
  return ok(r) as unknown as Obra
}

export function getObra(id: string): Promise<Obra> {
  return leer(`obra:${id}`, () => pedirObra(id))
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

async function pedirBloques(obraId: string): Promise<Bloque[]> {
  const r = await supabase.from('bloques').select('*').eq('obra_id', obraId).order('nombre')
  return ok(r) as unknown as Bloque[]
}

export function listBloques(obraId: string): Promise<Bloque[]> {
  return leer(`bloques:${obraId}`, () => pedirBloques(obraId))
}

/** Añade un bloque (con sus viviendas) a una obra que ya existe. */
export async function crearBloque(obraId: string, nombre: string, plantas: PlantaNueva[]): Promise<string> {
  const r = await supabase.rpc('crear_bloque', { p_obra: obraId, p_nombre: nombre, p_plantas: plantas })
  return ok(r) as unknown as string
}

/** Borra un bloque con sus viviendas, fallos y fotos (también las del almacenamiento). */
export async function borrarBloque(bloqueId: string): Promise<void> {
  const viviendas = await leerTodo<{ id: string }>((d, h) =>
    supabase.from('viviendas').select('id').eq('bloque_id', bloqueId).range(d, h)
  )
  const ids = viviendas.map((v) => v.id)
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50)
    const fallos = await leerTodo<{ id: string }>((d, h) =>
      supabase.from('fallos').select('id').in('vivienda_id', lote).range(d, h)
    )
    const falloIds = fallos.map((f) => f.id)
    for (let j = 0; j < falloIds.length; j += 100) {
      const grupo = falloIds.slice(j, j + 100)
      const fotos = await leerTodo<{ path: string }>((d, h) =>
        supabase.from('fotos').select('path').in('fallo_id', grupo).range(d, h)
      )
      for (let k = 0; k < fotos.length; k += 100) {
        await supabase.storage.from('fotos').remove(fotos.slice(k, k + 100).map((f) => f.path))
      }
    }
  }
  ok(await supabase.from('bloques').delete().eq('id', bloqueId))
}

export function listViviendas(bloqueId: string): Promise<Vivienda[]> {
  return leer(`viviendas:${bloqueId}`, async () => {
    const r = await supabase
      .from('viviendas_resumen')
      .select('*')
      .eq('bloque_id', bloqueId)
      .order('planta')
      .order('letra')
    return ok(r) as unknown as Vivienda[]
  })
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

export function getVivienda(id: string): Promise<Vivienda> {
  return leer(`vivienda:${id}`, async () => {
    const r = await supabase.from('viviendas_resumen').select('*').eq('id', id).single()
    return ok(r) as unknown as Vivienda
  })
}

/** Cambia el estado de una vivienda en la copia local; devuelve el estado anterior. */
async function parchearEstadoVivienda(id: string, estado: EstadoVivienda, soloSiPendiente: boolean) {
  const v = await local.getCache<Vivienda>(`vivienda:${id}`)
  if (!v) return
  if (soloSiPendiente && v.estado !== 'pendiente') return
  if (v.estado === estado) return
  const n = { ...v, estado }
  await local.setCache(`vivienda:${id}`, n)
  await parchear<Vivienda[]>(`viviendas:${v.bloque_id}`, (l) => l.map((x) => (x.id === id ? n : x)))
  const delta = (estado === 'revisada' ? 1 : 0) - (v.estado === 'revisada' ? 1 : 0)
  if (delta !== 0) {
    const f = (o: Obra): Obra => ({ ...o, revisadas: Math.max(0, o.revisadas + delta) })
    await parchear<Obra>(`obra:${v.obra_id}`, f)
    await parchear<Obra[]>('obras', (l) => l.map((o) => (o.id === v.obra_id ? f(o) : o)))
  }
}

export async function setEstadoVivienda(id: string, estado: EstadoVivienda): Promise<void> {
  await parchearEstadoVivienda(id, estado, false)
  await local.añadirOp('vivienda_estado', { id, estado })
  void sincronizar()
}

/** Al apuntar el primer fallo, la vivienda pasa de "pendiente" a "en curso". */
export async function marcarEnCurso(viviendaId: string): Promise<void> {
  await parchearEstadoVivienda(viviendaId, 'en_curso', true)
  await local.añadirOp('vivienda_estado', { id: viviendaId, estado: 'en_curso', soloSiPendiente: true })
  void sincronizar()
}

// ---------------------------------------------------------------- fallos

const SELECCION_FALLO =
  '*, vivienda:viviendas(planta,letra,bloque:bloques(nombre)), editor:editado_por(nombre), creador:creado_por(nombre), fotos(id,path)'

async function pedirFallos(obraId: string, viviendaId?: string): Promise<Fallo[]> {
  return leerTodo<Fallo>((desde, hasta) => {
    let q = supabase.from('fallos').select(SELECCION_FALLO).eq('obra_id', obraId)
    if (viviendaId) q = q.eq('vivienda_id', viviendaId)
    return q
      .order('created_at', { ascending: false })
      .order('id')
      .range(desde, hasta) as unknown as PromiseLike<Respuesta<Fallo[]>>
  })
}

export function listFallos(obraId: string, viviendaId?: string): Promise<Fallo[]> {
  const clave = viviendaId ? `fallos:${obraId}:${viviendaId}` : `fallos:${obraId}`
  return leer(clave, () => pedirFallos(obraId, viviendaId))
}

export function getFallo(id: string): Promise<Fallo> {
  return leer(`fallo:${id}`, async () => {
    const r = await supabase.from('fallos').select(SELECCION_FALLO).eq('id', id).single()
    return ok(r) as unknown as Fallo
  })
}

export async function crearFallo(datos: NuevoFallo): Promise<string> {
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const persona = await yo()
  // Si varias personas comparten la cuenta, se guarda quién lo apunta
  const quien = personaActiva(persona.id)?.nombre ?? null
  const fila = {
    id,
    ...datos,
    estado: 'abierto' as EstadoFallo,
    created_at: ahora,
    creado_por_persona: quien,
    editado_por_persona: quien
  }
  await local.añadirOp('fallo_crear', fila)

  // Copia local para que se vea al momento, con o sin conexión
  const viv = await local.getCache<Vivienda>(`vivienda:${datos.vivienda_id}`)
  const fallo: Fallo = {
    ...fila,
    updated_at: ahora,
    vivienda: {
      planta: viv?.planta ?? 0,
      letra: viv?.letra ?? '',
      bloque: { nombre: viv?.bloque_nombre ?? '' }
    },
    editor: persona,
    creador: persona,
    fotos: []
  }
  await local.setCache(`fallo:${id}`, fallo)
  await parchear<Fallo[]>(`fallos:${datos.obra_id}`, (l) => [fallo, ...l])
  await parchear<Fallo[]>(`fallos:${datos.obra_id}:${datos.vivienda_id}`, (l) => [fallo, ...l])
  await ajustarContadores(datos.obra_id, datos.vivienda_id, 1, 0)
  void sincronizar()
  return id
}

export async function actualizarFallo(
  id: string,
  cambios: Partial<Omit<NuevoFallo, 'obra_id' | 'vivienda_id'>> & { estado?: EstadoFallo }
): Promise<void> {
  const persona = await yo()
  const quien = personaActiva(persona.id)?.nombre ?? null
  const antes = await local.getCache<Fallo>(`fallo:${id}`)
  const completos = { ...cambios, editado_por_persona: quien }
  await local.añadirOp('fallo_actualizar', { id, cambios: completos })
  await parchearFallo(id, (f) => ({ ...f, ...completos, editor: persona, updated_at: new Date().toISOString() }))
  if (antes && cambios.estado && cambios.estado !== antes.estado) {
    const abre = cambios.estado === 'abierto'
    await ajustarContadores(antes.obra_id, antes.vivienda_id, abre ? 1 : -1, abre ? -1 : 1)
  }
  void sincronizar()
}

export async function borrarFallo(id: string): Promise<void> {
  const antes = await local.getCache<Fallo>(`fallo:${id}`)
  // Lo que estaba pendiente de enviar sobre este fallo ya no hace falta
  for (const op of await local.listarOps()) {
    const d = op.datos as Record<string, any>
    const esDeEste = (op.tipo === 'fallo_actualizar' && d.id === id) || (op.tipo === 'foto_subir' && d.fallo_id === id)
    if (!esDeEste || op.id === undefined) continue
    if (op.tipo === 'foto_subir') await local.borrarBlob(d.path)
    await local.quitarOp(op.id)
  }
  await local.añadirOp('fallo_borrar', { id })
  if (antes) {
    const sin = (l: Fallo[]) => l.filter((f) => f.id !== id)
    await local.delCache(`fallo:${id}`)
    await parchear<Fallo[]>(`fallos:${antes.obra_id}`, sin)
    await parchear<Fallo[]>(`fallos:${antes.obra_id}:${antes.vivienda_id}`, sin)
    const abierto = antes.estado === 'abierto'
    await ajustarContadores(antes.obra_id, antes.vivienda_id, abierto ? -1 : 0, abierto ? 0 : -1)
  }
  void sincronizar()
}

// ----------------------------------------------------------- subcontratas

async function pedirSubcontratas(obraId: string): Promise<Subcontrata[]> {
  const r = await supabase.from('subcontratas').select('id,obra_id,nombre').eq('obra_id', obraId).order('nombre')
  return ok(r) as unknown as Subcontrata[]
}

/** Lista de subcontratas de la obra (para elegirlas con un toque al apuntar un fallo). */
export function listSubcontratas(obraId: string): Promise<Subcontrata[]> {
  return leer(`subs:${obraId}`, () => pedirSubcontratas(obraId))
}

/** Añade una subcontrata a la lista de la obra (si ya existe con ese nombre, no hace nada). */
export async function crearSubcontrata(obraId: string, nombre: string): Promise<void> {
  const limpio = nombre.trim()
  if (!limpio) return
  const actuales = (await local.getCache<Subcontrata[]>(`subs:${obraId}`)) ?? []
  if (actuales.some((s) => s.nombre.trim().toLowerCase() === limpio.toLowerCase())) return
  const id = crypto.randomUUID()
  await local.añadirOp('subcontrata_crear', { id, obra_id: obraId, nombre: limpio })
  const nueva: Subcontrata = { id, obra_id: obraId, nombre: limpio }
  await local.setCache(
    `subs:${obraId}`,
    [...actuales, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  )
  void sincronizar()
}

/** Quita una subcontrata de la lista. Los fallos ya apuntados conservan su nombre. Requiere conexión. */
export async function borrarSubcontrata(obraId: string, id: string): Promise<void> {
  if (!enLinea()) throw new Error('Para borrar una subcontrata necesitas conexión a internet.')
  ok(await supabase.from('subcontratas').delete().eq('id', id))
  await parchear<Subcontrata[]>(`subs:${obraId}`, (l) => l.filter((s) => s.id !== id))
}

// ----------------------------------------------------------------- fotos

export async function subirFoto(obraId: string, falloId: string, archivo: File): Promise<void> {
  const blob = await comprimir(archivo)
  const fotoId = crypto.randomUUID()
  const path = `${obraId}/${falloId}/${crypto.randomUUID()}.jpg`
  // La foto se guarda en el móvil y se sube en cuanto hay conexión
  await local.guardarBlob(path, blob)
  await local.añadirOp('foto_subir', { obra_id: obraId, fallo_id: falloId, foto_id: fotoId, path })
  const foto: Foto = { id: fotoId, path }
  await parchearFallo(falloId, (f) => ({ ...f, fotos: [...(f.fotos ?? []), foto] }))
  void sincronizar()
}

export async function borrarFoto(foto: Foto): Promise<void> {
  const falloId = foto.path.split('/')[1]
  // Si la foto aún no se había subido, basta con descartarla
  let pendiente = false
  for (const op of await local.listarOps()) {
    const d = op.datos as Record<string, any>
    if (op.tipo === 'foto_subir' && d.foto_id === foto.id && op.id !== undefined) {
      await local.quitarOp(op.id)
      await local.borrarBlob(d.path)
      pendiente = true
    }
  }
  if (!pendiente) await local.añadirOp('foto_borrar', { foto_id: foto.id, path: foto.path })
  if (falloId) {
    await parchearFallo(falloId, (f) => ({ ...f, fotos: (f.fotos ?? []).filter((x) => x.id !== foto.id) }))
  }
  void sincronizar()
}

const urlsLocales = new Map<string, string>()

/**
 * Direcciones para ver fotos: las que aún están solo en el móvil se enseñan desde el móvil;
 * el resto, con direcciones temporales (1 hora por defecto) de Supabase.
 */
export async function urlsFotos(paths: string[], segundos = 3600): Promise<Record<string, string>> {
  const salida: Record<string, string> = {}
  const remotas: string[] = []
  for (const p of paths) {
    const guardada = urlsLocales.get(p)
    if (guardada) {
      salida[p] = guardada
      continue
    }
    const blob = await local.leerBlob(p)
    if (blob) {
      const url = URL.createObjectURL(blob)
      urlsLocales.set(p, url)
      salida[p] = url
    } else remotas.push(p)
  }
  if (remotas.length === 0 || !enLinea()) return salida
  try {
    for (let i = 0; i < remotas.length; i += 100) {
      const lote = remotas.slice(i, i + 100)
      const r = await supabase.storage.from('fotos').createSignedUrls(lote, segundos)
      if (r.error) throw new Error(r.error.message)
      for (const f of r.data ?? []) {
        if (f.path && f.signedUrl) salida[f.path] = f.signedUrl
      }
    }
  } catch (e) {
    if (!esErrorDeRed(e)) throw e
  }
  return salida
}

// ---------------------------------------------------------------- equipo

export function listMiembros(obraId: string): Promise<Miembro[]> {
  return leer(`miembros:${obraId}`, async () => {
    const r = await supabase
      .from('obra_miembros')
      .select('user_id, profiles(nombre,cargo,cargo_nombre,email)')
      .eq('obra_id', obraId)
    return ok(r) as unknown as Miembro[]
  })
}

export function listInvitaciones(obraId: string): Promise<Invitacion[]> {
  return leer(`invitaciones:${obraId}`, async () => {
    const r = await supabase.from('invitaciones').select('email,created_at').eq('obra_id', obraId)
    return ok(r) as unknown as Invitacion[]
  })
}

/** Devuelve 'anadido' si ya tenía cuenta o 'pendiente' si se registrará más tarde. */
export async function invitar(obraId: string, email: string): Promise<'anadido' | 'pendiente'> {
  const r = await supabase.rpc('invitar_miembro', { p_obra: obraId, p_email: email })
  return ok(r) as unknown as 'anadido' | 'pendiente'
}

// ------------------------------------------- personas de una cuenta compartida

/** Personas añadidas a esta cuenta (varias personas con el mismo correo). */
export async function listPersonas(): Promise<PersonaCuenta[]> {
  const u = await yo()
  return leer(`personas:${u.id}`, async () => {
    const r = await supabase.from('personas').select('id,nombre,cargo,cargo_nombre').order('created_at')
    return ok(r) as unknown as PersonaCuenta[]
  })
}

type DatosPersona = Pick<PersonaCuenta, 'nombre' | 'cargo' | 'cargo_nombre'>

function limpiarPersona(d: DatosPersona): DatosPersona {
  const nombre = d.nombre.trim()
  if (!nombre) throw new Error('Escribe el nombre de la persona.')
  return {
    nombre,
    cargo: d.cargo,
    cargo_nombre: d.cargo === 'otro' ? d.cargo_nombre?.trim().slice(0, 40) || 'Operario' : null
  }
}

function requiereConexion() {
  if (!enLinea()) throw new Error('Para cambiar la lista de personas necesitas conexión a internet.')
}

/** Avisa al resto de la app de que la lista de personas cambió y borra su copia local. */
async function personasCambiaron(): Promise<void> {
  const u = await yo()
  await local.delCache(`personas:${u.id}`)
  window.dispatchEvent(new Event('repaso-personas'))
}

export async function crearPersona(d: DatosPersona): Promise<void> {
  requiereConexion()
  ok(await supabase.from('personas').insert(limpiarPersona(d)))
  await personasCambiaron()
}

export async function editarPersona(id: string, d: DatosPersona): Promise<void> {
  requiereConexion()
  ok(await supabase.from('personas').update(limpiarPersona(d)).eq('id', id))
  await personasCambiaron()
}

export async function borrarPersona(id: string): Promise<void> {
  requiereConexion()
  ok(await supabase.from('personas').delete().eq('id', id))
  await personasCambiaron()
}

/** Cambia el cargo de una persona (solo jefe de obra o encargado). Requiere conexión. */
export async function cambiarCargo(userId: string, cargo: string, nombre: string): Promise<void> {
  if (!enLinea()) throw new Error('Para cambiar un cargo necesitas conexión a internet.')
  ok(await supabase.rpc('cambiar_cargo', { p_user: userId, p_cargo: cargo, p_nombre: nombre }))
}

/** Añade trasteros (por número) a un bloque. Devuelve cuántos se han creado. Requiere conexión. */
export async function crearTrasteros(bloqueId: string, numeros: string[]): Promise<number> {
  const r = await supabase.rpc('crear_trasteros', { p_bloque: bloqueId, p_numeros: numeros })
  return ok(r) as unknown as number
}

export async function quitarMiembro(obraId: string, userId: string): Promise<void> {
  ok(await supabase.from('obra_miembros').delete().eq('obra_id', obraId).eq('user_id', userId))
}

export async function cancelarInvitacion(obraId: string, email: string): Promise<void> {
  ok(await supabase.from('invitaciones').delete().eq('obra_id', obraId).eq('email', email))
}

export function listActividad(obraId: string, limite = 30): Promise<Actividad[]> {
  return leer(`actividad:${obraId}`, async () => {
    const r = await supabase
      .from('actividad')
      .select('id,texto,created_at,persona,profiles(nombre,email)')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false })
      .limit(limite)
    return ok(r) as unknown as Actividad[]
  })
}

// ------------------------------------------------------ datos sin conexión

const MINUTOS_PRECARGA = 10

/** Cuándo se descargaron por última vez los datos de la obra al móvil (ms), o null. */
export async function ultimaDescarga(obraId: string): Promise<number | null> {
  return (await local.getCache<number>(`descarga:${obraId}`)) ?? null
}

/**
 * Guarda en el móvil todos los datos de la obra (viviendas, fallos, subcontratas…)
 * para poder trabajar sin conexión. Las fotos ya subidas no se guardan.
 * Con `soloSiHaceFalta` no hace nada si se descargó hace poco.
 */
export async function descargarObra(obraId: string, soloSiHaceFalta = false): Promise<boolean> {
  if (!enLinea()) throw new Error('Para descargar los datos necesitas conexión a internet.')
  if (soloSiHaceFalta) {
    const ultima = await ultimaDescarga(obraId)
    if (ultima && Date.now() - ultima < MINUTOS_PRECARGA * 60_000) return false
  }
  await sincronizar()
  if ((await local.contarOps()) > 0) return false // hay cambios sin enviar: no se pisan con datos viejos

  const obra = await pedirObra(obraId)
  const bloques = await pedirBloques(obraId)
  const viviendas = await leerTodo<Vivienda>(
    (d, h) =>
      supabase
        .from('viviendas_resumen')
        .select('*')
        .eq('obra_id', obraId)
        .order('planta')
        .order('letra')
        .range(d, h) as unknown as PromiseLike<Respuesta<Vivienda[]>>
  )
  const fallos = await pedirFallos(obraId)
  const subs = await pedirSubcontratas(obraId)

  // Si mientras tanto se apuntó algo, se deja como está
  if ((await local.contarOps()) > 0) return false

  const entradas: [string, unknown][] = [
    [`obra:${obraId}`, obra],
    [`bloques:${obraId}`, bloques],
    [`subs:${obraId}`, subs],
    [`fallos:${obraId}`, fallos]
  ]
  const porBloque = new Map<string, Vivienda[]>()
  for (const b of bloques) porBloque.set(b.id, [])
  for (const v of viviendas) {
    entradas.push([`vivienda:${v.id}`, v])
    porBloque.get(v.bloque_id)?.push(v)
  }
  for (const [bloqueId, lista] of porBloque) entradas.push([`viviendas:${bloqueId}`, lista])

  const porVivienda = new Map<string, Fallo[]>()
  for (const v of viviendas) porVivienda.set(v.id, [])
  for (const f of fallos) {
    entradas.push([`fallo:${f.id}`, f])
    porVivienda.get(f.vivienda_id)?.push(f)
  }
  for (const [viviendaId, lista] of porVivienda) entradas.push([`fallos:${obraId}:${viviendaId}`, lista])
  entradas.push([`descarga:${obraId}`, Date.now()])

  await local.setCacheVarios(entradas)
  return true
}
