import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import * as local from '../lib/local'
import { enLinea, estadoSync, limpiarErrores, listarErrores, sincronizar } from '../lib/sync'
import type { ErrorSync } from '../lib/sync'
import { esNativa } from '../lib/nativo'

/**
 * Franja fija arriba: avisa de que no hay conexión, de los cambios pendientes de enviar
 * y de los que no se pudieron enviar. También lanza el envío cuando vuelve internet.
 */
export default function EstadoSync() {
  const { usuario } = useAuth()
  const [pendientes, setPendientes] = useState(0)
  const [conexion, setConexion] = useState(enLinea())
  const [sincronizando, setSincronizando] = useState(false)
  const [errores, setErrores] = useState<ErrorSync[]>([])
  const [verErrores, setVerErrores] = useState(false)

  useEffect(() => {
    let vivo = true
    async function refrescar() {
      const n = await local.contarOps()
      const e = await listarErrores()
      if (!vivo) return
      setPendientes(n)
      setErrores([...e])
      setSincronizando(estadoSync().sincronizando)
    }
    void refrescar()
    const quitar = local.suscribir(() => void refrescar())
    return () => {
      vivo = false
      quitar()
    }
  }, [])

  useEffect(() => {
    if (!usuario) return
    const alConectar = () => {
      setConexion(true)
      void sincronizar()
    }
    const alDesconectar = () => setConexion(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    void sincronizar()

    // Reintento cada minuto mientras haya cosas pendientes (cobertura floja)
    const reloj = setInterval(() => {
      void local.contarOps().then((n) => {
        if (n > 0) void sincronizar()
      })
    }, 60_000)

    // En el APK: al volver a abrir la app también se envía lo pendiente
    let quitarApp: (() => void) | null = null
    let cancelado = false
    if (esNativa()) {
      void import('@capacitor/app').then(({ App }) =>
        App.addListener('appStateChange', (estado) => {
          if (estado.isActive) {
            setConexion(enLinea())
            void sincronizar()
          }
        }).then((escucha) => {
          if (cancelado) void escucha.remove()
          else quitarApp = () => void escucha.remove()
        })
      )
    }

    return () => {
      cancelado = true
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
      clearInterval(reloj)
      if (quitarApp) quitarApp()
    }
  }, [usuario])

  const visible = Boolean(usuario) && !(conexion && pendientes === 0 && errores.length === 0)

  // Deja sitio arriba para que la franja no tape la cabecera
  useEffect(() => {
    document.body.style.paddingTop = visible ? 'calc(28px + env(safe-area-inset-top))' : ''
    return () => {
      document.body.style.paddingTop = ''
    }
  }, [visible])

  if (!visible) return null

  let texto: string
  let clase = 'sync-aviso'
  if (!conexion) {
    texto = pendientes > 0 ? `Sin conexión · ${pendientes} cambio${pendientes === 1 ? '' : 's'} guardado${pendientes === 1 ? '' : 's'} en el móvil` : 'Sin conexión · puedes seguir trabajando'
    clase += ' sync-off'
  } else if (pendientes > 0) {
    texto = sincronizando ? `Enviando ${pendientes} cambio${pendientes === 1 ? '' : 's'}…` : `${pendientes} cambio${pendientes === 1 ? '' : 's'} por enviar`
  } else {
    texto = `${errores.length} cambio${errores.length === 1 ? '' : 's'} no se pudo enviar`
    clase += ' sync-error'
  }

  return (
    <>
      <div className={clase} role="status">
        <span>{texto}</span>
        {conexion && pendientes > 0 && !sincronizando && (
          <button type="button" onClick={() => void sincronizar()}>
            Enviar ahora
          </button>
        )}
        {errores.length > 0 && (
          <button type="button" onClick={() => setVerErrores((v) => !v)}>
            {verErrores ? 'Ocultar' : 'Ver'}
          </button>
        )}
      </div>
      {verErrores && errores.length > 0 && (
        <div className="sync-detalle">
          {errores.map((e, i) => (
            <p key={i}>
              <b>{e.texto}:</b> {e.mensaje}
            </p>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => {
              void limpiarErrores()
              setVerErrores(false)
            }}
          >
            Entendido
          </button>
        </div>
      )}
    </>
  )
}
