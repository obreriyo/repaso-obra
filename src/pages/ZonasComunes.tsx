import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga } from '../lib/hooks'
import { ZONA, ZONAS_POR_DEFECTO, mensajeError } from '../lib/format'

const MAX_NOMBRE = 40

/** Zonas comunes de un bloque (portal, escalera, ascensor…): añadir las de siempre o las que quieras, y quitar las que no existan. */
export default function ZonasComunes() {
  const { obraId = '', bloqueId = '' } = useParams()
  const nav = useNavigate()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const bloques = useCarga(() => api.listBloques(obraId), [obraId])
  const viviendas = useCarga(() => api.listViviendas(bloqueId), [bloqueId])
  const bloque = (bloques.datos ?? []).find((b) => b.id === bloqueId)

  const existentes = useMemo(() => (viviendas.datos ?? []).filter((v) => v.planta === ZONA), [viviendas.datos])
  const yaTiene = useMemo(() => new Set(existentes.map((z) => z.letra.trim().toLowerCase())), [existentes])

  const [elegidas, setElegidas] = useState<string[]>([])
  const [propias, setPropias] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [preparado, setPreparado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // La primera vez que se abre (el bloque aún no tiene zonas), vienen marcadas las de siempre
  useEffect(() => {
    if (preparado || !viviendas.datos) return
    setPreparado(true)
    if (existentes.length === 0) setElegidas([...ZONAS_POR_DEFECTO])
  }, [preparado, viviendas.datos, existentes.length])

  const disponibles = ZONAS_POR_DEFECTO.filter((z) => !yaTiene.has(z.toLowerCase()))

  function alternar(z: string) {
    setElegidas((e) => (e.includes(z) ? e.filter((x) => x !== z) : [...e, z]))
  }

  function añadirPropia(e: FormEvent) {
    e.preventDefault()
    const nombre = texto.trim().slice(0, MAX_NOMBRE)
    if (!nombre) return
    const clave = nombre.toLowerCase()
    const repetida =
      yaTiene.has(clave) || propias.some((p) => p.toLowerCase() === clave) || ZONAS_POR_DEFECTO.some((z) => z.toLowerCase() === clave)
    if (repetida) {
      // Si es una de las de siempre, se marca; si ya existe, no se repite
      const defecto = ZONAS_POR_DEFECTO.find((z) => z.toLowerCase() === clave)
      if (defecto && !yaTiene.has(clave) && !elegidas.includes(defecto)) setElegidas((x) => [...x, defecto])
    } else {
      setPropias((p) => [...p, nombre])
    }
    setTexto('')
  }

  const nuevas = [...elegidas.filter((z) => !yaTiene.has(z.toLowerCase())), ...propias]

  async function guardar() {
    setError(null)
    if (nuevas.length === 0) return setError('Elige o escribe al menos una zona.')
    setOcupado(true)
    try {
      await api.crearZonas(bloqueId, nuevas)
      nav(`/obra/${obraId}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setOcupado(false)
    }
  }

  async function quitar(id: string, nombre: string) {
    if (!window.confirm(`¿Quitar la zona «${nombre}»? Solo se puede si no tiene fallos.`)) return
    setError(null)
    try {
      await api.quitarZona(id)
      viviendas.recargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  return (
    <Pantalla eyebrow={obra.datos?.nombre} titulo="Zonas comunes" subtitulo={bloque?.nombre} atras={{ a: `/obra/${obraId}`, texto: 'Viviendas' }}>
      <Estado
        cargando={viviendas.cargando || bloques.cargando}
        error={viviendas.error || bloques.error || obra.error}
        reintentar={() => {
          obra.recargar()
          bloques.recargar()
          viviendas.recargar()
        }}
      />

      {existentes.length > 0 && (
        <>
          <h2 className="seccion">Zonas de este bloque</h2>
          <div className="tarjeta">
            {existentes.map((z) => {
              const fallos = z.fallos_abiertos + z.fallos_reparados
              return (
                <div key={z.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span>
                    <b>{z.letra}</b>
                    <span className="muted"> · {fallos} {fallos === 1 ? 'fallo' : 'fallos'}</span>
                  </span>
                  <button type="button" className="btn-texto peligro" disabled={fallos > 0} onClick={() => void quitar(z.id, z.letra)}>
                    Quitar
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h2 className="seccion">Añadir zonas</h2>
      <div className="tarjeta">
        {disponibles.length > 0 && (
          <>
            <span className="etiqueta">Toca las zonas que tenga este bloque</span>
            <div className="chips">
              {disponibles.map((z) => (
                <button key={z} type="button" className={`chip ${elegidas.includes(z) ? 'act' : ''}`} aria-pressed={elegidas.includes(z)} onClick={() => alternar(z)}>
                  {z}
                </button>
              ))}
            </div>
          </>
        )}

        {propias.length > 0 && (
          <div className="chips">
            {propias.map((z) => (
              <button key={z} type="button" className="chip act" onClick={() => setPropias((p) => p.filter((x) => x !== z))} aria-label={`Quitar ${z}`}>
                {z} ×
              </button>
            ))}
          </div>
        )}

        <form onSubmit={añadirPropia} className="campo">
          <label htmlFor="zona-propia">Otra zona</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="zona-propia" type="text" value={texto} maxLength={MAX_NOMBRE} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo Piscina o Cuarto de bicis" />
            <button type="submit" className="btn" disabled={!texto.trim()}>
              Añadir
            </button>
          </div>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="acciones">
        <Link className="btn" to={`/obra/${obraId}`}>
          Cancelar
        </Link>
        <button type="button" className="btn btn-primario" disabled={ocupado || nuevas.length === 0} onClick={() => void guardar()}>
          {ocupado ? 'Guardando…' : nuevas.length > 0 ? `Añadir ${nuevas.length} ${nuevas.length === 1 ? 'zona' : 'zonas'}` : 'Añadir zonas'}
        </button>
      </div>
    </Pantalla>
  )
}
