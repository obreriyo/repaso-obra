import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false si faltan las variables de entorno (ver README) */
export const configurado = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE: los enlaces del correo vuelven con ?code=... y no chocan con las rutas con #
    flowType: 'pkce'
  }
})
