import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EditorBloque, { bloqueInicial, nombreBloqueNumero, numViviendas, plantasParaEnviar } from '../components/EditorBloque'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga } from '../lib/hooks'
import { mensajeError } from '../lib/format'
import type { BloqueNuevo } from '../lib/types'

/** Añade un bloque nuevo a una obra que ya existe, sin tocar lo que ya hay. */
export default function NuevoBloque() {
  const { obraId = '' } = useParams()
  const nav = useNavigate()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const existentes = useCarga(() => api.listBloques(obraId), [obraId])
  const [bloque, setBloque] = useState<BloqueNuevo>(bloqueInicial('Bloque B'))
  const [nombreTocado, setNombreTocado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Propone el siguiente nombre libre (Bloque B, Bloque C…) cuando se sabe cuántos hay
  useEffect(() => {
    if (!existentes.datos || nombreTocado) return
    const usados = new Set(existentes.datos.map((b) => b.nombre.trim().toLowerCase()))
    let i = existentes.datos.length
    while (usados.has(nombreBloqueNumero(i).toLowerCase()) && i < existentes.datos.length + 26) i++
    setBloque((b) => ({ ...b, nombre: nombreBloqueNumero(i) }))
  }, [existentes.datos, nombreTocado])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!bloque.nombre.trim()) return setError('El bloque necesita un nombre.')
    if (numViviendas(bloque) === 0) return setError('El bloque necesita al menos una vivienda.')
    setOcupado(true)
    try {
      await api.crearBloque(obraId, bloque.nombre.trim(), plantasParaEnviar(bloque))
      nav(`/obra/${obraId}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setOcupado(false)
    }
  }

  return (
    <Pantalla eyebrow={obra.datos?.nombre} titulo="Añadir bloque" atras={{ a: `/obra/${obraId}`, texto: 'Viviendas' }}>
      <Estado cargando={existentes.cargando} error={existentes.error || obra.error} />

      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EditorBloque
          indice={0}
          bloque={bloque}
          onChange={(fn) => {
            setBloque((b) => {
              const nuevo = fn(b)
              if (nuevo.nombre !== b.nombre) setNombreTocado(true)
              return nuevo
            })
          }}
        />

        <p className="muted">
          Se crearán {numViviendas(bloque)} viviendas nuevas. Lo que ya tienes en la obra no cambia.
        </p>

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <Link className="btn" to={`/obra/${obraId}`}>
            Cancelar
          </Link>
          <button className="btn btn-primario" type="submit" disabled={ocupado}>
            {ocupado ? 'Creando…' : 'Crear bloque'}
          </button>
        </div>
      </form>
    </Pantalla>
  )
}
