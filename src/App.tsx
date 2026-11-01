import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { esNativa } from './lib/nativo'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import NuevaClave from './pages/NuevaClave'
import Obras from './pages/Obras'
import NuevaObra from './pages/NuevaObra'
import NuevoBloque from './pages/NuevoBloque'
import Viviendas from './pages/Viviendas'
import Vivienda from './pages/Vivienda'
import FalloForm from './pages/FalloForm'
import Fallos from './pages/Fallos'
import Equipo from './pages/Equipo'
import NuevosTrasteros from './pages/NuevosTrasteros'
import EstadoSync from './components/EstadoSync'

function Privada({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth()
  if (cargando) {
    return (
      <div className="app">
        <main className="contenido">
          <p className="muted">Cargando…</p>
        </main>
      </div>
    )
  }
  if (!usuario) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Botón "atrás" de Android: vuelve a la pantalla anterior y, estando en el inicio,
 * pregunta si se quiere salir de la app (en vez de cerrarla de golpe).
 */
function BotonAtras() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const ruta = useRef(pathname)
  ruta.current = pathname

  useEffect(() => {
    if (!esNativa()) return
    let cancelado = false
    let quitar: (() => void) | null = null

    CapApp.addListener('backButton', () => {
      const actual = ruta.current
      if (actual === '/' || actual === '/login') {
        if (window.confirm('¿Quieres salir de la app?')) void CapApp.exitApp()
        return
      }
      const posicion = (window.history.state as { idx?: number } | null)?.idx ?? 0
      if (posicion > 0) nav(-1)
      else nav('/', { replace: true })
    }).then((escucha) => {
      if (cancelado) void escucha.remove()
      else quitar = () => void escucha.remove()
    })

    return () => {
      cancelado = true
      if (quitar) quitar()
    }
  }, [nav])

  return null
}

export default function App() {
  const { recuperando } = useAuth()

  if (recuperando) return <NuevaClave />

  return (
    <>
    <BotonAtras />
    <EstadoSync />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Privada><Obras /></Privada>} />
      <Route path="/nueva-obra" element={<Privada><NuevaObra /></Privada>} />
      <Route path="/obra/:obraId" element={<Privada><Viviendas /></Privada>} />
      <Route path="/obra/:obraId/nuevo-bloque" element={<Privada><NuevoBloque /></Privada>} />
      <Route path="/obra/:obraId/bloque/:bloqueId/trasteros" element={<Privada><NuevosTrasteros /></Privada>} />
      <Route path="/obra/:obraId/vivienda/:viviendaId" element={<Privada><Vivienda /></Privada>} />
      <Route path="/obra/:obraId/vivienda/:viviendaId/fallo/nuevo" element={<Privada><FalloForm /></Privada>} />
      <Route path="/obra/:obraId/fallo/:falloId" element={<Privada><FalloForm /></Privada>} />
      <Route path="/obra/:obraId/fallos" element={<Privada><Fallos /></Privada>} />
      <Route path="/obra/:obraId/equipo" element={<Privada><Equipo /></Privada>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
