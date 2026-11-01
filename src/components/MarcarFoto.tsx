import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'

type Herramienta = 'lapiz' | 'circulo' | 'flecha'
interface Punto {
  x: number
  y: number
}
interface Trazo {
  h: Herramienta
  color: string
  puntos: Punto[] // lápiz: todos; círculo y flecha: inicio y fin
}

const COLORES = [
  { id: '#e53935', nombre: 'Rojo' },
  { id: '#fdd835', nombre: 'Amarillo' },
  { id: '#ffffff', nombre: 'Blanco' }
]

const LADO_MAX = 1600

interface Props {
  /** Dirección de la foto (blob: o https:) */
  src: string
  onGuardar: (archivo: File) => void
  onCancelar: () => void
}

function dibujar(ctx: CanvasRenderingContext2D, t: Trazo, grosor: number) {
  ctx.strokeStyle = t.color
  ctx.fillStyle = t.color
  ctx.lineWidth = grosor
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const p = t.puntos
  if (p.length === 0) return
  if (t.h === 'lapiz') {
    ctx.beginPath()
    ctx.moveTo(p[0].x, p[0].y)
    if (p.length === 1) ctx.lineTo(p[0].x + 0.1, p[0].y)
    for (const q of p.slice(1)) ctx.lineTo(q.x, q.y)
    ctx.stroke()
    return
  }
  if (p.length < 2) return
  const a = p[0]
  const b = p[p.length - 1]
  if (t.h === 'circulo') {
    const rx = Math.abs(b.x - a.x) / 2
    const ry = Math.abs(b.y - a.y) / 2
    if (rx < 1 || ry < 1) return
    ctx.beginPath()
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  // flecha
  const largo = Math.hypot(b.x - a.x, b.y - a.y)
  if (largo < 4) return
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const cabeza = Math.min(largo * 0.6, grosor * 5)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - cabeza * Math.cos(ang - Math.PI / 7), b.y - cabeza * Math.sin(ang - Math.PI / 7))
  ctx.lineTo(b.x - cabeza * Math.cos(ang + Math.PI / 7), b.y - cabeza * Math.sin(ang + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
}

/** Pantalla para dibujar sobre una foto: lápiz, círculo y flecha. */
export default function MarcarFoto({ src, onGuardar, onCancelar }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const imagen = useRef<HTMLImageElement | null>(null)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [herramienta, setHerramienta] = useState<Herramienta>('circulo')
  const [color, setColor] = useState(COLORES[0].id)
  const [trazos, setTrazos] = useState<Trazo[]>([])
  const actual = useRef<Trazo | null>(null)

  const pintar = useCallback((extra?: Trazo | null) => {
    const c = lienzo.current
    const img = imagen.current
    if (!c || !img) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const g = Math.max(4, c.width / 150)
    for (const t of trazos) dibujar(ctx, t, g)
    if (extra) dibujar(ctx, extra, g)
  }, [trazos])

  // Carga la foto
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
      const c = lienzo.current
      if (!c) return
      c.width = Math.max(1, Math.round(img.naturalWidth * escala))
      c.height = Math.max(1, Math.round(img.naturalHeight * escala))
      imagen.current = img
      setListo(true)
    }
    img.onerror = () => setError('No se pudo abrir la foto para marcarla.')
    img.src = src
  }, [src])

  useEffect(() => {
    if (listo) pintar()
  }, [listo, pintar])

  function punto(e: PointerEvent<HTMLCanvasElement>): Punto {
    const c = lienzo.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  function empezar(e: PointerEvent<HTMLCanvasElement>) {
    if (!listo) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = punto(e)
    actual.current = { h: herramienta, color, puntos: [p] }
    pintar(actual.current)
  }

  function mover(e: PointerEvent<HTMLCanvasElement>) {
    const t = actual.current
    if (!t) return
    const p = punto(e)
    if (t.h === 'lapiz') t.puntos.push(p)
    else t.puntos = [t.puntos[0], p]
    pintar(t)
  }

  function terminar() {
    const t = actual.current
    actual.current = null
    if (!t) return
    setTrazos((l) => [...l, t])
  }

  function guardar() {
    const c = lienzo.current
    if (!c) return
    try {
      c.toBlob(
        (blob) => {
          if (!blob) return setError('No se pudo guardar la foto marcada.')
          onGuardar(new File([blob], `marcada_${Date.now()}.jpg`, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.85
      )
    } catch {
      setError('No se pudo guardar la foto marcada.')
    }
  }

  return (
    <div className="marcar" role="dialog" aria-modal="true" aria-label="Marcar la foto">
      <div className="marcar-barra">
        <button type="button" className="btn" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primario" onClick={guardar} disabled={!listo}>
          Listo
        </button>
      </div>

      <div className="marcar-lienzo">
        {!listo && !error && <p style={{ color: '#fff' }}>Cargando foto…</p>}
        {error && <p className="error">{error}</p>}
        <canvas
          ref={lienzo}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          style={{ display: listo ? 'block' : 'none' }}
        />
      </div>

      <div className="marcar-herr">
        {(
          [
            ['circulo', 'Círculo'],
            ['flecha', 'Flecha'],
            ['lapiz', 'Dibujar']
          ] as [Herramienta, string][]
        ).map(([id, nombre]) => (
          <button key={id} type="button" className={`chip ${herramienta === id ? 'act' : ''}`} onClick={() => setHerramienta(id)}>
            {nombre}
          </button>
        ))}
        <span className="marcar-sep" />
        {COLORES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.nombre}
            aria-pressed={color === c.id}
            className="marcar-color"
            style={{ background: c.id, outline: color === c.id ? '3px solid #f5c518' : '1px solid #888' }}
            onClick={() => setColor(c.id)}
          />
        ))}
        <span className="marcar-sep" />
        <button type="button" className="chip" disabled={trazos.length === 0} onClick={() => setTrazos((l) => l.slice(0, -1))}>
          Deshacer
        </button>
        <button type="button" className="chip" disabled={trazos.length === 0} onClick={() => setTrazos([])}>
          Borrar todo
        </button>
      </div>
    </div>
  )
}
