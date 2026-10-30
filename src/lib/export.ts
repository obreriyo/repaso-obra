import { urlsFotos } from './api'
import { fecha, fechaLarga, paraArchivo, plantaTexto, ubicacion, PRIORIDAD_TEXTO } from './format'
import type { Fallo } from './types'

export type Formato = 'pdf' | 'xlsx'

export interface OpcionesExportar {
  formato: Formato
  /** PDF: miniatura de la primera foto. Excel: enlaces a las fotos (válidos 7 días). */
  fotos: boolean
  /** Agrupa las filas bajo un encabezado por estancia o por vivienda */
  agruparPor: 'estancia' | 'ubicacion' | null
  titulo: string
  subtitulo: string
  /** Nombre del archivo sin extensión */
  archivo: string
}

export interface Resultado {
  blob: Blob
  nombre: string
}

const COLOR_PRIORIDAD: Record<string, string> = {
  alta: 'FFFBE3E1',
  media: 'FFFDF0C4',
  baja: 'FFE3E5E8'
}

function ordenar(fallos: Fallo[], agruparPor: OpcionesExportar['agruparPor']): Fallo[] {
  const clave = (f: Fallo) =>
    agruparPor === 'estancia'
      ? `${f.estancia}|${ubicacion(f)}`
      : `${f.vivienda?.bloque?.nombre ?? ''}|${String(f.vivienda?.planta ?? 0).padStart(3, '0')}|${f.vivienda?.letra ?? ''}|${f.estancia}`
  return [...fallos].sort((a, b) => clave(a).localeCompare(clave(b), 'es'))
}

/** Descarga una foto y la devuelve recortada en cuadrado y pequeña (para el PDF). */
async function miniatura(url: string, lado = 240): Promise<string | null> {
  try {
    const respuesta = await fetch(url)
    const blob = await respuesta.blob()
    const bitmap = await createImageBitmap(blob)
    const corte = Math.min(bitmap.width, bitmap.height)
    const lienzo = document.createElement('canvas')
    lienzo.width = lado
    lienzo.height = lado
    const ctx = lienzo.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(
      bitmap,
      (bitmap.width - corte) / 2,
      (bitmap.height - corte) / 2,
      corte,
      corte,
      0,
      0,
      lado,
      lado
    )
    bitmap.close()
    return lienzo.toDataURL('image/jpeg', 0.75)
  } catch {
    return null
  }
}

// ------------------------------------------------------------------- PDF

async function generarPdf(fallos: Fallo[], op: OpcionesExportar): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const lista = ordenar(fallos, op.agruparPor)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Miniaturas (primera foto de cada fallo)
  const miniaturas: Record<string, string> = {}
  if (op.fotos) {
    const conFoto = lista.filter((f) => f.fotos && f.fotos.length > 0)
    const urls = await urlsFotos(conFoto.map((f) => f.fotos[0].path), 600)
    for (let i = 0; i < conFoto.length; i += 6) {
      const lote = conFoto.slice(i, i + 6)
      const imgs = await Promise.all(lote.map((f) => miniatura(urls[f.fotos[0].path] ?? '')))
      lote.forEach((f, k) => {
        const img = imgs[k]
        if (img) miniaturas[f.id] = img
      })
    }
  }

  // Cabecera
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(27, 31, 36)
  doc.text(op.titulo, 14, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(91, 96, 104)
  doc.text(`${op.subtitulo} · ${fechaLarga()} · ${lista.length} fallos`, 14, 22)

  // Tabla
  const cabecera = [
    ...(op.fotos ? ['Foto'] : []),
    'Ubicación',
    'Estancia',
    'Descripción',
    'Prior.',
    'Estado',
    'Subcontrata'
  ]
  const anchos = op.fotos ? [22, 26, 22, 56, 14, 18, 24] : [28, 24, 70, 16, 20, 24]
  const columnas = cabecera.length

  const cuerpo: Array<Array<string | { content: string; colSpan: number; styles: object }>> = []
  const filaFallo: Array<Fallo | null> = []
  let grupoActual = ''

  for (const f of lista) {
    if (op.agruparPor) {
      const grupo = op.agruparPor === 'estancia' ? f.estancia : ubicacion(f)
      if (grupo !== grupoActual) {
        grupoActual = grupo
        cuerpo.push([
          {
            content: grupo,
            colSpan: columnas,
            styles: { fillColor: [242, 241, 237], fontStyle: 'bold', textColor: [27, 31, 36] }
          }
        ])
        filaFallo.push(null)
      }
    }
    const fila: string[] = []
    if (op.fotos) fila.push(f.fotos && f.fotos.length > 1 ? `+${f.fotos.length - 1}` : '')
    fila.push(
      ubicacion(f),
      f.estancia,
      `${f.descripcion}\n(${f.tipo})`,
      PRIORIDAD_TEXTO[f.prioridad],
      f.estado === 'reparado' ? 'Reparado' : 'Abierto',
      f.subcontrata ?? ''
    )
    cuerpo.push(fila)
    filaFallo.push(f)
  }

  const estiloColumnas: Record<number, { cellWidth: number }> = {}
  anchos.forEach((a, i) => (estiloColumnas[i] = { cellWidth: a }))

  autoTable(doc, {
    head: [cabecera],
    body: cuerpo,
    startY: 27,
    margin: { left: 14, right: 14, bottom: 16 },
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [27, 31, 36], textColor: [245, 183, 0] },
    columnStyles: estiloColumnas,
    didParseCell: (datos) => {
      if (datos.section !== 'body' || !op.fotos) return
      const f = filaFallo[datos.row.index]
      if (f && miniaturas[f.id]) datos.cell.styles.minCellHeight = 21
    },
    didDrawCell: (datos) => {
      if (datos.section !== 'body' || !op.fotos || datos.column.index !== 0) return
      const f = filaFallo[datos.row.index]
      const img = f ? miniaturas[f.id] : undefined
      if (img) doc.addImage(img, 'JPEG', datos.cell.x + 1, datos.cell.y + 1, 19, 19)
    }
  })

  // Numeración de páginas
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(91, 96, 104)
    doc.text(`Página ${p} de ${total}`, 196, 290, { align: 'right' })
  }

  return doc.output('blob')
}

