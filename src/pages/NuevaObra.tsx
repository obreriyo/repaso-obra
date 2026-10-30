import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { ATICO, LETRAS, mensajeError, plantaLarga } from '../lib/format'
import type { BloqueNuevo, PlantaNueva } from '../lib/types'

function nombreBloque(i: number): string {
  return `Bloque ${String.fromCharCode(65 + (i % 26))}`
}

/** Planta baja + plantas 1..altura, todas con las mismas letras de partida. */
function bloqueInicial(nombre: string, altura = 4, letras = ['A', 'B']): BloqueNuevo {
  const plantas: PlantaNueva[] = [{ planta: 0, letras: [...letras] }]
  for (let p = 1; p <= altura; p++) plantas.push({ planta: p, letras: [...letras] })
  return { nombre, plantas }
}

function altura(b: BloqueNuevo): number {
  return b.plantas.filter((p) => p.planta > 0 && p.planta < ATICO).length
}

function tieneAtico(b: BloqueNuevo): boolean {
  return b.plantas.some((p) => p.planta === ATICO)
}

function numViviendas(b: BloqueNuevo): number {
  return b.plantas.reduce((s, p) => s + p.letras.length, 0)
}

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

  /** Cambia cuántas plantas hay sobre la baja; las nuevas copian las letras de la última. */
  function ponerAltura(i: number, n: number) {
    cambiar(i, (b) => {
      const baja = b.plantas.find((p) => p.planta === 0) ?? { planta: 0, letras: ['A', 'B'] }
      const numeradas = b.plantas.filter((p) => p.planta > 0 && p.planta < ATICO)
      const ultima = numeradas[numeradas.length - 1] ?? baja
      const atico = b.plantas.find((p) => p.planta === ATICO)
      const nuevas: PlantaNueva[] = []
      for (let p = 1; p <= n; p++) {
        nuevas.push(numeradas.find((x) => x.planta === p) ?? { planta: p, letras: [...ultima.letras] })
      }
      return { ...b, plantas: [baja, ...nuevas, ...(atico ? [atico] : [])] }
    })
  }

  function alternarAtico(i: number) {
    cambiar(i, (b) => {
      if (tieneAtico(b)) return { ...b, plantas: b.plantas.filter((p) => p.planta !== ATICO) }
      const ultima = b.plantas.filter((p) => p.planta < ATICO).slice(-1)[0]
      return { ...b, plantas: [...b.plantas, { planta: ATICO, letras: [...(ultima?.letras ?? ['A', 'B'])] }] }
    })
  }

  function alternarLetra(i: number, planta: number, letra: string) {
    cambiar(i, (b) => ({
      ...b,
      plantas: b.plantas.map((p) => {
        if (p.planta !== planta) return p
        const letras = p.letras.includes(letra) ? p.letras.filter((l) => l !== letra) : [...p.letras, letra].sort()
        return { ...p, letras }
      })
    }))
  }

  function copiarATodas(i: number, planta: number) {
    cambiar(i, (b) => {
      const origen = b.plantas.find((p) => p.planta === planta)
      if (!origen) return b
      return { ...b, plantas: b.plantas.map((p) => ({ ...p, letras: [...origen.letras] })) }
    })
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
        bloques.map((b) => ({
          nombre: b.nombre.trim(),
          // Las plantas sin ninguna letra no se envían
          plantas: b.plantas.filter((p) => p.letras.length > 0)
        }))
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
          <button type="button" className="btn-texto" onClick={() => setBloques((l) => [...l, bloqueInicial(nombreBloque(l.length))])}>
            + Añadir bloque
          </button>
        </div>

        {bloques.map((b, i) => (
          <div key={i} className="tarjeta">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={b.nombre}
                onChange={(e) => cambiar(i, (x) => ({ ...x, nombre: e.target.value }))}
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
              <span style={{ fontSize: 14 }}>Plantas sobre la baja</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="chip" aria-label="Quitar una planta" disabled={altura(b) <= 0} onClick={() => ponerAltura(i, altura(b) - 1)}>
                  −
                </button>
                <b style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, minWidth: 28, textAlign: 'center' }}>{altura(b)}</b>
                <button type="button" className="chip" aria-label="Añadir una planta" disabled={altura(b) >= 30} onClick={() => ponerAltura(i, altura(b) + 1)}>
                  +
                </button>
              </div>
            </div>

            <label className="interruptor">
              Tiene ático
              <input type="checkbox" checked={tieneAtico(b)} onChange={() => alternarAtico(i)} />
            </label>

            <span className="etiqueta">Viviendas de cada planta (toca las letras que existan)</span>
            {[...b.plantas]
              .sort((x, y) => y.planta - x.planta)
              .map((p) => (
                <div key={p.planta} className="campo">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {plantaLarga(p.planta)} · {p.letras.length} {p.letras.length === 1 ? 'vivienda' : 'viviendas'}
                    </span>
                    <button type="button" className="btn-texto" onClick={() => copiarATodas(i, p.planta)}>
                      Copiar a todas
                    </button>
                  </div>
                  <div className="chips">
                    {LETRAS.map((l) => (
                      <button key={l} type="button" className={`chip ${p.letras.includes(l) ? 'act' : ''}`} aria-pressed={p.letras.includes(l)} onClick={() => alternarLetra(i, p.planta, l)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            <div className="muted">{numViviendas(b)} viviendas en este bloque</div>
          </div>
        ))}

        <p className="muted">
          Se crearán {total} viviendas, nombradas con planta y letra (por ejemplo 2ºB). La planta baja se llama «Bajo» y el ático «Ático». Una planta sin ninguna letra marcada no se crea.
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
