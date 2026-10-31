import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensajeError } from '../lib/format'
import { useCarga } from '../lib/hooks'
import type { Obra } from '../lib/types'

export default function Obras() {
  const { usuario, salir } = useAuth()
  const { datos: obras, error, cargando, recargar } = useCarga(() => api.listObras(), [])
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  async function eliminar(o: Obra) {
    if (!window.confirm(`¿Eliminar la obra «${o.nombre}» con sus ${o.viviendas} viviendas, todos sus fallos y fotos? No se puede deshacer.`)) return
    if (!window.confirm(`Última confirmación: se borrará «${o.nombre}» para siempre, para todo el equipo. ¿Seguro?`)) return
    setErrorBorrar(null)
    setBorrando(o.id)
    try {
      await api.borrarObra(o.id)
      recargar()
    } catch (e) {
      setErrorBorrar(mensajeError(e))
    } finally {
      setBorrando(null)
    }
  }

  return (
    <Pantalla eyebrow="Repaso de obra" titulo="Mis obras" subtitulo="Elige la obra que vas a revisar">
      <Estado cargando={cargando} error={error || errorBorrar} />

      {obras && obras.length === 0 && (
        <p className="muted">Todavía no tienes ninguna obra. Crea la primera para empezar.</p>
      )}

      {obras?.map((o) => {
        const pct = o.viviendas > 0 ? Math.round((o.revisadas / o.viviendas) * 100) : 0
        return (
          <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Link to={`/obra/${o.id}`} className="tarjeta">
              <div className="titulo-obra">{o.nombre}</div>
              <div className="muted">
                {o.bloques} {o.bloques === 1 ? 'bloque' : 'bloques'} · {o.viviendas} viviendas
                {o.direccion ? ` · ${o.direccion}` : ''}
              </div>
              <div>
                <div className="barra-texto">
                  <span>Revisadas</span>
                  <b style={{ color: 'var(--carbon)' }}>
                    {o.revisadas} de {o.viviendas}
                  </b>
                </div>
                <div className="barra">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: o.fallos_abiertos > 0 ? 'var(--rojo)' : 'var(--verde)' }}>
                {o.fallos_abiertos} fallos abiertos
              </div>
            </Link>
            <button type="button" className="btn-texto peligro" disabled={borrando === o.id} onClick={() => void eliminar(o)}>
              {borrando === o.id ? 'Eliminando…' : 'Eliminar esta obra'}
            </button>
          </div>
        )
      })}

      <Link className="btn btn-primario" to="/nueva-obra">
        + Nueva obra
      </Link>

      <div className="pie-sesion">
        <span>{usuario?.email}</span>
        <button className="btn-texto" onClick={() => void salir()}>
          Cerrar sesión
        </button>
      </div>
    </Pantalla>
  )
}
