import * as api from './api'
import { ESTADO_VIVIENDA_TEXTO, PRIORIDAD_TEXTO, fecha, paraArchivo, plantaTexto, viviendaNombre } from './format'
import type { Resultado } from './export'
import type { Obra } from './types'

export interface OpcionesCopia {
  /** Añade las fotos originales (comprimidas) en una carpeta del zip. Puede pesar bastante. */
  incluirFotos: boolean
  /** Para avisar del avance en pantalla */
  progreso?: (texto: string) => void
}

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Copia de seguridad de una obra: un zip con
 *  - datos.xlsx  (viviendas, fallos, equipo y actividad, para abrir en Excel)
 *  - datos.json  (todos los datos tal cual, para poder restaurarlos o llevarlos a otro sistema)
 *  - fotos/      (opcional)
 */
export async function copiaDeSeguridad(obra: Obra, op: OpcionesCopia): Promise<Resultado> {
  const avisar = op.progreso ?? (() => {})

  avisar('Leyendo los datos…')
  const [bloques, viviendas, fallos, miembros, actividad] = await Promise.all([
    api.listBloques(obra.id),
    api.listViviendasObra(obra.id),
    api.listFallos(obra.id),
    api.listMiembros(obra.id),
    api.listActividad(obra.id, 1000)
  ])

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // ---------------------------------------------------------------- Excel
  avisar('Preparando el Excel…')
  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Repaso de obra'

  function hoja(nombre: string, columnas: { header: string; key: string; width: number }[], filas: object[]) {
    const h = libro.addWorksheet(nombre)
    h.columns = columnas
    filas.forEach((f) => h.addRow(f))
    const cab = h.getRow(1)
    cab.font = { bold: true, color: { argb: 'FFF5B700' } }
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1F24' } }
    h.views = [{ state: 'frozen', ySplit: 1 }]
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
  }

  hoja(
    'Viviendas',
    [
      { header: 'Bloque', key: 'bloque', width: 14 },
      { header: 'Planta', key: 'planta', width: 9 },
      { header: 'Letra', key: 'letra', width: 7 },
      { header: 'Vivienda', key: 'vivienda', width: 12 },
      { header: 'Estado de la revisión', key: 'estado', width: 20 },
      { header: 'Fallos abiertos', key: 'abiertos', width: 15 },
      { header: 'Fallos reparados', key: 'reparados', width: 16 }
    ],
    viviendas.map((v) => ({
      bloque: v.bloque_nombre,
      planta: plantaTexto(v.planta),
      letra: v.letra,
      vivienda: viviendaNombre(v.planta, v.letra),
      estado: ESTADO_VIVIENDA_TEXTO[v.estado],
      abiertos: v.fallos_abiertos,
      reparados: v.fallos_reparados
    }))
  )

  const fotosDe = (f: { fotos?: { path: string }[] }) => (f.fotos ?? []).length

  hoja(
    'Fallos',
    [
      { header: 'Bloque', key: 'bloque', width: 14 },
      { header: 'Vivienda', key: 'vivienda', width: 12 },
      { header: 'Estancia', key: 'estancia', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
      { header: 'Prioridad', key: 'prioridad', width: 11 },
      { header: 'Estado', key: 'estado', width: 11 },
      { header: 'Subcontrata', key: 'subcontrata', width: 22 },
      { header: 'Fotos', key: 'fotos', width: 7 },
      { header: 'Creado por', key: 'creador', width: 18 },
      { header: 'Fecha de creación', key: 'creado', width: 18 },
      { header: 'Editado por', key: 'editor', width: 18 },
      { header: 'Última edición', key: 'editado', width: 18 }
    ],
    fallos.map((f) => ({
      bloque: f.vivienda?.bloque?.nombre ?? '',
      vivienda: f.vivienda ? viviendaNombre(f.vivienda.planta, f.vivienda.letra) : '',
      estancia: f.estancia,
      tipo: f.tipo,
      descripcion: f.descripcion,
      prioridad: PRIORIDAD_TEXTO[f.prioridad],
      estado: f.estado === 'reparado' ? 'Reparado' : 'Abierto',
      subcontrata: f.subcontrata ?? '',
      fotos: fotosDe(f),
      creador: f.creador?.nombre ?? '',
      creado: fecha(f.created_at),
      editor: f.editor?.nombre ?? '',
      editado: fecha(f.updated_at)
    }))
  )

  hoja(
    'Equipo',
    [
      { header: 'Nombre', key: 'nombre', width: 24 },
      { header: 'Correo', key: 'email', width: 30 },
      { header: 'Cargo', key: 'cargo', width: 16 }
    ],
    miembros.map((m) => ({
      nombre: m.profiles?.nombre ?? '',
      email: m.profiles?.email ?? '',
      cargo: m.profiles?.cargo === 'jefe_obra' ? 'Jefe de obra' : 'Encargado'
    }))
  )

  hoja(
    'Actividad',
    [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Persona', key: 'persona', width: 24 },
      { header: 'Qué hizo', key: 'texto', width: 60 }
    ],
    actividad.map((a) => ({
      fecha: fecha(a.created_at),
      persona: a.profiles?.nombre || a.profiles?.email || '',
      texto: a.texto
    }))
  )

  const excel = await libro.xlsx.writeBuffer()
  zip.file('datos.xlsx', new Blob([excel], { type: TIPO_XLSX }))

  // ----------------------------------------------------------------- JSON
  const json = {
    formato: 'repaso-obra-copia',
    version: 1,
    exportado: new Date().toISOString(),
    obra: { id: obra.id, nombre: obra.nombre, direccion: obra.direccion },
    bloques,
    viviendas,
    fallos,
    equipo: miembros,
    actividad
  }
  zip.file('datos.json', JSON.stringify(json, null, 2))

  // ---------------------------------------------------------------- fotos
  let faltan = 0
  if (op.incluirFotos) {
    const lista = fallos.flatMap((f) =>
      (f.fotos ?? []).map((foto, i) => ({
        path: foto.path,
        nombre: `fotos/${paraArchivo(f.vivienda?.bloque?.nombre ?? '', f.vivienda ? viviendaNombre(f.vivienda.planta, f.vivienda.letra) : '')}/${f.id.slice(0, 8)}_${i + 1}.jpg`
      }))
    )
    const urls = await api.urlsFotos(lista.map((x) => x.path), 3600)
    let hechas = 0
    let siguiente = 0
    const trabajador = async () => {
      while (siguiente < lista.length) {
        const item = lista[siguiente++]
        try {
          const r = await fetch(urls[item.path] ?? '')
          if (!r.ok) throw new Error('foto no disponible')
          zip.file(item.nombre, await r.blob())
        } catch {
          faltan++
        }
        hechas++
        avisar(`Descargando fotos… ${hechas} de ${lista.length}`)
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()])
  }

  avisar('Comprimiendo todo en un zip…')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  if (faltan > 0) {
    throw new Error(`No se pudieron descargar ${faltan} fotos. Vuelve a intentarlo con mejor conexión o sin fotos.`)
  }
  const nombre = `copia_${paraArchivo(obra.nombre)}_${new Date().toISOString().slice(0, 10)}.zip`
  return { blob, nombre }
}
