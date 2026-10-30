import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import NuevaClave from './pages/NuevaClave'
import Obras from './pages/Obras'
import NuevaObra from './pages/NuevaObra'
import Viviendas from './pages/Viviendas'
import Vivienda from './pages/Vivienda'
import FalloForm from './pages/FalloForm'
import Fallos from './pages/Fallos'
import Equipo from './pages/Equipo'

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

export default function App() {
  const { recuperando } = useAuth()

  if (recuperando) return <NuevaClave />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Privada><Obras /></Privada>} />
      <Route path="/nueva-obra" element={<Privada><NuevaObra /></Privada>} />
      <Route path="/obra/:obraId" element={<Privada><Viviendas /></Privada>} />
      <Route path="/obra/:obraId/vivienda/:viviendaId" element={<Privada><Vivienda /></Privada>} />
      <Route path="/obra/:obraId/vivienda/:viviendaId/fallo/nuevo" element={<Privada><FalloForm /></Privada>} />
      <Route path="/obra/:obraId/fallo/:falloId" element={<Privada><FalloForm /></Privada>} />
      <Route path="/obra/:obraId/fallos" element={<Privada><Fallos /></Privada>} />
      <Route path="/obra/:obraId/equipo" element={<Privada><Equipo /></Privada>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
