import { parsearTrasteros } from '../lib/trasteros'

interface Props {
  texto: string
  onChange: (texto: string) => void
}

/** Campo para escribir los números de trastero de un bloque (rangos o listas). */
export default function CampoTrasteros({ texto, onChange }: Props) {
  let cuenta = ''
  let fallo = ''
  try {
    const n = parsearTrasteros(texto).length
    if (n > 0) cuenta = `${n} ${n === 1 ? 'trastero' : 'trasteros'}`
  } catch (e) {
    fallo = e instanceof Error ? e.message : 'No se entienden los números.'
  }
  return (
    <div className="campo">
      <label htmlFor="trasteros">Trasteros (opcional)</label>
      <input
        id="trasteros"
        type="text"
        value={texto}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Por ejemplo 1-12, o 1, 2, 5, 8"
        autoCapitalize="none"
      />
      <span className="muted">Escribe un rango (1-12) o los números separados por comas. Si ya existe alguno, no se repite.</span>
      {cuenta && <span className="muted">{cuenta}</span>}
      {fallo && <span className="error">{fallo}</span>}
    </div>
  )
}
