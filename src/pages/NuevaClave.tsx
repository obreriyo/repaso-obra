import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { mensajeError } from '../lib/format'

/** Pantalla que se muestra al llegar desde el enlace de "he olvidado la contraseña". */
export default function NuevaClave() {
  const { terminarRecuperacion } = useAuth()
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (clave.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setOcupado(true)
    try {
      const r = await supabase.auth.updateUser({ password: clave })
      if (r.error) throw r.error
      terminarRecuperacion()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="app">
      <div className="login-cab">
        <h1>Nueva contraseña</h1>
        <p>Elige la contraseña con la que vas a entrar a partir de ahora.</p>
      </div>
      <form className="login-form" onSubmit={guardar}>
        <div className="campo">
          <label htmlFor="nueva">Nueva contraseña</label>
          <input id="nueva" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primario" type="submit" disabled={ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  )
}
