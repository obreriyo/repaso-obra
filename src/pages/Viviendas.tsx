import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga } from '../lib/hooks'
import { ESTADO_VIVIENDA_TEXTO, mensajeError, plantaLarga, viviendaNombre } from '../lib/format'
import type { EstadoVivienda, Vivienda } from '../lib/types'

type Filtro = 'todas' | 'fallos' | 'sin'

const CLASE_ESTADO: Record<EstadoVivienda, string> = {
  pendiente: 'etq-pend',
  en_curso: 'etq-curso',
  revisada: 'etq-ok'
}

export default function Viviendas() {
  const { obraId = '' } = useParams()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const bloques = useCarga(() => api.listBloques(obraId), [obraId])
  const [elegido, setElegido] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)

  // Con internet, deja guardados en el móvil los datos de la obra para poder usarlos sin conexión
  useEffect(() => {
    void api.descargarObra(obraId, true).catch(() => {
      /* sin conexión: se usa lo que ya hay en el móvil */
    })
  }, [obraId])

  const lista = bloques.datos ?? []
  const bloqueId = elegido && lista.some((b) => b.id === elegido) ? elegido : (lista[0]?.id ?? null)

  const viviendas = useCarga(
    () => (bloqueId ? api.listViviendas(bloqueId) : Promise.resolve([] as Vivienda[])),
    [bloqueId]
  )

  const todas = viviendas.datos ?? []
  const visibles = todas.filter((v) => {
    if (filtro === 'fallos') return v.fallos_abiertos > 0
    if (filtro === 'sin') return v.estado === 'pendiente'
    return true
  })

  const revisadas = todas.filter((v) => v.estado === 'revisada').length
  const abiertos = todas.reduce((s, v) => s + v.fallos_abiertos, 0)
  const reparados = todas.reduce((s, v) => s + v.fallos_reparados, 0)
  const pendientes = todas.filter((v) => v.estado === 'pendiente').length
  const pct = todas.length > 0 ? Math.round((revisadas / todas.length) * 100) : 0
  const nombreBloque = lista.find((b) => b.id === bloqueId)?.nombre ?? ''

  async function eliminarBloque() {
    if (!bloqueId) return
    const nombre = nombreBloque || 'este bloque'
    const fallosTotal = abiertos + reparados
    const primera = window.confirm(
      `¿Eliminar «${nombre}» con sus ${todas.length} viviendas, ${fallosTotal} fallos y todas sus fotos? No se puede deshacer.`
    )
    if (!primera) return
    if (!window.confirm(`Última confirmación: se borrará «${nombre}» para siempre. ¿Seguro?`)) return
    setErrorBorrar(null)
    setBorrando(true)
    try {
      await api.borrarBloque(bloqueId)
      setElegido(null)
      bloques.recargar()
      obra.recargar()
    } catch (e) {
      setErrorBorrar(mensajeError(e))
    } finally {
      setBorrando(false)
    }
  }

  // Agrupa por planta (de la más alta a la planta baja)
  const plantas = Array.from(new Set(visibles.map((v) => v.planta))).sort((a, b) => b - a)

  return (
    <Pantalla
      obraId={obraId}
      eyebrow="Repaso final"
      titulo={obra.datos?.nombre ?? 'Obra'}
      derecha={
        <Link to="/" className="btn-cab">
          Cambiar de obra
        </Link>
      }
      cabExtra={
        <>
          {lista.length > 0 && (
            <div className="chips scroll" role="tablist" aria-label="Bloques">
              {lista.map((b) => (
                <button key={b.id} role="tab" aria-selected={b.id === bloqueId} className={`chip ${b.id === bloqueId ? 'act' : ''}`} onClick={() => setElegido(b.id)}>
                  {b.nombre}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div className="barra-texto">
              <span>{nombreBloque} · viviendas revisadas</span>
              <b style={{ color: '#fff' }}>
                {revisadas} de {todas.length}
              </b>
            </div>
            <div className="barra">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        </>
      }
    >
      <Estado cargando={obra.cargando || bloques.cargando || viviendas.cargando} error={obra.error || bloques.error || viviendas.error} />

      <div className="cifras">
        <div className="cifra">
          <span>Fallos abiertos</span>
          <b style={{ color: abiertos > 0 ? 'var(--rojo)' : undefined }}>{abiertos}</b>
        </div>
        <div className="cifra">
          <span>Reparados</span>
          <b style={{ color: 'var(--verde)' }}>{reparados}</b>
        </div>
        <div className="cifra">
          <span>Sin revisar</span>
          <b>{pendientes}</b>
        </div>
      </div>

      <div className="chips">
        <button className={`chip ${filtro === 'todas' ? 'act' : ''}`} onClick={() => setFiltro('todas')}>
          Todas
        </button>
        <button className={`chip ${filtro === 'fallos' ? 'act' : ''}`} onClick={() => setFiltro('fallos')}>
          Con fallos
        </button>
        <button className={`chip ${filtro === 'sin' ? 'act' : ''}`} onClick={() => setFiltro('sin')}>
          Sin revisar
        </button>
      </div>

      {plantas.map((p) => (
        <section key={p} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 className="grupo">{plantaLarga(p)}</h3>
          {visibles
            .filter((v) => v.planta === p)
            .map((v) => (
              <Link key={v.id} to={`/obra/${obraId}/vivienda/${v.id}`} className="fila">
                <div className={`insignia ${v.estado === 'pendiente' ? 'gris' : ''}`}>{viviendaNombre(v.planta, v.letra)}</div>
                <div className="texto">
                  <span className="titulo-fila">
                    {plantaLarga(v.planta)} · Vivienda {v.letra}
                  </span>
                  <span className="meta">
                    {v.fallos_abiertos} abiertos · {v.fallos_reparados} reparados
                  </span>
                </div>
                <span className={`etq ${CLASE_ESTADO[v.estado]}`}>{ESTADO_VIVIENDA_TEXTO[v.estado]}</span>
              </Link>
            ))}
        </section>
      ))}

      {!viviendas.cargando && visibles.length === 0 && <p className="muted">No hay viviendas con este filtro.</p>}

      <Link className="btn" to={`/obra/${obraId}/nuevo-bloque`}>
        + Añadir bloque
      </Link>

      {errorBorrar && <p className="error">{errorBorrar}</p>}
      {bloqueId && (
        <button type="button" className="btn btn-peligro" disabled={borrando} onClick={() => void eliminarBloque()}>
          {borrando ? 'Eliminando…' : `Eliminar ${nombreBloque || 'este bloque'}`}
        </button>
      )}
    </Pantalla>
  )
}
