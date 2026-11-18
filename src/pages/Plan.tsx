import { useNavigate } from 'react-router-dom'
import { Pantalla } from '../components/Pantalla'
import { usePlan } from '../lib/hooks'

const FILAS: [string, string, string][] = [
  ['Obras', '1', 'Todas las que quieras'],
  ['Bloques y viviendas', 'Sin límite', 'Sin límite'],
  ['Personas con acceso', 'Solo tú', 'Todo tu equipo'],
  ['Fotos', '15 en total', 'Sin límite'],
  ['Trasteros y zonas comunes', 'No', 'Sí'],
  ['Exportar y compartir (PDF y Excel)', 'No', 'Sí'],
  ['Copia de seguridad', 'Sí', 'Sí']
]

export default function Plan() {
  const nav = useNavigate()
  const { estado } = usePlan()
  const completo = estado?.plan === 'completo'
  return (
    <Pantalla titulo="Versión de pago">
      <button className="btn-texto" onClick={() => nav(-1)}>
        ← Volver
      </button>
      <div className="tarjeta">
        <p>
          <strong>Tu plan: {completo ? 'versión completa' : 'versión gratuita'}</strong>
        </p>
        {!completo && estado && (
          <p className="muted">
            Obras: {estado.obras_propias} de {estado.max_obras}
          </p>
        )}
      </div>
      <div className="tarjeta">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}></th>
              <th style={{ textAlign: 'left' }}>Gratis</th>
              <th style={{ textAlign: 'left' }}>De pago</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map(([a, b, c]) => (
              <tr key={a}>
                <td style={{ padding: '6px 4px' }}>{a}</td>
                <td style={{ padding: '6px 4px' }}>{b}</td>
                <td style={{ padding: '6px 4px' }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!completo && (
        <div className="tarjeta">
          <p>
            <strong>Muy pronto</strong> podrás pasar a la versión de pago desde aquí. Mientras tanto, conservas todo lo que
            ya has hecho; solo se bloquea añadir más.
          </p>
        </div>
      )}
    </Pantalla>
  )
}
