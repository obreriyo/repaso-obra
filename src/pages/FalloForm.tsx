import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga, useUrlsFotos } from '../lib/hooks'
import { ESTANCIAS, PRIORIDAD_TEXTO, TIPOS, mensajeError } from '../lib/format'
import type { EstadoFallo, Foto, Prioridad } from '../lib/types'

interface FotoNueva {
  archivo: File
  vista: string
}

const PRIORIDADES: Prioridad[] = ['alta', 'media', 'baja']

export default function FalloForm() {
  const { obraId = '', viviendaId, falloId } = useParams()
  const nav = useNavigate()
  const edicion = Boolean(falloId)

  const fallo = useCarga(() => (falloId ? api.getFallo(falloId) : Promise.resolve(null)), [falloId])
  const subs = useCarga(() => api.subcontratas(obraId), [obraId])

  const [estancia, setEstancia] = useState('')
  const [tipo, setTipo] = useState('Acabado')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('media')
  const [subcontrata, setSubcontrata] = useState('')
  const [estado, setEstado] = useState<EstadoFallo>('abierto')
  const [nuevas, setNuevas] = useState<FotoNueva[]>([])
  const [quitadas, setQuitadas] = useState<Foto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const datos = fallo.datos
  const vivId = viviendaId ?? datos?.vivienda_id ?? ''
  const volver = `/obra/${obraId}/vivienda/${vivId}`

  useEffect(() => {
    if (!datos) return
    setEstancia(datos.estancia)
    setTipo(datos.tipo)
    setDescripcion(datos.descripcion)
    setPrioridad(datos.prioridad)
    setSubcontrata(datos.subcontrata ?? '')
    setEstado(datos.estado)
  }, [datos])

  const existentes = (datos?.fotos ?? []).filter((f) => !quitadas.some((q) => q.id === f.id))
  const urls = useUrlsFotos(existentes.map((f) => f.path))

  function añadirFotos(e: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    setNuevas((lista) => [...lista, ...archivos.map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo) }))])
    e.target.value = ''
  }

  function quitarNueva(i: number) {
    setNuevas((lista) => {
      URL.revokeObjectURL(lista[i].vista)
      return lista.filter((_, k) => k !== i)
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!estancia.trim()) return setError('Indica la estancia.')
    if (!descripcion.trim()) return setError('Describe el fallo.')
    if (!vivId) return setError('No se encuentra la vivienda.')

    setGuardando(true)
    try {
      const comunes = {
        estancia: estancia.trim(),
        tipo,
        descripcion: descripcion.trim(),
        prioridad,
        subcontrata: subcontrata.trim() || null
      }

      let id = falloId
      if (id) {
        await api.actualizarFallo(id, { ...comunes, estado })
      } else {
        id = await api.crearFallo({ obra_id: obraId, vivienda_id: vivId, ...comunes })
        await api.marcarEnCurso(vivId)
      }

      for (const foto of quitadas) await api.borrarFoto(foto)
      for (const nueva of nuevas) await api.subirFoto(obraId, id, nueva.archivo)

      nav(volver, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!falloId) return
    if (!window.confirm('¿Eliminar este fallo y sus fotos? No se puede deshacer.')) return
    setGuardando(true)
    try {
      await api.borrarFallo(falloId)
      nav(volver, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setGuardando(false)
    }
  }

  return (
    <Pantalla titulo={edicion ? 'Editar fallo' : 'Nuevo fallo'} atras={{ a: volver, texto: 'Vivienda' }}>
      <Estado cargando={edicion && fallo.cargando} error={fallo.error} />

      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="campo">
          <span className="etiqueta">Fotos</span>
          <div className="fotos">
            {existentes.map((f) => (
              <div key={f.id} className="foto" style={urls[f.path] ? { backgroundImage: `url(${urls[f.path]})` } : undefined}>
                <button type="button" aria-label="Quitar foto" onClick={() => setQuitadas((q) => [...q, f])}>
                  ×
                </button>
              </div>
            ))}
            {nuevas.map((n, i) => (
              <div key={n.vista} className="foto" style={{ backgroundImage: `url(${n.vista})` }}>
                <button type="button" aria-label="Quitar foto" onClick={() => quitarNueva(i)}>
                  ×
                </button>
              </div>
            ))}
            <label className="foto-nueva">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B1F24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Añadir
              <input type="file" accept="image/*" multiple onChange={añadirFotos} />
            </label>
          </div>
          <span className="muted">Se hace la foto con la cámara o se elige de la galería. Se reducen solas para ahorrar datos.</span>
        </div>

        <div className="campo">
          <label htmlFor="estancia">Estancia</label>
          <div className="chips">
            {ESTANCIAS.slice(0, 8).map((e) => (
              <button key={e} type="button" className={`chip ${estancia === e ? 'act' : ''}`} onClick={() => setEstancia(e)}>
                {e}
              </button>
            ))}
          </div>
          <input id="estancia" type="text" list="lista-estancias" value={estancia} onChange={(e) => setEstancia(e.target.value)} placeholder="O escribe otra estancia" />
          <datalist id="lista-estancias">
            {ESTANCIAS.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>

        <div className="campo">
          <span className="etiqueta">Tipo de fallo</span>
          <div className="chips">
            {TIPOS.map((t) => (
              <button key={t} type="button" className={`chip ${tipo === t ? 'act' : ''}`} onClick={() => setTipo(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Escribe o dicta con el micrófono del teclado" />
        </div>

        <div className="campo">
          <span className="etiqueta">Prioridad</span>
          <div className="chips">
            {PRIORIDADES.map((p) => (
              <button key={p} type="button" className={`chip ${prioridad === p ? 'act' : ''}`} aria-pressed={prioridad === p} onClick={() => setPrioridad(p)}>
                {PRIORIDAD_TEXTO[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="subcontrata">Subcontrata responsable</label>
          <input id="subcontrata" type="text" list="lista-subcontratas" value={subcontrata} onChange={(e) => setSubcontrata(e.target.value)} placeholder="Por ejemplo: Fontanería Ruiz" />
          <datalist id="lista-subcontratas">
            {(subs.datos ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {edicion && (
          <div className="panel">
            <label className="interruptor">
              Marcar como reparado
              <input type="checkbox" checked={estado === 'reparado'} onChange={(e) => setEstado(e.target.checked ? 'reparado' : 'abierto')} />
            </label>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <button type="button" className="btn" disabled={guardando} onClick={() => nav(volver)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar fallo'}
          </button>
        </div>

        {edicion && (
          <button type="button" className="btn btn-peligro" disabled={guardando} onClick={() => void eliminar()}>
            Eliminar fallo
          </button>
        )}
      </form>
    </Pantalla>
  )
}
