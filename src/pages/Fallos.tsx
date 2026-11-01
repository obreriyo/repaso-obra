import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ExportDialog from '../components/ExportDialog'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga, useUrlsFotos } from '../lib/hooks'
import { PRIORIDAD_TEXTO, fecha, plantaLarga, quienEdito, ubicacion } from '../lib/format'

type FiltroEstado = 'abierto' | 'reparado' | 'todos'

/** En obras grandes la lista se enseña por tramos para que la pantalla vaya fluida. */
const TRAMO = 50

export default function Fallos() {
  const { obraId = '' } = useParams()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const datos = useCarga(() => api.listFallos(obraId), [obraId])

  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('abierto')
  const [bloque, setBloque] = useState('')
  const [planta, setPlanta] = useState('')
  const [prioridad, setPrioridad] = useState('')
  const [tipo, setTipo] = useState('')
  const [subcontrata, setSubcontrata] = useState('')
  const [verFiltros, setVerFiltros] = useState(false)
  const [exportar, setExportar] = useState(false)
  const [mostrados, setMostrados] = useState(TRAMO)

  const todos = datos.datos ?? []

  const opciones = useMemo(() => {
    const unicos = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
    return {
      bloques: unicos(todos.map((f) => f.vivienda?.bloque?.nombre ?? '')),
      plantas: Array.from(new Set(todos.map((f) => f.vivienda?.planta ?? 0))).sort((a, b) => a - b),
      tipos: unicos(todos.map((f) => f.tipo)),
      subcontratas: unicos(todos.map((f) => f.subcontrata ?? ''))
    }
  }, [todos])

  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return todos.filter((f) => {
      if (estado !== 'todos' && f.estado !== estado) return false
      if (bloque && f.vivienda?.bloque?.nombre !== bloque) return false
      if (planta !== '' && String(f.vivienda?.planta) !== planta) return false
      if (prioridad && f.prioridad !== prioridad) return false
      if (tipo && f.tipo !== tipo) return false
      if (subcontrata && f.subcontrata !== subcontrata) return false
      if (q) {
        const pajar = `${f.descripcion} ${f.estancia} ${f.tipo} ${f.subcontrata ?? ''} ${ubicacion(f)}`.toLowerCase()
        if (!pajar.includes(q)) return false
      }
      return true
    })
  }, [todos, texto, estado, bloque, planta, prioridad, tipo, subcontrata])

  const abiertos = todos.filter((f) => f.estado === 'abierto').length
  const reparados = todos.length - abiertos
  const filtrosActivos = [bloque, planta, prioridad, tipo, subcontrata].filter((x) => x !== '').length

  // Al cambiar los filtros se vuelve al primer tramo
  useEffect(() => {
    setMostrados(TRAMO)
  }, [texto, estado, bloque, planta, prioridad, tipo, subcontrata])

  const enPantalla = lista.slice(0, mostrados)
  const urls = useUrlsFotos(enPantalla.filter((f) => f.fotos?.length > 0).map((f) => f.fotos[0].path))

  function limpiar() {
    setBloque('')
    setPlanta('')
    setPrioridad('')
    setTipo('')
    setSubcontrata('')
    setTexto('')
  }

  return (
    <Pantalla
      obraId={obraId}
      eyebrow={obra.datos?.nombre}
      titulo="Fallos"
      derecha={
        <button className="btn-cab" onClick={() => setExportar(true)} disabled={lista.length === 0}>
          Exportar
        </button>
      }
    >
      <Estado cargando={datos.cargando} error={datos.error} />

      <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar fallo, vivienda o estancia" aria-label="Buscar" />

      <div className="chips scroll">
        <button className={`chip ${estado === 'abierto' ? 'act' : ''}`} onClick={() => setEstado('abierto')}>
          Abiertos · {abiertos}
        </button>
        <button className={`chip ${estado === 'reparado' ? 'act' : ''}`} onClick={() => setEstado('reparado')}>
          Reparados · {reparados}
        </button>
        <button className={`chip ${estado === 'todos' ? 'act' : ''}`} onClick={() => setEstado('todos')}>
          Todos
        </button>
        <button className={`chip ${verFiltros ? 'act' : ''}`} onClick={() => setVerFiltros((v) => !v)}>
          Filtros{filtrosActivos > 0 ? ` · ${filtrosActivos}` : ''}
        </button>
      </div>

      {verFiltros && (
        <div className="tarjeta">
          <div className="grid2">
            <select value={bloque} onChange={(e) => setBloque(e.target.value)} aria-label="Bloque">
              <option value="">Todos los bloques</option>
              {opciones.bloques.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select value={planta} onChange={(e) => setPlanta(e.target.value)} aria-label="Planta">
              <option value="">Todas las plantas</option>
              {opciones.plantas.map((p) => (
                <option key={p} value={String(p)}>
                  {plantaLarga(p)}
                </option>
              ))}
            </select>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} aria-label="Prioridad">
              <option value="">Cualquier prioridad</option>
              <option value="alta">{PRIORIDAD_TEXTO.alta}</option>
              <option value="media">{PRIORIDAD_TEXTO.media}</option>
              <option value="baja">{PRIORIDAD_TEXTO.baja}</option>
            </select>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
              <option value="">Cualquier tipo</option>
              {opciones.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <select value={subcontrata} onChange={(e) => setSubcontrata(e.target.value)} aria-label="Subcontrata">
            <option value="">Cualquier subcontrata</option>
            {opciones.subcontratas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-pequeno" onClick={limpiar}>
            Quitar filtros
          </button>
        </div>
      )}

      <p className="muted">
        {lista.length} {lista.length === 1 ? 'fallo' : 'fallos'} · la exportación incluye solo lo que ves filtrado
      </p>

      {enPantalla.map((f) => {
        const foto = f.fotos?.[0] ? urls[f.fotos[0].path] : undefined
        return (
          <Link key={f.id} to={`/obra/${obraId}/fallo/${f.id}`} className="fila" style={{ alignItems: 'flex-start' }}>
            <div className="miniatura" style={foto ? { backgroundImage: `url(${foto})` } : undefined} />
            <div className="texto">
              <span className="meta">
                {ubicacion(f)} · {f.estancia}
              </span>
              <span className="titulo-fila" style={f.estado === 'reparado' ? { textDecoration: 'line-through', color: 'var(--gris)' } : undefined}>
                {f.descripcion}
              </span>
              <span className="meta">
                {f.subcontrata ? `${f.subcontrata} · ` : ''}
                Editado por {quienEdito(f)} · {fecha(f.updated_at)}
              </span>
            </div>
            {f.estado === 'reparado' ? (
              <span className="etq etq-ok">Reparado</span>
            ) : (
              <span className={`etq etq-${f.prioridad}`}>{PRIORIDAD_TEXTO[f.prioridad]}</span>
            )}
          </Link>
        )
      })}

      {lista.length > mostrados && (
        <button type="button" className="btn" onClick={() => setMostrados((n) => n + TRAMO)}>
          Mostrar más ({lista.length - mostrados} restantes)
        </button>
      )}

      {!datos.cargando && lista.length === 0 && <p className="muted">No hay fallos con estos filtros.</p>}

      {exportar && (
        <ExportDialog
          fallos={lista}
          titulo={`Fallos · ${obra.datos?.nombre ?? ''}`}
          subtitulo={obra.datos?.nombre ?? ''}
          archivo={`${obra.datos?.nombre ?? 'obra'} fallos`}
          agruparPor="ubicacion"
          soloAbiertosInicial={false}
          onClose={() => setExportar(false)}
        />
      )}
    </Pantalla>
  )
}
