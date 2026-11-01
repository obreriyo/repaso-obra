/**
 * Quién está usando la app en este móvil cuando varias personas comparten un correo.
 * Se guarda en el móvil, sin conexión, y se recuerda hasta que se cambie.
 */
import type { PersonaCuenta } from './types'

const CLAVE = 'repaso-quien'

interface Guardado {
  userId: string
  /** null = «soy el titular de la cuenta», sin persona */
  persona: PersonaCuenta | null
}

function leer(): Guardado | null {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Guardado | null
  } catch {
    return null
  }
}

/** ¿Ya se eligió quién es en este móvil para esta cuenta? */
export function hayEleccion(userId: string): boolean {
  const g = leer()
  return Boolean(g && g.userId === userId)
}

/** Persona elegida en este móvil (o null si es el titular o aún no se eligió). */
export function personaActiva(userId: string | null | undefined): PersonaCuenta | null {
  const g = leer()
  if (!userId || !g || g.userId !== userId) return null
  return g.persona
}

export function elegirPersona(userId: string, persona: PersonaCuenta | null): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ userId, persona } satisfies Guardado))
  } catch {
    /* sin almacenamiento: se preguntará de nuevo */
  }
  window.dispatchEvent(new Event('repaso-quien'))
}

export function olvidarEleccion(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* nada */
  }
  window.dispatchEvent(new Event('repaso-quien'))
}

/** Pide a la pantalla «¿Quién eres?» que se abra para cambiar de persona. */
export function abrirSelector(): void {
  window.dispatchEvent(new Event('repaso-quien-abrir'))
}
