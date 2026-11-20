import { useState } from 'react'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { copiaDeSeguridad } from '../lib/copia'
import { entregar } from '../lib/export'
import { mensajeError } from '../lib/format'
import { useCarga } from '../lib/hooks'
import type { Obra } from '../lib/types'

export default function Cuenta() {
  const { usuario } = useAuth()
  const { datos: obras, error, cargando, recargar } = useCarga(() => api.obrasDeMiCuenta(), [])
  const [paso, setPaso] = useState<1 | 2>(1)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiando, setCopiando] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  async function copia(o: api.ObraDeCuenta) {
    setFallo(null)
    setCopiando(o.id)
    try {
      const resultado = await copiaDeSeguridad({ id: o.id, nombre: o.nombre, direccion: o.direccion } as unknown as Obra, {
        incluirFotos: true,
        progreso: setProgreso
      })
      await entregar(resultado, false, o.id)
      setProgreso('Copia lista. Guárdala bien: es la única forma de recuperar esta obra.')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setFallo(mensajeError(e))
        setProgreso(null)
      }
    } finally {
      setCopiando(null)
    }
  }

  async function eliminar() {
    if (texto.trim().toUpperCase() !== 'ELIMINAR') return
    if (!window.confirm('ÚLTIMO AVISO: se borrarán para siempre tu cuenta y todos tus datos. No se puede deshacer. ¿Eliminar ahora?')) return
    setFallo(null)
    setOcupado(true)
    try {
      await api.eliminarCuenta()
      window.alert('Tu cuenta y todos tus datos se han eliminado.')
      await api.cerrarSesionLocal()
    } catch (e) {
      setFallo(mensajeError(e))
      setOcupado(false)
    }
  }

  const sinObras = obras && obras.length === 0

  return (
    <Pantalla titulo="Mi cuenta" atras={{ a: '/', texto: 'Mis obras' }}>
      <div className="tarjeta">
        <div className="muted">Cuenta</div>
        <div>{usuario?.email}</div>
      </div>

      <h2 className="seccion">Eliminar mi cuenta</h2>
      <div className="tarjeta" style={{ borderColor: 'var(--rojo)', borderWidth: 2, borderStyle: 'solid' }}>
        <p style={{ color: 'var(--rojo)', fontWeight: 700 }}>⚠ Esto es definitivo y no se puede deshacer.</p>
        <p>
          Se borrarán para siempre tu cuenta y <b>todos tus datos</b>: las obras que has creado, con sus bloques, viviendas, fallos y
          fotos. Nadie podrá recuperarlos, ni siquiera nosotros.
        </p>

        <Estado cargando={cargando} error={error} reintentar={recargar} />
        {sinObras && <p className="muted">No tienes ninguna obra creada.</p>}
        {obras && obras.length > 0 && (
          <>
            <p>
              <b>Se borrarán estas obras:</b>
            </p>
            {obras.map((o) => (
              <div key={o.id} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b>{o.nombre}</b>
                {o.otros > 0 && (
                  <span style={{ color: 'var(--rojo)' }}>
                    ⚠ {o.otros} {o.otros === 1 ? 'persona más perderá' : 'personas más perderán'} el acceso a esta obra.
                  </span>
                )}
                <button className="btn" disabled={copiando !== null || ocupado} onClick={() => void copia(o)}>
                  {copiando === o.id ? 'Preparando copia…' : 'Descargar copia de seguridad (con fotos)'}
                </button>
              </div>
            ))}
            <p className="muted">
              Si quieres conservar tus datos, descarga ahora una copia de cada obra. Después podrás restaurarla en una cuenta nueva desde
              «Mis obras» → «Restaurar una copia de seguridad». Una cuenta gratuita solo admite una obra, 15 fotos y sin trasteros ni
              zonas comunes.
            </p>
          </>
        )}
        {progreso && <p className="muted">{progreso}</p>}
        {fallo && <p className="error">{fallo}</p>}

        {paso === 1 && (
          <button className="btn btn-peligro" disabled={cargando || !!error || copiando !== null} onClick={() => setPaso(2)}>
            Quiero eliminar mi cuenta
          </button>
        )}
        {paso === 2 && (
          <>
            <div className="campo">
              <label htmlFor="eliminar">Para confirmarlo, escribe ELIMINAR</label>
              <input id="eliminar" type="text" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
            </div>
            <button className="btn btn-peligro" disabled={ocupado || texto.trim().toUpperCase() !== 'ELIMINAR'} onClick={() => void eliminar()}>
              {ocupado ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
            </button>
            <button className="btn-texto" disabled={ocupado} onClick={() => { setPaso(1); setTexto('') }}>
              No, cancelar
            </button>
          </>
        )}
      </div>
    </Pantalla>
  )
}
