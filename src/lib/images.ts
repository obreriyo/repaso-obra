/**
 * Reduce una foto del móvil (a veces 5-10 MB) a un JPEG de ~200-400 KB
 * antes de subirla, para no gastar datos ni espacio.
 */
export async function comprimir(archivo: File, ladoMax = 1600, calidad = 0.72): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(archivo)
  }

  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height))
  const ancho = Math.max(1, Math.round(bitmap.width * escala))
  const alto = Math.max(1, Math.round(bitmap.height * escala))

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la foto')
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  return new Promise<Blob>((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo comprimir la foto'))),
      'image/jpeg',
      calidad
    )
  })
}