// ----------------------------------------------------------------- Excel

async function generarExcel(fallos: Fallo[], op: OpcionesExportar): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const lista = ordenar(fallos, op.agruparPor)

  const libro = new ExcelJS.Workbook()
  libro.creator = 'Repaso de obra'
  const hoja = libro.addWorksheet('Fallos')

  const columnas = [
    { header: 'Bloque', key: 'bloque', width: 12 },
    { header: 'Planta', key: 'planta', width: 8 },
    { header: 'Letra', key: 'letra', width: 7 },
    { header: 'Estancia', key: 'estancia', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 15 },
    { header: 'Descripción', key: 'descripcion', width: 50 },
    { header: 'Prioridad', key: 'prioridad', width: 11 },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'Subcontrata', key: 'subcontrata', width: 22 },
    { header: 'Creado por', key: 'creador', width: 18 },
    { header: 'Fecha de creación', key: 'creado', width: 18 },
    { header: 'Última edición', key: 'editado', width: 18 },
    { header: 'Editado por', key: 'editor', width: 18 }
  ]
  const MAX_FOTOS = 3
  if (op.fotos) {
    for (let i = 1; i <= MAX_FOTOS; i++) {
      columnas.push({ header: `Foto ${i}`, key: `foto${i}`, width: 10 })
    }
  }
  hoja.columns = columnas

  // Enlaces a fotos (válidos 7 días)
  let urls: Record<string, string> = {}
  if (op.fotos) {
    const rutas = lista.flatMap((f) => (f.fotos ?? []).slice(0, MAX_FOTOS).map((x) => x.path))
    urls = await urlsFotos(rutas, 60 * 60 * 24 * 7)
  }

  for (const f of lista) {
    const fila = hoja.addRow({
      bloque: f.vivienda?.bloque?.nombre ?? '',
      planta: plantaTexto(f.vivienda?.planta ?? 0),
      letra: f.vivienda?.letra ?? '',
      estancia: f.estancia,
      tipo: f.tipo,
      descripcion: f.descripcion,
      prioridad: PRIORIDAD_TEXTO[f.prioridad],
      estado: f.estado === 'reparado' ? 'Reparado' : 'Abierto',
      subcontrata: f.subcontrata ?? '',
      creador: f.creador?.nombre ?? '',
      creado: fecha(f.created_at),
      editado: fecha(f.updated_at),
      editor: f.editor?.nombre ?? ''
    })
    fila.alignment = { vertical: 'top', wrapText: true }

    const celdaPrioridad = fila.getCell('prioridad')
    celdaPrioridad.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_PRIORIDAD[f.prioridad] ?? 'FFFFFFFF' }
    }

    if (op.fotos) {
      ;(f.fotos ?? []).slice(0, MAX_FOTOS).forEach((foto, i) => {
        const url = urls[foto.path]
        if (url) {
          fila.getCell(`foto${i + 1}`).value = { text: 'Ver', hyperlink: url }
          fila.getCell(`foto${i + 1}`).font = { color: { argb: 'FF0B57D0' }, underline: true }
        }
      })
    }
  }

  const cab = hoja.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFF5B700' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1F24' } }
  cab.alignment = { vertical: 'middle' }
  cab.height = 22
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }

  const buffer = await libro.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

// ---------------------------------------------------------------- público

export async function generar(fallos: Fallo[], op: OpcionesExportar): Promise<Resultado> {
  const blob = op.formato === 'pdf' ? await generarPdf(fallos, op) : await generarExcel(fallos, op)
  const nombre = `${paraArchivo(op.archivo)}_${new Date().toISOString().slice(0, 10)}.${op.formato}`
  return { blob, nombre }
}

/** Comparte el archivo (hoja de compartir del móvil) o, si no se puede, lo descarga. */
export async function entregar(resultado: Resultado, compartir: boolean): Promise<void> {
  const archivo = new File([resultado.blob], resultado.nombre, { type: resultado.blob.type })

  if (compartir && typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo] })) {
    await navigator.share({ files: [archivo], title: resultado.nombre })
    return
  }

  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(resultado.blob)
  enlace.download = resultado.nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10000)
}

/** ¿Este navegador puede compartir archivos? (móviles sí, la mayoría de ordenadores no) */
export function puedeCompartir(): boolean {
  if (typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}
