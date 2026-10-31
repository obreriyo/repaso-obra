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

export function plantaTexto(planta: number): string {
  if (planta === 0) return 'Bajo'
  if (planta === ATICO) return 'Ático'
  return `${planta}º`
}

export function plantaLarga(planta: number): string {
  if (planta === 0) return 'Planta baja'
  if (planta === ATICO) return 'Ático'
  return `Planta ${planta}`
}

/** "2ºB", "Bajo A" o "Ático A" */
export function viviendaNombre(planta: number, letra: string): string {
  return planta === 0 || planta === ATICO ? `${plantaTexto(planta)} ${letra}` : `${planta}º${letra}`
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
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return 'Ha ocurrido un error inesperado'
}
