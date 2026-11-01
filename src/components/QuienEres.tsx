import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { cargoTexto } from '../lib/format'
import { elegirPersona, hayEleccion, personaActiva } from '../lib/quien'
import type { PersonaCuenta } from '../lib/types'

/**
 * Pantalla «¿Quién eres?»: aparece cuando la cuenta tiene personas añadidas y en este móvil
 * todavía no se ha elegido ninguna (o se pide cambiar). La elección se recuerda en el móvil.
 */
export default function QuienEres() {
  const { usuario } = useAuth()
  const [personas, setPersonas] = useState<PersonaCuenta[] | null>(null)
  const [abierta, setAbierta] = useState(false)
  const [manual, setManual] = useState(false)

  const cargar = useCallback(() => {
    if (!usuario) {
      setPersonas(null)
      return
    }
    api
      .listPersonas()
      .then((lista) => {
        setPersonas(lista)
        // Si la persona elegida ya no existe (la quitaron) o cambió, se actualiza
        const activa = personaActiva(usuario.id)
        if (activa) {
          const actual = lista.find((p) => p.id === activa.id)
          if (!actual) elegirPersona(usuario.id, null)
          else if (JSON.stringify(actual) !== JSON.stringify(activa)) elegirPersona(usuario.id, actual)
        }
      })
      .catch(() => {
        /* sin conexión y sin copia: no se pregunta */
      })
  }, [usuario])

  useEffect(() => {
    cargar()
    const alCambiar = () => cargar()
    const alAbrir = () => {
      setManual(true)
      setAbierta(true)
      cargar()
    }
    window.addEventListener('repaso-personas', alCambiar)
    window.addEventListener('repaso-quien-abrir', alAbrir)
    window.addEventListener('online', alCambiar)
    return () => {
      window.removeEventListener('repaso-personas', alCambiar)
      window.removeEventListener('repaso-quien-abrir', alAbrir)
      window.removeEventListener('online', alCambiar)
    }
  }, [cargar])

  if (!usuario || !personas || personas.length === 0) return null

  const hayQuePreguntar = !hayEleccion(usuario.id)
  if (!abierta && !hayQuePreguntar) return null

  function elegir(p: PersonaCuenta | null) {
    if (!usuario) return
    elegirPersona(usuario.id, p)
    setAbierta(false)
    setManual(false)
  }

  const activa = personaActiva(usuario.id)

  return (
    <div className="quien" role="dialog" aria-modal="true" aria-label="¿Quién eres?">
      <div className="app" style={{ minHeight: '100dvh' }}>
        <header className="cab">
          <h1 className="titulo">¿Quién eres?</h1>
          <div className="sub">Tu nombre saldrá en los fallos que apuntes. Se recuerda en este móvil.</div>
        </header>
        <main className="contenido">
          {personas.map((p) => (
            <button key={p.id} type="button" className={`fila ${activa?.id === p.id ? 'fila-act' : ''}`} onClick={() => elegir(p)}>
              <div className="avatar">{(p.nombre.trim()[0] ?? '?').toUpperCase()}</div>
              <div className="texto">
                <span className="titulo-fila">{p.nombre}</span>
                <span className="meta">{cargoTexto(p)}</span>
              </div>
            </button>
          ))}
          <button type="button" className="btn" onClick={() => elegir(null)}>
            Soy el titular de la cuenta ({usuario.email})
          </button>
          {manual && (
            <button type="button" className="btn-texto" onClick={() => { setAbierta(false); setManual(false) }}>
              Cancelar
            </button>
          )}
        </main>
      </div>
    </div>
  )
}
