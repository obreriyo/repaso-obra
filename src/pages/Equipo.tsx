import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { copiaDeSeguridad } from '../lib/copia'
import { entregar, puedeCompartir } from '../lib/export'
import { esNativa } from '../lib/nativo'
import { useCarga } from '../lib/hooks'
import { fecha, mensajeError, nombrePersona } from '../lib/format'

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function Equipo() {
  const { obraId = '' } = useParams()
  const { usuario } = useAuth()
  const nav = useNavigate()
  const obra = useCarga(() => api.getObra(obraId), [obraId])
  const miembros = useCarga(() => api.listMiembros(obraId), [obraId])
  const invitaciones = useCarga(() => api.listInvitaciones(obraId), [obraId])
  const actividad = useCarga(() => api.listActividad(obraId), [obraId])

  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [copiaFotos, setCopiaFotos] = useState(false)
  const [copiaOcupada, setCopiaOcupada] = useState(false)
  const [copiaTexto, setCopiaTexto] = useState<string | null>(null)
  const [copiaError, setCopiaError] = useState<string | null>(null)

  async function hacerCopia(compartir: boolean) {
    if (!obra.datos) return
    setCopiaError(null)
    setCopiaOcupada(true)
    try {
      const resultado = await copiaDeSeguridad(obra.datos, { incluirFotos: copiaFotos, progreso: setCopiaTexto })
      await entregar(resultado, compartir)
      setCopiaTexto('Copia lista.')
    } catch (err) {
      // Si la persona cierra la hoja de compartir no es un error
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setCopiaError(mensajeError(err))
        setCopiaTexto(null)
      }
    } finally {
      setCopiaOcupada(false)
    }
  }

  async function invitar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setOcupado(true)
    try {
      const r = await api.invitar(obraId, email)
      setMensaje(
        r === 'anadido'
          ? 'Esa persona ya tenía cuenta y ahora tiene acceso a la obra.'
          : 'Invitación guardada. Cuando cree su cuenta con ese correo verá la obra automáticamente.'
      )
      setEmail('')
      miembros.recargar()
      invitaciones.recargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setOcupado(false)
    }
  }

  async function quitar(userId: string, nombre: string) {
    if (!window.confirm(`¿Quitar a ${nombre} de esta obra?`)) return
    try {
      await api.quitarMiembro(obraId, userId)
      miembros.recargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  async function cancelar(correo: string) {
    try {
      await api.cancelarInvitacion(obraId, correo)
      invitaciones.recargar()
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  async function eliminarObra() {
    const nombre = obra.datos?.nombre ?? 'esta obra'
    if (!window.confirm(`¿Eliminar «${nombre}» con todas sus viviendas, fallos y fotos? No se puede deshacer.`)) return
    if (!window.confirm(`Última confirmación: se borrará «${nombre}» para siempre, para todo el equipo. ¿Seguro?`)) return
    try {
      await api.borrarObra(obraId)
      nav('/', { replace: true })
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  return (
    <Pantalla
      obraId={obraId}
      eyebrow={obra.datos?.nombre}
      titulo="Equipo"
      subtitulo="Todos pueden ver, crear, editar y exportar"
    >
      <Estado cargando={miembros.cargando} error={miembros.error || actividad.error} />

      <h2 className="seccion">Personas con acceso</h2>
      {(miembros.datos ?? []).map((m) => {
        const nombre = nombrePersona(m.profiles)
        const yo = m.user_id === usuario?.id
        return (
          <div key={m.user_id} className="fila">
            <div className={`avatar ${yo ? '' : 'gris'}`}>{iniciales(nombre) || '?'}</div>
            <div className="texto">
              <span className="titulo-fila">
                {nombre}
                {yo ? ' (tú)' : ''}
              </span>
              <span className="meta">
                {m.profiles?.cargo === 'jefe_obra' ? 'Jefe de obra' : 'Encargado'}
                {m.profiles?.email ? ` · ${m.profiles.email}` : ''}
              </span>
            </div>
            {!yo && (
              <button className="btn-texto peligro" onClick={() => void quitar(m.user_id, nombre)}>
                Quitar
              </button>
            )}
          </div>
        )
      })}

      {(invitaciones.datos ?? []).map((i) => (
        <div key={i.email} className="fila" style={{ borderStyle: 'dashed' }}>
          <div className="avatar gris">?</div>
          <div className="texto">
            <span className="titulo-fila">{i.email}</span>
            <span className="meta">Invitación pendiente</span>
          </div>
          <button className="btn-texto peligro" onClick={() => void cancelar(i.email)}>
            Cancelar
          </button>
        </div>
      ))}

      <form onSubmit={invitar} className="tarjeta">
        <div className="campo">
          <label htmlFor="invitar">Invitar por correo</label>
          <input id="invitar" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required />
        </div>
        {error && <p className="error">{error}</p>}
        {mensaje && <p className="exito">{mensaje}</p>}
        <button className="btn btn-primario" type="submit" disabled={ocupado}>
          {ocupado ? 'Invitando…' : 'Invitar'}
        </button>
      </form>

      <h2 className="seccion">Actividad reciente</h2>
      <div className="registro-actividad">
        {(actividad.datos ?? []).length === 0 && <div className="muted">Aún no hay actividad.</div>}
        {(actividad.datos ?? []).map((a) => (
          <div key={a.id}>
            <span>
              <b>{nombrePersona(a.profiles)}</b> {a.texto}
            </span>
            <small>{fecha(a.created_at)}</small>
          </div>
        ))}
      </div>

      <h2 className="seccion">Copia de seguridad</h2>
      <div className="tarjeta">
        <p className="muted">
          Descarga todos los datos de esta obra (viviendas, fallos, equipo y actividad) en un zip con un Excel y un archivo de datos.
        </p>
        <div className="panel">
          <label className="interruptor">
            Incluir las fotos (pesa más)
            <input type="checkbox" checked={copiaFotos} onChange={(e) => setCopiaFotos(e.target.checked)} />
          </label>
        </div>
        {copiaError && <p className="error">{copiaError}</p>}
        {copiaTexto && <p className="muted">{copiaTexto}</p>}
        <div className="acciones">
          {puedeCompartir() && !esNativa() && (
            <button className="btn" disabled={copiaOcupada || !obra.datos} onClick={() => void hacerCopia(true)}>
              Compartir
            </button>
          )}
          <button className="btn btn-primario" disabled={copiaOcupada || !obra.datos} onClick={() => void hacerCopia(false)}>
            {copiaOcupada ? 'Preparando…' : esNativa() ? 'Compartir o guardar copia' : 'Descargar copia'}
          </button>
        </div>
      </div>

      <button className="btn btn-peligro" onClick={() => void eliminarObra()}>
        Eliminar esta obra
      </button>
    </Pantalla>
  )
}
