export type Prioridad = 'alta' | 'media' | 'baja'
export type EstadoFallo = 'abierto' | 'reparado'
export type EstadoVivienda = 'pendiente' | 'en_curso' | 'revisada'

export interface Obra {
  id: string
  nombre: string
  direccion: string | null
  bloques: number
  viviendas: number
  revisadas: number
  fallos_abiertos: number
}

export interface Bloque {
  id: string
  obra_id: string
  nombre: string
  plantas: number
  letras: string[]
}

export interface Vivienda {
  id: string
  obra_id: string
  bloque_id: string
  bloque_nombre: string
  planta: number
  letra: string
  estado: EstadoVivienda
  fallos_abiertos: number
  fallos_reparados: number
}

export interface Foto {
  id: string
  path: string
}

export interface Persona {
  nombre: string | null
  email?: string | null
  cargo?: string | null
  cargo_nombre?: string | null
}

export interface Fallo {
  id: string
  obra_id: string
  vivienda_id: string
  estancia: string
  tipo: string
  descripcion: string
  prioridad: Prioridad
  estado: EstadoFallo
  subcontrata: string | null
  created_at: string
  updated_at: string
  vivienda: { planta: number; letra: string; bloque: { nombre: string } }
  editor: Persona | null
  creador: Persona | null
  fotos: Foto[]
  creado_por_persona?: string | null
  editado_por_persona?: string | null
}

export interface NuevoFallo {
  obra_id: string
  vivienda_id: string
  estancia: string
  tipo: string
  descripcion: string
  prioridad: Prioridad
  subcontrata: string | null
}

/** Una persona dentro de una cuenta compartida (varias personas con el mismo correo) */
export interface PersonaCuenta {
  id: string
  nombre: string
  cargo: 'jefe_obra' | 'encargado' | 'otro'
  cargo_nombre: string | null
}

export interface Subcontrata {
  id: string
  obra_id: string
  nombre: string
}

export interface Miembro {
  user_id: string
  profiles: Persona | null
}

export interface Invitacion {
  email: string
  created_at: string
}

export interface Actividad {
  id: string
  persona?: string | null
  texto: string
  created_at: string
  profiles: Persona | null
}

/** Una planta del bloque con sus letras de vivienda (0 = bajo, 100 = ático) */
export interface PlantaNueva {
  planta: number
  letras: string[]
}

export interface BloqueNuevo {
  nombre: string
  plantas: PlantaNueva[]
}
