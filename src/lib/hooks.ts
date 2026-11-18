import { useEffect, useRef, useState } from 'react'
import * as local from './local'
import { mensajeError } from './format'
import * as api from './api'
import { EVENTO_DATOS, cargarFotos, forzarProximasLecturas } from './api'

/**
 * Carga datos asíncronos y expone { datos, error, cargando, recargar }.
 * Se vuelve a ejecutar cuando cambia alguna dependencia o se llama a recargar().
 */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)
  // Tras recargar() o tras enviar cambios se piden datos frescos; al abrir se enseña antes lo guardado
  const fresco = useRef(false)
  // Cuando llegan datos nuevos en segundo plano se repinta sin volver a poner «Cargando…»
  const suave = useRef(false)

  useEffect(() => {
    let vivo = true
    if (!suave.current) setCargando(true)
    suave.current = false
    forzarProximasLecturas(fresco.current)
    fresco.current = false
    let promesa: Promise<T>
    try {
      promesa = fn()
    } finally {
      forzarProximasLecturas(false)
    }
    promesa
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

  useEffect(() => {
    const alLlegarDatos = () => {
      suave.current = true
      setVersion((v) => v + 1)
    }
    window.addEventListener(EVENTO_DATOS, alLlegarDatos)
    return () => window.removeEventListener(EVENTO_DATOS, alLlegarDatos)
  }, [])

  // Cuando se terminan de enviar los cambios pendientes, se vuelve a leer lo del servidor
  const pendientes = useRef(0)
  useEffect(() => {
    let vivo = true
    void local.contarOps().then((n) => {
      pendientes.current = n
    })
    const quitar = local.suscribir(() => {
      void local.contarOps().then((n) => {
        if (!vivo) return
        if (pendientes.current > 0 && n === 0) {
          fresco.current = true
          setVersion((v) => v + 1)
        }
        pendientes.current = n
      })
    })
    return () => {
      vivo = false
      quitar()
    }
  }, [])

  return {
    datos,
    error,
    cargando,
    recargar: () => {
      fresco.current = true
      setVersion((v) => v + 1)
    }
  }
}

/** Devuelve un mapa ruta -> URL firmada temporal para mostrar fotos privadas. */
export function useUrlsFotos(paths: string[], miniatura = false): Record<string, string> {
  const clave = paths.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let vivo = true
    if (paths.length === 0) {
      setUrls({})
      return
    }
    cargarFotos(paths, miniatura, (p, u) => {
      if (vivo) setUrls((antes) => (antes[p] === u ? antes : { ...antes, [p]: u }))
    }).catch(() => {
      /* sin fotos no pasa nada */
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, miniatura])

  return urls
}

/** Plan de la cuenta / de la obra. Mientras se desconoce se actúa como si fuera completo: el servidor bloquea lo que toque. */
export function usePlan(obraId?: string) {
  const [estado, setEstado] = useState<api.EstadoPlan | null>(null)
  useEffect(() => {
    let vivo = true
    api.estadoPlan(obraId).then((d) => vivo && setEstado(d))
    return () => {
      vivo = false
    }
  }, [obraId])
  const gratis = obraId ? estado?.plan_obra === 'gratis' : estado?.plan === 'gratis'
  return { estado, gratis: !!gratis }
}
