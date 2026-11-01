import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Estado, Pantalla } from '../components/Pantalla'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { copiaDeSeguridad } from '../lib/copia'
import { entregar, puedeCompartir } from '../lib/export'
import { useCarga } from '../lib/hooks'
import { abrirSelector, personaActiva } from '../lib/quien'
import type { PersonaCuenta } from '../lib/types'
import { cargoTexto, fecha, mensajeError, nombrePersona } from '../lib/format'

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

  const subs = useCarga(() => api.listSubcontratas(obraId), [obraId])
  // Varias personas con el mismo correo
  const [, repintar] = useState(0)
  useEffect(() => {
    const alCambiar = () => repintar((n) => n + 1)
    window.addEventListener('repaso-quien', alCambiar)
    return () => window.removeEventListener('repaso-quien', alCambiar)
  }, [])
  const personas = useCarga(() => api.listPersonas(), [])
  const [pEditando, setPEditando] = useState<string | 'nueva' | null>(null)
  const [pNombre, setPNombre] = useState('')
  const [pCargo, setPCargo] = useState<PersonaCuenta['cargo']>('encargado')
  const [pPuesto, setPPuesto] = useState('')
  const [pError, setPError] = useState<string | null>(null)
  const [pOcupado, setPOcupado] = useState(false)
  const [nuevaSub, setNuevaSub] = useState('')
  const [errorSub, setErrorSub] = useState<string | null>(null)
  const [descarga, setDescarga] = useState<number | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [descargaError, setDescargaError] = useState<string | null>(null)

  useEffect(() => {
    void api.ultimaDescarga(obraId).then(setDescarga)
  }, [obraId])

  async function descargarDatos() {
    setDescargaError(null)
    setDescargando(true)
    try {
      const hecho = await api.descargarObra(obraId)
      if (!hecho) setDescargaError('Hay cambios sin enviar; se descargarán en cuanto se envíen.')
      setDescarga(await api.ultimaDescarga(obraId))
    } catch (err) {
      setDescargaError(mensajeError(err))
    } finally {
      setDescargando(false)
    }
  }

  async function añadirSub(e: FormEvent) {
    e.preventDefault()
    setErrorSub(null)
    try {
      await api.crearSubcontrata(obraId, nuevaSub)
      setNuevaSub('')
      subs.recargar()
    } catch (err) {
      setErrorSub(mensajeError(err))
    }
  }

  async function quitarSub(id: string, nombre: string) {
    if (!window.confirm(`¿Quitar «${nombre}» de la lista? Los fallos que ya la tienen asignada no cambian.`)) return
    setErrorSub(null)
    try {
      await api.borrarSubcontrata(obraId, id)
      subs.recargar()
    } catch (err) {
      setErrorSub(mensajeError(err))
    }
  }

  // Cambio de cargo (solo jefe de obra o encargado)
  const [editando, setEditando] = useState<string | null>(null)
  const [cargoSel, setCargoSel] = useState('encargado')
  const [cargoNombre, setCargoNombre] = useState('')
  const [cargoOcupado, setCargoOcupado] = useState(false)
  const miCargo = (miembros.datos ?? []).find((m) => m.user_id === usuario?.id)?.profiles?.cargo
  const puedoCambiarCargos = miCargo === 'jefe_obra' || miCargo === 'encargado'

  // Quién soy en este móvil: la persona elegida o, si no hay, el titular de la cuenta
  const activa = personaActiva(usuario?.id)
  const cargoActivo = activa ? activa.cargo : miCargo
  const puedoGestionarPersonas = cargoActivo === 'jefe_obra' || cargoActivo === 'encargado'

  function abrirPersona(p: PersonaCuenta | null) {
    setPError(null)
    setPEditando(p ? p.id : 'nueva')
    setPNombre(p?.nombre ?? '')
    setPCargo(p?.cargo ?? 'encargado')
    setPPuesto(p?.cargo === 'otro' ? (p.cargo_nombre ?? '') : '')
  }

  async function guardarPersona(e: FormEvent) {
    e.preventDefault()
    setPError(null)
    setPOcupado(true)
    try {
      const datos = { nombre: pNombre, cargo: pCargo, cargo_nombre: pPuesto }
      if (pEditando === 'nueva') await api.crearPersona(datos)
      else if (pEditando) await api.editarPersona(pEditando, datos)
      setPEditando(null)
      personas.recargar()
    } catch (err) {
      setPError(mensajeError(err))
    } finally {
      setPOcupado(false)
    }
  }

  async function quitarPersona(p: PersonaCuenta) {
    if (!window.confirm(`¿Quitar a ${p.nombre} de la lista? Lo que ya apuntó conserva su nombre.`)) return
    setPError(null)
    try {
      await api.borrarPersona(p.id)
      personas.recargar()
    } catch (err) {
      setPError(mensajeError(err))
    }
  }

  async function guardarCargo(userId: string) {
    setError(null)
    setCargoOcupado(true)
    try {
      await api.cambiarCargo(userId, cargoSel, cargoNombre)
      setEditando(null)
      miembros.recargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setCargoOcupado(false)
    }
  }

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
      await entregar(resultado, compartir, obra.datos.id)
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
                {cargoTexto(m.profiles)}
                {m.profiles?.email ? ` · ${m.profiles.email}` : ''}
              </span>
              {editando === m.user_id && (
                <div className="campo" style={{ marginTop: 8 }}>
                  <select value={cargoSel} onChange={(e) => setCargoSel(e.target.value)} aria-label="Cargo">
                    <option value="jefe_obra">Jefe de obra</option>
                    <option value="encargado">Encargado</option>
                    <option value="otro">Otro (operario, albañil…)</option>
                  </select>
                  {cargoSel === 'otro' && (
                    <input type="text" value={cargoNombre} onChange={(e) => setCargoNombre(e.target.value)} placeholder="Operario, Albañil, Fontanero…" maxLength={40} aria-label="Nombre del puesto" />
                  )}
                  <div className="acciones">
                    <button type="button" className="btn btn-pequeno" disabled={cargoOcupado} onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-pequeno btn-primario" disabled={cargoOcupado} onClick={() => void guardarCargo(m.user_id)}>
                      {cargoOcupado ? 'Guardando…' : 'Guardar cargo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {puedoCambiarCargos && editando !== m.user_id && (
              <button
                className="btn-texto"
                onClick={() => {
                  setEditando(m.user_id)
                  setCargoSel(m.profiles?.cargo ?? 'encargado')
                  setCargoNombre(m.profiles?.cargo === 'otro' ? (m.profiles?.cargo_nombre ?? '') : '')
                }}
              >
                Cargo
              </button>
            )}
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

      <h2 className="seccion">Personas de esta cuenta</h2>
      <div className="tarjeta">
        <p className="muted">
          Si varias personas entran con el mismo correo, añádelas aquí. Cada una elige quién es en su móvil y su nombre sale en los fallos que apunta.
        </p>
        {(personas.datos ?? []).length > 0 && (
          <p className="muted">
            En este móvil eres: <b>{activa ? activa.nombre : 'el titular de la cuenta'}</b>{' '}
            <button type="button" className="btn-texto" onClick={abrirSelector}>
              Cambiar
            </button>
          </p>
        )}
        {(personas.datos ?? []).map((p) => (
          <div key={p.id} className="fila">
            <div className="avatar gris">{(p.nombre.trim()[0] ?? '?').toUpperCase()}</div>
            <div className="texto">
              <span className="titulo-fila">
                {p.nombre}
                {activa?.id === p.id ? ' (tú)' : ''}
              </span>
              <span className="meta">{cargoTexto(p)}</span>
            </div>
            {puedoGestionarPersonas && (
              <>
                <button className="btn-texto" onClick={() => abrirPersona(p)}>
                  Editar
                </button>
                <button className="btn-texto peligro" onClick={() => void quitarPersona(p)}>
                  Quitar
                </button>
              </>
            )}
          </div>
        ))}
        {pEditando && (
          <form onSubmit={guardarPersona} className="campo">
            <input type="text" value={pNombre} onChange={(e) => setPNombre(e.target.value)} placeholder="Nombre de la persona" maxLength={60} aria-label="Nombre de la persona" required />
            <select value={pCargo} onChange={(e) => setPCargo(e.target.value as PersonaCuenta['cargo'])} aria-label="Cargo de la persona">
              <option value="jefe_obra">Jefe de obra</option>
              <option value="encargado">Encargado</option>
              <option value="otro">Otro (operario, albañil…)</option>
            </select>
            {pCargo === 'otro' && (
              <input type="text" value={pPuesto} onChange={(e) => setPPuesto(e.target.value)} placeholder="Operario, Albañil, Fontanero…" maxLength={40} aria-label="Nombre del puesto" />
            )}
            <div className="acciones">
              <button type="button" className="btn btn-pequeno" disabled={pOcupado} onClick={() => setPEditando(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-pequeno btn-primario" disabled={pOcupado}>
                {pOcupado ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
        {pError && <p className="error">{pError}</p>}
        {puedoGestionarPersonas && !pEditando && (
          <button className="btn" onClick={() => abrirPersona(null)}>
            + Añadir persona
          </button>
        )}
        {!puedoGestionarPersonas && <p className="muted">Solo el jefe de obra y los encargados pueden cambiar esta lista.</p>}
      </div>

      <h2 className="seccion">Subcontratas</h2>
      <div className="tarjeta">
        <p className="muted">Al apuntar un fallo podrás elegir la subcontrata responsable con un toque.</p>
        <div className="chips">
          {(subs.datos ?? []).length === 0 && <span className="muted">Todavía no hay ninguna.</span>}
          {(subs.datos ?? []).map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => void quitarSub(s.id, s.nombre)} aria-label={`Quitar ${s.nombre}`}>
              {s.nombre} ×
            </button>
          ))}
        </div>
        <form onSubmit={añadirSub} className="acciones">
          <input type="text" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} placeholder="Nueva subcontrata (Fontanería Ruiz)" aria-label="Nueva subcontrata" />
          <button className="btn btn-primario" type="submit" disabled={!nuevaSub.trim()}>
            Añadir
          </button>
        </form>
        {errorSub && <p className="error">{errorSub}</p>}
      </div>

      <h2 className="seccion">Trabajar sin conexión</h2>
      <div className="tarjeta">
        <p className="muted">
          La app guarda en el móvil los datos de la obra cuando la abres con internet. Sin cobertura puedes seguir apuntando fallos y haciendo fotos; se envían solos al volver la conexión.
          {descarga ? ` Última descarga: ${fecha(new Date(descarga).toISOString())}.` : ' Todavía no se han descargado.'}
        </p>
        {descargaError && <p className="error">{descargaError}</p>}
        <button className="btn" disabled={descargando} onClick={() => void descargarDatos()}>
          {descargando ? 'Descargando…' : 'Descargar datos de esta obra'}
        </button>
      </div>

      <h2 className="seccion">Actividad reciente</h2>
      <div className="registro-actividad">
        {(actividad.datos ?? []).length === 0 && <div className="muted">Aún no hay actividad.</div>}
        {(actividad.datos ?? []).map((a) => (
          <div key={a.id}>
            <span>
              <b>{a.persona || nombrePersona(a.profiles)}</b> {a.texto}
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
          {puedeCompartir() && (
            <button className="btn" disabled={copiaOcupada || !obra.datos} onClick={() => void hacerCopia(true)}>
              Compartir
            </button>
          )}
          <button className="btn btn-primario" disabled={copiaOcupada || !obra.datos} onClick={() => void hacerCopia(false)}>
            {copiaOcupada ? 'Preparando…' : 'Descargar copia'}
          </button>
        </div>
      </div>

      <button className="btn btn-peligro" onClick={() => void eliminarObra()}>
        Eliminar esta obra
      </button>
    </Pantalla>
  )
}
