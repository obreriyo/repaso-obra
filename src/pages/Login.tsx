import CampoClave from '../components/CampoClave'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, configurado } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { mensajeError } from '../lib/format'

type Modo = 'entrar' | 'crear' | 'recuperar'

/** Dirección a la que vuelven los enlaces del correo (sin la parte #/ruta) */
function direccionApp(): string {
  return window.location.origin + window.location.pathname
}

export default function Login() {
  const { usuario, cargando } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [nombre, setNombre] = useState('')
  const [cargo, setCargo] = useState('jefe_obra')
  const [cargoNombre, setCargoNombre] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  if (!cargando && usuario) return <Navigate to="/" replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setOcupado(true)
    try {
      if (modo === 'entrar') {
        const r = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
        if (r.error) throw r.error
      } else if (modo === 'crear') {
        if (clave.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
        const r = await supabase.auth.signUp({
          email: email.trim(),
          password: clave,
          options: { data: { nombre: nombre.trim(), cargo, cargo_nombre: cargoNombre.trim() }, emailRedirectTo: direccionApp() }
        })
        if (r.error) throw r.error
        if (!r.data.session) {
          setMensaje('Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación para entrar.')
        }
      } else {
        const r = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: direccionApp() })
        if (r.error) throw r.error
        setMensaje('Si el correo existe, te hemos enviado un enlace para elegir una nueva contraseña.')
      }
    } catch (err) {
      const texto = mensajeError(err)
      setError(texto === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : texto)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="app">
      <div className="login-cab">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1B1F24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 20h18M5 20V9l7-5 7 5v11" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>
        <h1>Repaso de obra</h1>
        <p>Revisa viviendas, anota fallos con fotos y expórtalos.</p>
      </div>

      <form className="login-form" onSubmit={enviar}>
        {!configurado && (
          <p className="aviso">
            Falta conectar la base de datos. Sigue los pasos del README (variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
          </p>
        )}

        {modo === 'crear' && (
          <>
            <div className="campo">
              <label htmlFor="nombre">Tu nombre</label>
              <input id="nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required />
            </div>
            <div className="campo">
              <label htmlFor="cargo">Cargo</label>
              <select id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)}>
                <option value="jefe_obra">Jefe de obra</option>
                <option value="encargado">Encargado</option>
                <option value="otro">Otro (operario, albañil…)</option>
              </select>
            </div>
            {cargo === 'otro' && (
              <div className="campo">
                <label htmlFor="cargo-nombre">¿Cuál es tu puesto?</label>
                <input id="cargo-nombre" type="text" value={cargoNombre} onChange={(e) => setCargoNombre(e.target.value)} placeholder="Operario, Albañil, Fontanero…" maxLength={40} />
              </div>
            )}
          </>
        )}

        <div className="campo">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>

        {modo !== 'recuperar' && (
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <CampoClave
              id="clave"
              value={clave}
              onChange={setClave}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            />
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {mensaje && <p className="exito">{mensaje}</p>}

        <button className="btn btn-primario" type="submit" disabled={ocupado || !configurado}>
          {ocupado ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : modo === 'crear' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>

        {modo === 'entrar' && (
          <>
            <button type="button" className="btn-texto" onClick={() => { setModo('recuperar'); setError(null); setMensaje(null) }}>
              ¿Has olvidado la contraseña?
            </button>
            <button type="button" className="btn-texto" onClick={() => { setModo('crear'); setError(null); setMensaje(null) }}>
              ¿Aún no tienes cuenta? Crear cuenta
            </button>
          </>
        )}
        {modo !== 'entrar' && (
          <button type="button" className="btn-texto" onClick={() => { setModo('entrar'); setError(null); setMensaje(null) }}>
            Volver a iniciar sesión
          </button>
        )}

        <p className="muted">Tus obras y fallos se guardan en tu cuenta: entra desde cualquier móvil y lo verás todo igual.</p>
      </form>
    </div>
  )
}
