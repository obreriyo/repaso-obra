import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { sesionGuardada } from './local'
import { esErrorDeRed } from './sync'

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
    let vivo = true
    function cargar() {
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!vivo) return
          if (!data.session && sesionGuardada() && (error ? esErrorDeRed(error) : navigator.onLine === false)) {
            // Sin conexión y con el permiso caducado: se sigue dentro con la sesión guardada
            setSesion(sesionGuardada() as unknown as Session)
          } else if (data.session) setSesion(data.session)
          else if (!sesionGuardada() || navigator.onLine !== false) setSesion(null)
          setCargando(false)
        })
        .catch(() => {
          if (!vivo) return
          const guardada = sesionGuardada()
          if (guardada) setSesion(guardada as unknown as Session)
          setCargando(false)
        })
    }
    cargar()
    // Al recuperar la conexión se renueva el permiso
    window.addEventListener('online', cargar)

    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      // Un aviso sin sesión que no sea cerrar sesión (p. ej. renovación fallida sin internet) se ignora
      if (!nueva && evento !== 'SIGNED_OUT' && sesionGuardada()) {
        setCargando(false)
        return
      }
      setSesion(nueva)
      setCargando(false)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })

    return () => {
      vivo = false
      window.removeEventListener('online', cargar)
      data.subscription.unsubscribe()
    }
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
