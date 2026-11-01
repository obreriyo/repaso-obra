import type { EstadoVivienda, Fallo, Persona, Prioridad } from './types'

export const TIPOS = [
  'Acabado',
  'Fontanería',
  'Electricidad',
  'Carpintería',
  'Pintura',
  'Climatización',
  'Limpieza',
  'Otro'
]

export const ESTANCIAS = [
  'Cocina',
  'Salón',
  'Dormitorio 1',
  'Dormitorio 2',
  'Dormitorio 3',
  'Baño principal',
  'Baño 2',
  'Pasillo',
  'Entrada',
  'Terraza',
  'Patio',
  'Trastero',
  'Garaje'
]

export const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export const PRIORIDAD_TEXTO: Record<Prioridad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja'
}

export const ESTADO_VIVIENDA_TEXTO: Record<EstadoVivienda, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  revisada: 'Revisada'
}

/** planta 0 = planta baja; planta 100 = ático (siempre queda por encima de las demás) */
export const ATICO = 100

/** Los trasteros se guardan como "viviendas" de la planta 200; su letra es el número del trastero */
export const TRASTERO = 200

/** Orden de las plantas en pantalla (de arriba abajo): ático, plantas altas, bajo y, al final, trasteros */
export function ordenPlanta(planta: number): number {
  return planta === TRASTERO ? -1 : planta
}

export function plantaTexto(planta: number): string {
  if (planta === 0) return 'Bajo'
  if (planta === ATICO) return 'Ático'
  if (planta === TRASTERO) return 'Trastero'
  return `${planta}º`
}

export function plantaLarga(planta: number): string {
  if (planta === 0) return 'Planta baja'
  if (planta === ATICO) return 'Ático'
  if (planta === TRASTERO) return 'Trasteros'
  return `Planta ${planta}`
}

/** "2ºB", "Bajo A", "Ático A" o "Trastero 12" */
export function viviendaNombre(planta: number, letra: string): string {
  return planta === 0 || planta === ATICO || planta === TRASTERO ? `${plantaTexto(planta)} ${letra}` : `${planta}º${letra}`
}

/** Texto corto para la insignia de la lista: "2ºB", "Bajo A", "T12"… */
export function viviendaCorta(planta: number, letra: string): string {
  if (planta === TRASTERO) return /^t/i.test(letra) ? letra : `T${letra}`
  return viviendaNombre(planta, letra)
}

/** Título de la pantalla de una vivienda o trastero */
export function viviendaTitulo(planta: number, letra: string): string {
  return planta === TRASTERO ? `Trastero ${letra}` : `${plantaLarga(planta)} · Vivienda ${letra}`
}

/** "Jefe de obra", "Encargado" o el nombre del puesto escrito (Operario, Albañil…) */
export function cargoTexto(p?: Persona | null): string {
  if (p?.cargo === 'jefe_obra') return 'Jefe de obra'
  if (p?.cargo === 'otro') return (p.cargo_nombre ?? '').trim() || 'Operario'
  return 'Encargado'
}

/** "Bloque A · 2ºB" */
export function ubicacion(f: Fallo): string {
  const v = f.vivienda
  if (!v) return ''
  return `${v.bloque?.nombre ?? ''} · ${viviendaNombre(v.planta, v.letra)}`
}

export function nombrePersona(p?: Persona | null): string {
  if (!p) return 'Alguien'
  const nombre = (p.nombre ?? '').trim()
  if (nombre) return nombre
  return p.email ?? 'Alguien'
}

export function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function fechaLarga(d: Date = new Date()): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** "Residencial Los Pinos" -> "Residencial_Los_Pinos" (sin acentos ni símbolos) */
export function paraArchivo(...partes: string[]): string {
  return partes
    .filter(Boolean)
    .join('_')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function mensajeError(e: unknown): string {
  if (e instanceof Error) {
    if (/failed to fetch|networkerror|load failed|network request failed|aborted/i.test(e.message)) {
      return 'No hay conexión con el servidor. Comprueba tu internet e inténtalo de nuevo.'
    }
    return e.message
  }
  if (typeof e === 'string') return e
  return 'Ha ocurrido un error inesperado'
}
