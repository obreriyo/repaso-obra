import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CampoTrasteros from '../components/CampoTrasteros'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useCarga } from '../lib/hooks'
import { mensajeError } from '../lib/format'
import { parsearTrasteros } from '../lib/trasteros'

/** Añade trasteros a un bloque que ya existe, sin tocar lo que ya hay. */
export default function NuevosTrasteros() {
  const { obraId = '', bloqueId = '' } = useParams()
  const nav = useNavigate()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const bloques = useCarga(() => api.listBloques(obraId), [obraId])
  const bloque = (bloques.datos ?? []).find((b) => b.id === bloqueId)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    let numeros: string[]
    try {
      numeros = parsearTrasteros(texto)
    } catch (err) {
      return setError(mensajeError(err))
    }
    if (numeros.length === 0) return setError('Escribe al menos un número de trastero.')
    setOcupado(true)
    try {
      await api.crearTrasteros(bloqueId, numeros)
      nav(`/obra/${obraId}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setOcupado(false)
    }
  }

  return (
    <Pantalla eyebrow={obra.datos?.nombre} titulo="Añadir trasteros" subtitulo={bloque?.nombre} atras={{ a: `/obra/${obraId}`, texto: 'Viviendas' }}>
      <Estado cargando={bloques.cargando} error={bloques.error || obra.error} />
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CampoTrasteros texto={texto} onChange={setTexto} />
        {error && <p className="error">{error}</p>}
        <div className="acciones">
          <Link className="btn" to={`/obra/${obraId}`}>
            Cancelar
          </Link>
          <button className="btn btn-primario" type="submit" disabled={ocupado}>
            {ocupado ? 'Creando…' : 'Crear trasteros'}
          </button>
        </div>
      </form>
    </Pantalla>
  )
}
