import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ExportDialog from '../components/ExportDialog'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga, useUrlsFotos } from '../lib/hooks'
import { ESTADO_VIVIENDA_TEXTO, PRIORIDAD_TEXTO, mensajeError, plantaLarga, viviendaNombre } from '../lib/format'
import type { EstadoVivienda, Fallo } from '../lib/types'

const ESTADOS: EstadoVivienda[] = ['pendiente', 'en_curso', 'revisada']

export default function Vivienda() {
  const { obraId = '', viviendaId = '' } = useParams()
  const viv = useCarga(() => api.getVivienda(viviendaId), [viviendaId])
  const fallos = useCarga(() => api.listFallos(obraId, viviendaId), [obraId, viviendaId])
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const [exportar, setExportar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lista = fallos.datos ?? []
  const urls = useUrlsFotos(lista.filter((f) => f.fotos?.length > 0).map((f) => f.fotos[0].path))

  const estancias = Array.from(new Set(lista.map((f) => f.estancia))).sort((a, b) => a.localeCompare(b, 'es'))
  const v = viv.datos
  const nombre = v ? viviendaNombre(v.planta, v.letra) : ''

  async function cambiarEstado(estado: EstadoVivienda) {
    setError(null)
    try {
      await api.setEstadoVivienda(viviendaId, estado)
      viv.recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  function filaFallo(f: Fallo) {
    const foto = f.fotos?.[0] ? urls[f.fotos[0].path] : undefined
    return (
      <Link key={f.id} to={`/obra/${obraId}/fallo/${f.id}`} className="fila">
        <div className="miniatura" style={foto ? { backgroundImage: `url(${foto})` } : undefined} />
        <div className="texto">
          <span className="titulo-fila" style={f.estado === 'reparado' ? { textDecoration: 'line-through', color: 'var(--gris)' } : undefined}>
            {f.descripcion}
          </span>
          <span className="meta">
            {f.tipo}
            {f.subcontrata ? ` · ${f.subcontrata}` : ''}
            {f.fotos?.length > 0 ? ` · ${f.fotos.length} ${f.fotos.length === 1 ? 'foto' : 'fotos'}` : ''}
          </span>
        </div>
        {f.estado === 'reparado' ? (
          <span className="etq etq-ok">Reparado</span>
        ) : (
          <span className={`etq etq-${f.prioridad}`}>{PRIORIDAD_TEXTO[f.prioridad]}</span>
        )}
      </Link>
    )
  }

  return (
    <Pantalla
      obraId={obraId}
      atras={{ a: `/obra/${obraId}`, texto: 'Viviendas' }}
      titulo={v ? `${plantaLarga(v.planta)} · Vivienda ${v.letra}` : 'Vivienda'}
      subtitulo={v ? `${v.bloque_nombre} · ${v.fallos_abiertos} fallos abiertos · ${v.fallos_reparados} reparados` : undefined}
      derecha={
        <button className="btn-cab" onClick={() => setExportar(true)} disabled={lista.length === 0}>
          Exportar
        </button>
      }
    >
      <Estado cargando={viv.cargando || fallos.cargando} error={viv.error || fallos.error || error} />

      <div className="campo">
        <span className="etiqueta">Estado de la revisión</span>
        <div className="chips">
          {ESTADOS.map((e) => (
            <button key={e} className={`chip ${v?.estado === e ? 'act' : ''}`} aria-pressed={v?.estado === e} onClick={() => void cambiarEstado(e)}>
              {ESTADO_VIVIENDA_TEXTO[e]}
            </button>
          ))}
        </div>
      </div>

      {!fallos.cargando && lista.length === 0 && (
        <p className="muted">Todavía no hay fallos en esta vivienda. Usa el botón de abajo para añadir el primero.</p>
      )}

      {estancias.map((estancia) => {
        const deEstancia = lista.filter((f) => f.estancia === estancia)
        return (
          <section key={estancia} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 className="grupo">
              {estancia} · {deEstancia.length}
            </h3>
            {deEstancia.map((f) => filaFallo(f))}
          </section>
        )
      })}

      <div className="fab-caja">
        <Link className="fab" to={`/obra/${obraId}/vivienda/${viviendaId}/fallo/nuevo`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1B1F24" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Añadir fallo
        </Link>
      </div>

      {exportar && v && (
        <ExportDialog
          fallos={lista}
          titulo={`Informe de repaso · ${nombre}`}
          subtitulo={`${obra.datos?.nombre ?? ''} · ${v.bloque_nombre} · ${nombre}`}
          archivo={`${obra.datos?.nombre ?? 'obra'} ${v.bloque_nombre} ${nombre}`}
          agruparPor="estancia"
          soloAbiertosInicial={true}
          onClose={() => setExportar(false)}
        />
      )}
    </Pantalla>
  )
}
