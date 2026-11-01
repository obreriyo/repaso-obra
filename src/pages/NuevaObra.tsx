import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EditorBloque, { bloqueInicial, nombreBloqueNumero, numViviendas, plantasParaEnviar } from '../components/EditorBloque'
import { Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { mensajeError } from '../lib/format'
import type { BloqueNuevo } from '../lib/types'

export default function NuevaObra() {
  const nav = useNavigate()
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [bloques, setBloques] = useState<BloqueNuevo[]>([bloqueInicial('Bloque A')])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const total = bloques.reduce((suma, b) => suma + numViviendas(b), 0)

  function cambiar(i: number, fn: (b: BloqueNuevo) => BloqueNuevo) {
    setBloques((lista) => lista.map((b, k) => (k === i ? fn(b) : b)))
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('Escribe el nombre de la obra.')
    if (bloques.length === 0) return setError('Añade al menos un bloque.')
    if (bloques.some((b) => !b.nombre.trim())) return setError('Todos los bloques necesitan nombre.')
    if (bloques.some((b) => numViviendas(b) === 0)) return setError('Cada bloque necesita al menos una vivienda.')

    setOcupado(true)
    try {
      const id = await api.crearObra(
        nombre.trim(),
        direccion.trim(),
        bloques.map((b) => ({ nombre: b.nombre.trim(), plantas: plantasParaEnviar(b) }))
      )
      nav(`/obra/${id}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setOcupado(false)
    }
  }

  return (
    <Pantalla titulo="Nueva obra" atras={{ a: '/', texto: 'Mis obras' }}>
      <form onSubmit={crear} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="campo">
          <label htmlFor="nombre">Nombre de la obra</label>
          <input id="nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Residencial Los Pinos" required />
        </div>
        <div className="campo">
          <label htmlFor="direccion">Dirección (opcional)</label>
          <input id="direccion" type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="seccion">Bloques</h2>
          <button type="button" className="btn-texto" onClick={() => setBloques((l) => [...l, bloqueInicial(nombreBloqueNumero(l.length))])}>
            + Añadir bloque
          </button>
        </div>

        {bloques.map((b, i) => (
          <EditorBloque
            key={i}
            indice={i}
            bloque={b}
            onChange={(fn) => cambiar(i, fn)}
            onQuitar={bloques.length > 1 ? () => setBloques((l) => l.filter((_, k) => k !== i)) : undefined}
          />
        ))}

        <p className="muted">
          Se crearán {total} viviendas, nombradas con planta y letra (por ejemplo 2ºB). La planta baja se llama «Bajo» y el ático «Ático». Una planta sin ninguna letra marcada no se crea. Más adelante podrás añadir más bloques y los trasteros de cada bloque desde la pantalla de la obra.
        </p>

        {error && <p className="error">{error}</p>}

        <div className="acciones">
          <Link className="btn" to="/">
            Cancelar
          </Link>
          <button className="btn btn-primario" type="submit" disabled={ocupado}>
            {ocupado ? 'Creando…' : 'Crear obra'}
          </button>
        </div>
      </form>
    </Pantalla>
  )
}
