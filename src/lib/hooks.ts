import { useEffect, useState } from 'react'
import { mensajeError } from './format'
import { urlsFotos } from './api'

/**
 * Carga datos asíncronos y expone { datos, error, cargando, recargar }.
 * Se vuelve a ejecutar cuando cambia alguna dependencia o se llama a recargar().
 */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    fn()
      .then((d) => {
        if (!vivo) return
        setDatos(d)
        setError(null)
      })
      .catch((e) => {
        if (vivo) setError(mensajeError(e))
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return { datos, error, cargando, recargar: () => setVersion((v) => v + 1) }
}

/** Devuelve un mapa ruta -> URL firmada temporal para mostrar fotos privadas. */
export function useUrlsFotos(paths: string[]): Record<string, string> {
  const clave = paths.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let vivo = true
    if (paths.length === 0) {
      setUrls({})
      return
    }
    urlsFotos(paths)
      .then((u) => {
        if (vivo) setUrls(u)
      })
      .catch(() => {
        /* sin fotos no pasa nada */
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  return urls
}
