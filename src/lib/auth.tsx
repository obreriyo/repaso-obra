import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthCtx {
  usuario: User | null
  cargando: boolean
  /** true cuando la persona llega desde el enlace de "he olvidado la contraseña" */
  recuperando: boolean
  salir: () => Promise<void>
  terminarRecuperacion: () => void
}

const Ctx = createContext<AuthCtx>({
  usuario: null,
  cargando: true,
  recuperando: false,
  salir: async () => {},
  terminarRecuperacion: () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })

    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      setSesion(nueva)
      setCargando(false)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const valor: AuthCtx = {
    usuario: sesion?.user ?? null,
    cargando,
    recuperando,
    salir: async () => {
      await supabase.auth.signOut()
    },
    terminarRecuperacion: () => setRecuperando(false)
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  return useContext(Ctx)
}
