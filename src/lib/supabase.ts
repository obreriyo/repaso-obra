import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false si faltan las variables de entorno (ver README) */
export const configurado = Boolean(url && key)

/**
 * Las peticiones a la base de datos se cortan a los 20 s: con poca cobertura es mejor
 * apuntar el cambio en el móvil y enviarlo luego que dejar la pantalla colgada.
 * Las subidas de fotos (almacenamiento) no tienen límite porque pueden tardar.
 */
const conLimite: typeof fetch = (entrada, opciones) => {
  const direccion = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  if (direccion.includes('/storage/v1/')) return fetch(entrada, opciones)
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), 20000)
  const externa = opciones?.signal
  if (externa) {
    if (externa.aborted) control.abort()
    else externa.addEventListener('abort', () => control.abort())
  }
  return fetch(entrada, { ...opciones, signal: control.signal }).finally(() => clearTimeout(reloj))
}

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'sin-configurar', {
  global: { fetch: conLimite },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE: los enlaces del correo vuelven con ?code=... y no chocan con las rutas con #
    flowType: 'pkce'
  }
})
