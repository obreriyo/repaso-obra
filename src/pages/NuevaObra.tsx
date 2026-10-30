import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { LETRAS, mensajeError } from '../lib/format'
import type { BloqueNuevo } from '../lib/types'

function nombreBloque(i: number): string {
  return `Bloque ${String.fromCharCode(65 + (i % 26))}`
}

export default function NuevaObra() {
  const nav = useNavigate()
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [bloques, setBloques] = useState<BloqueNuevo[]>([{ nombre: 'Bloque A', plantas: 5, letras: ['A', 'B'] }])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const total = bloques.reduce((suma, b) => suma + b.plantas * b.letras.length, 0)

  function cambiar(i: number, cambios: Partial<BloqueNuevo>) {
    setBloques((lista) => lista.map((b, k) => (k === i ? { ...b, ...cambios } : b)))
  }

  function alternarLetra(i: number, letra: string) {
    const b = bloques[i]
    const letras = b.letras.includes(letra) ? b.letras.filter((l) => l !== letra) : [...b.letras, letra].sort()
    cambiar(i, { letras })
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('Escribe el nombre de la obra.')
    if (bloques.length === 0) return setError('Añade al menos un bloque.')
    if (bloques.some((b) => b.letras.length === 0)) return setError('Cada bloque necesita al menos una letra de vivienda.')
    if (bloques.some((b) => !b.nombre.trim())) return setError('Todos los bloques necesitan nombre.')

    setOcupado(true)
    try {
      const id = await api.crearObra(
        nombre.trim(),
        direccion.trim(),
        bloques.map((b) => ({ ...b, nombre: b.nombre.trim() }))
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
          <button
            type="button"
            className="btn-texto"
            onClick={() => setBloques((l) => [...l, { nombre: nombreBloque(l.length), plantas: 5, letras: ['A', 'B'] }])}
          >
            + Añadir bloque
          </button>
        </div>

        {bloques.map((b, i) => (
          <div key={i} className="tarjeta">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={b.nombre}
                onChange={(e) => cambiar(i, { nombre: e.target.value })}
                aria-label={`Nombre del bloque ${i + 1}`}
                style={{ fontWeight: 600 }}
              />
              {bloques.length > 1 && (
                <button type="button" className="btn-texto peligro" onClick={() => setBloques((l) => l.filter((_, k) => k !== i))}>
                  Quitar
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>Plantas (con planta baja)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="chip" aria-label="Quitar una planta" disabled={b.plantas <= 1} onClick={() => cambiar(i, { plantas: b.plantas - 1 })}>
                  −
                </button>
                <b style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, minWidth: 28, textAlign: 'center' }}>{b.plantas}</b>
                <button type="button" className="chip" aria-label="Añadir una planta" disabled={b.plantas >= 30} onClick={() => cambiar(i, { plantas: b.plantas + 1 })}>
                  +
                </button>
              </div>
            </div>

            <div className="campo">
              <span className="etiqueta">Letras de vivienda por planta</span>
              <div className="chips">
                {LETRAS.map((l) => (
                  <button key={l} type="button" className={`chip ${b.letras.includes(l) ? 'act' : ''}`} aria-pressed={b.letras.includes(l)} onClick={() => alternarLetra(i, l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="muted">{b.plantas * b.letras.length} viviendas</div>
          </div>
        ))}

        <p className="muted">
          Se crearán {total} viviendas, nombradas con planta y letra (por ejemplo 2ºB). La planta baja se llama «Bajo».
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
