import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EditorBloque, { numViviendas, plantasParaEnviar } from '../components/EditorBloque'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { TRASTERO, mensajeError, viviendaCorta } from '../lib/format'
import { useCarga } from '../lib/hooks'
import type { BloqueNuevo, PlantaNueva, Vivienda } from '../lib/types'

/** Convierte las viviendas que ya existen (sin trasteros) en la forma que edita EditorBloque. */
function aBloque(nombre: string, viviendas: Vivienda[]): BloqueNuevo {
  const porPlanta = new Map<number, string[]>()
  for (const v of viviendas) {
    if (v.planta >= TRASTERO) continue
    porPlanta.set(v.planta, [...(porPlanta.get(v.planta) ?? []), v.letra])
  }
  if (!porPlanta.has(0)) porPlanta.set(0, [])
  const plantas: PlantaNueva[] = Array.from(porPlanta.entries())
    .map(([planta, letras]) => ({ planta, letras: [...letras].sort() }))
    .sort((a, b) => a.planta - b.planta)
  return { nombre, plantas }
}

const clave = (planta: number, letra: string) => `${planta}|${letra}`

/** Cambia nombre, plantas, ático y viviendas de un bloque ya creado. Nunca borra viviendas con fallos. */
export default function ModificarBloque() {
  const { obraId = '', bloqueId = '' } = useParams()
  const nav = useNavigate()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const bloques = useCarga(() => api.listBloques(obraId), [obraId])
  const viviendas = useCarga(() => api.listViviendas(bloqueId), [bloqueId])
  const nombreActual = (bloques.datos ?? []).find((b) => b.id === bloqueId)?.nombre

  const [bloque, setBloque] = useState<BloqueNuevo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Se rellena una sola vez, cuando llegan las viviendas y el nombre
  useEffect(() => {
    if (bloque || !viviendas.datos || nombreActual === undefined) return
    setBloque(aBloque(nombreActual, viviendas.datos))
  }, [bloque, viviendas.datos, nombreActual])

  const existentes = useMemo(() => (viviendas.datos ?? []).filter((v) => v.planta < TRASTERO), [viviendas.datos])

  // Qué cambia respecto a lo que hay ahora
  const cambios = useMemo(() => {
    if (!bloque) return { anadir: 0, quitar: [] as Vivienda[], bloqueadas: [] as Vivienda[] }
    const deseadas = new Set<string>()
    for (const p of plantasParaEnviar(bloque)) for (const l of p.letras) deseadas.add(clave(p.planta, l))
    const actuales = new Set(existentes.map((v) => clave(v.planta, v.letra)))
    let anadir = 0
    deseadas.forEach((k) => {
      if (!actuales.has(k)) anadir++
    })
    const quitar = existentes.filter((v) => !deseadas.has(clave(v.planta, v.letra)))
    const bloqueadas = quitar.filter((v) => v.fallos_abiertos + v.fallos_reparados > 0)
    return { anadir, quitar, bloqueadas }
  }, [bloque, existentes])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!bloque) return
    setError(null)
    if (!bloque.nombre.trim()) return setError('El bloque necesita un nombre.')
    if (numViviendas(bloque) === 0) return setError('El bloque necesita al menos una vivienda.')
    if (cambios.bloqueadas.length > 0) {
      return setError('Hay viviendas con fallos que quieres quitar. Vuelve a marcarlas o elimina antes sus fallos.')
    }
    if (cambios.quitar.length > 0) {
      const lista = cambios.quitar.map((v) => viviendaCorta(v.planta, v.letra)).join(', ')
      if (!window.confirm(`Se quitarán ${cambios.quitar.length} viviendas sin fallos: ${lista}. ¿Seguro?`)) return
    }
    setOcupado(true)
    try {
      await api.modificarBloque(bloqueId, bloque.nombre.trim(), plantasParaEnviar(bloque))
      nav(`/obra/${obraId}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setOcupado(false)
    }
  }

  return (
    <Pantalla eyebrow={obra.datos?.nombre} titulo="Modificar bloque" subtitulo={nombreActual} atras={{ a: `/obra/${obraId}`, texto: 'Viviendas' }}>
      <Estado cargando={viviendas.cargando || bloques.cargando} error={viviendas.error || bloques.error || obra.error} />

      {bloque && (
        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <EditorBloque indice={0} bloque={bloque} onChange={(fn) => setBloque((b) => (b ? fn(b) : b))} />

          <p className="muted">
            {cambios.anadir === 0 && cambios.quitar.length === 0
              ? 'Sin cambios en las viviendas.'
              : `Se añadirán ${cambios.anadir} viviendas y se quitarán ${cambios.quitar.length}.`}{' '}
            Las viviendas que ya tienes (con sus fallos y fotos) no cambian. Los trasteros tampoco.
          </p>

          {cambios.bloqueadas.length > 0 && (
            <p className="error">
              No se pueden quitar porque tienen fallos: {cambios.bloqueadas.map((v) => viviendaCorta(v.planta, v.letra)).join(', ')}.
            </p>
          )}
          {error && <p className="error">{error}</p>}

          <div className="acciones">
            <Link className="btn" to={`/obra/${obraId}`}>
              Cancelar
            </Link>
            <button className="btn btn-primario" type="submit" disabled={ocupado || cambios.bloqueadas.length > 0}>
              {ocupado ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </Pantalla>
  )
}
