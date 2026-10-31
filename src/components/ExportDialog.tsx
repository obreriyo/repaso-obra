import { useState } from 'react'
import { entregar, generar, puedeCompartir } from '../lib/export'
import type { Formato } from '../lib/export'
import { mensajeError, ubicacion } from '../lib/format'
import { esNativa } from '../lib/nativo'
import type { Fallo } from '../lib/types'

interface Props {
  fallos: Fallo[]
  titulo: string
  subtitulo: string
  /** Nombre del archivo sin extensión */
  archivo: string
  /** Etiqueta de la opción de agrupar y por qué se agrupa */
  agruparPor: 'estancia' | 'ubicacion'
  soloAbiertosInicial: boolean
  onClose: () => void
}

export default function ExportDialog({
  fallos,
  titulo,
  subtitulo,
  archivo,
  agruparPor,
  soloAbiertosInicial,
  onClose
}: Props) {
  const [formato, setFormato] = useState<Formato>('pdf')
  const [fotos, setFotos] = useState(true)
  const [soloAbiertos, setSoloAbiertos] = useState(soloAbiertosInicial)
  const [agrupar, setAgrupar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lista = soloAbiertos ? fallos.filter((f) => f.estado === 'abierto') : fallos
  const nativa = esNativa()
  const compartible = puedeCompartir() && !nativa

  async function ejecutar(compartir: boolean) {
    setOcupado(true)
    setError(null)
    try {
      const resultado = await generar(lista, {
        formato,
        fotos,
        agruparPor: agrupar ? agruparPor : null,
        titulo,
        subtitulo,
        archivo
      })
      await entregar(resultado, compartir)
      onClose()
    } catch (e) {
      // Si la persona cierra la hoja de compartir no es un error
      if (e instanceof DOMException && e.name === 'AbortError') {
        setOcupado(false)
        return
      }
      setError(mensajeError(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fondo-modal" role="dialog" aria-modal="true" aria-label="Exportar" onClick={onClose}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <h2>Exportar</h2>
        <p className="muted">
          {lista.length} {lista.length === 1 ? 'fallo' : 'fallos'} · {subtitulo}
        </p>

        <div className="formatos">
          <button type="button" className={`formato ${formato === 'pdf' ? 'act' : ''}`} onClick={() => setFormato('pdf')}>
            <b>PDF</b>
            <span>Informe para imprimir o enviar</span>
          </button>
          <button type="button" className={`formato ${formato === 'xlsx' ? 'act' : ''}`} onClick={() => setFormato('xlsx')}>
            <b>Excel</b>
            <span>Tabla para filtrar y ordenar</span>
          </button>
        </div>

        <div className="panel">
          <label className="interruptor">
            {formato === 'pdf' ? 'Incluir fotos' : 'Incluir enlaces a las fotos'}
            <input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} />
          </label>
          <label className="interruptor">
            Solo fallos abiertos
            <input type="checkbox" checked={soloAbiertos} onChange={(e) => setSoloAbiertos(e.target.checked)} />
          </label>
          <label className="interruptor">
            {agruparPor === 'estancia' ? 'Agrupar por estancia' : 'Agrupar por vivienda'}
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
          </label>
        </div>

        {lista.length > 0 && (
          <div className="muted">
            {lista.slice(0, 3).map((f) => (
              <div key={f.id}>
                · {ubicacion(f)} · {f.estancia}: {f.descripcion}
              </div>
            ))}
            {lista.length > 3 && <div>· … y {lista.length - 3} más</div>}
          </div>
        )}
        {lista.length === 0 && <p className="aviso">No hay fallos que exportar con estas opciones.</p>}
        {error && <p className="error">{error}</p>}

        <div className="acciones">
          {compartible && (
            <button type="button" className="btn" disabled={ocupado || lista.length === 0} onClick={() => ejecutar(true)}>
              Compartir
            </button>
          )}
          <button type="button" className="btn btn-primario" disabled={ocupado || lista.length === 0} onClick={() => ejecutar(false)}>
            {ocupado ? 'Preparando…' : nativa ? `Compartir o guardar ${formato === 'pdf' ? 'PDF' : 'Excel'}` : `Descargar ${formato === 'pdf' ? 'PDF' : 'Excel'}`}
          </button>
        </div>
        <button type="button" className="btn-texto" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
