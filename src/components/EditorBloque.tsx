import { ATICO, LETRAS, plantaLarga } from '../lib/format'
import type { BloqueNuevo, PlantaNueva } from '../lib/types'

/** Planta baja + plantas 1..altura, todas con las mismas letras de partida. */
export function bloqueInicial(nombre: string, altura = 4, letras = ['A', 'B']): BloqueNuevo {
  const plantas: PlantaNueva[] = [{ planta: 0, letras: [...letras] }]
  for (let p = 1; p <= altura; p++) plantas.push({ planta: p, letras: [...letras] })
  return { nombre, plantas }
}

export function nombreBloqueNumero(i: number): string {
  return `Bloque ${String.fromCharCode(65 + (i % 26))}`
}

export function numViviendas(b: BloqueNuevo): number {
  return b.plantas.reduce((s, p) => s + p.letras.length, 0)
}

/** Lo que se envía a Supabase: las plantas sin ninguna letra no se mandan. */
export function plantasParaEnviar(b: BloqueNuevo): PlantaNueva[] {
  return b.plantas.filter((p) => p.letras.length > 0)
}

function altura(b: BloqueNuevo): number {
  return b.plantas.filter((p) => p.planta > 0 && p.planta < ATICO).length
}

function tieneAtico(b: BloqueNuevo): boolean {
  return b.plantas.some((p) => p.planta === ATICO)
}

interface Props {
  indice: number
  bloque: BloqueNuevo
  onChange: (cambiar: (b: BloqueNuevo) => BloqueNuevo) => void
  /** Si se indica, se muestra el botón "Quitar" */
  onQuitar?: () => void
}

/** Tarjeta para definir un bloque: nombre, plantas, ático y letras de cada planta. */
export default function EditorBloque({ indice, bloque: b, onChange, onQuitar }: Props) {
  /** Cambia cuántas plantas hay sobre la baja; las nuevas copian las letras de la última. */
  function ponerAltura(n: number) {
    onChange((x) => {
      const baja = x.plantas.find((p) => p.planta === 0) ?? { planta: 0, letras: ['A', 'B'] }
      const numeradas = x.plantas.filter((p) => p.planta > 0 && p.planta < ATICO)
      const ultima = numeradas[numeradas.length - 1] ?? baja
      const atico = x.plantas.find((p) => p.planta === ATICO)
      const nuevas: PlantaNueva[] = []
      for (let p = 1; p <= n; p++) {
        nuevas.push(numeradas.find((y) => y.planta === p) ?? { planta: p, letras: [...ultima.letras] })
      }
      return { ...x, plantas: [baja, ...nuevas, ...(atico ? [atico] : [])] }
    })
  }

  function alternarAtico() {
    onChange((x) => {
      if (tieneAtico(x)) return { ...x, plantas: x.plantas.filter((p) => p.planta !== ATICO) }
      const ultima = x.plantas.filter((p) => p.planta < ATICO).slice(-1)[0]
      return { ...x, plantas: [...x.plantas, { planta: ATICO, letras: [...(ultima?.letras ?? ['A', 'B'])] }] }
    })
  }

  function alternarLetra(planta: number, letra: string) {
    onChange((x) => ({
      ...x,
      plantas: x.plantas.map((p) => {
        if (p.planta !== planta) return p
        const letras = p.letras.includes(letra) ? p.letras.filter((l) => l !== letra) : [...p.letras, letra].sort()
        return { ...p, letras }
      })
    }))
  }

  function copiarATodas(planta: number) {
    onChange((x) => {
      const origen = x.plantas.find((p) => p.planta === planta)
      if (!origen) return x
      return { ...x, plantas: x.plantas.map((p) => ({ ...p, letras: [...origen.letras] })) }
    })
  }

  return (
    <div className="tarjeta">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="text"
          value={b.nombre}
          onChange={(e) => onChange((x) => ({ ...x, nombre: e.target.value }))}
          aria-label={`Nombre del bloque ${indice + 1}`}
          style={{ fontWeight: 600 }}
        />
        {onQuitar && (
          <button type="button" className="btn-texto peligro" onClick={onQuitar}>
            Quitar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14 }}>Plantas sobre la baja</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="chip" aria-label="Quitar una planta" disabled={altura(b) <= 0} onClick={() => ponerAltura(altura(b) - 1)}>
            −
          </button>
          <b style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, minWidth: 28, textAlign: 'center' }}>{altura(b)}</b>
          <button type="button" className="chip" aria-label="Añadir una planta" disabled={altura(b) >= 30} onClick={() => ponerAltura(altura(b) + 1)}>
            +
          </button>
        </div>
      </div>

      <label className="interruptor">
        Tiene ático
        <input type="checkbox" checked={tieneAtico(b)} onChange={alternarAtico} />
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
              <button type="button" className="btn-texto" onClick={() => copiarATodas(p.planta)}>
                Copiar a todas
              </button>
            </div>
            <div className="chips">
              {LETRAS.map((l) => (
                <button key={l} type="button" className={`chip ${p.letras.includes(l) ? 'act' : ''}`} aria-pressed={p.letras.includes(l)} onClick={() => alternarLetra(p.planta, l)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}

      <div className="muted">{numViviendas(b)} viviendas en este bloque</div>
    </div>
  )
}
