import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  titulo: string
  subtitulo?: string
  atras?: { a: string; texto: string }
  derecha?: ReactNode
  /** Contenido extra dentro de la cabecera oscura (pestañas, barra de progreso…) */
  cabExtra?: ReactNode
  /** Si se indica, se muestra la navegación inferior de esa obra */
  obraId?: string
  children: ReactNode
}

function IconoAtras() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9CCD1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function Pantalla({ eyebrow, titulo, subtitulo, atras, derecha, cabExtra, obraId, children }: Props) {
  return (
    <div className={`app ${obraId ? 'con-nav' : ''}`}>
      <header className="cab">
        {atras && (
          <Link className="atras" to={atras.a}>
            <IconoAtras />
            {atras.texto}
          </Link>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="cab-fila">
          <h1 className="titulo">{titulo}</h1>
          {derecha}
        </div>
        {subtitulo && <div className="sub">{subtitulo}</div>}
        {cabExtra}
      </header>

      <main className="contenido">{children}</main>

      {obraId && (
        <nav className="nav" aria-label="Navegación principal">
          <NavLink to={`/obra/${obraId}`} end>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 11l8-7 8 7v9H4z" />
            </svg>
            Viviendas
          </NavLink>
          <NavLink to={`/obra/${obraId}/fallos`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4l9 16H3z" />
              <path d="M12 10v4M12 17v.5" />
            </svg>
            Fallos
          </NavLink>
          <NavLink to={`/obra/${obraId}/equipo`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3.5 3.5 0 010 7M18 14c2 .8 3 2.8 3 6" />
            </svg>
            Equipo
          </NavLink>
        </nav>
      )}
    </div>
  )
}

export function Estado({ cargando, error }: { cargando?: boolean; error?: string | null }) {
  return (
    <>
      {cargando && <p className="muted">Cargando…</p>}
      {error && <p className="error">{error}</p>}
    </>
  )
}
