/**
 * Convierte lo escrito por la persona en una lista de números de trastero.
 * Admite rangos y listas: "1-12", "1, 2, 5, 8", "T1 T2", "1-4, 7, 9-10".
 */
export function parsearTrasteros(texto: string): string[] {
  const salida: string[] = []
  const vistos = new Set<string>()
  const piezas = texto
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const añadir = (n: string) => {
    if (n.length > 12) throw new Error(`«${n}» es demasiado largo para un número de trastero (máximo 12 caracteres).`)
    const clave = n.toLowerCase()
    if (!vistos.has(clave)) {
      vistos.add(clave)
      salida.push(n)
    }
  }

  for (const pieza of piezas) {
    const rango = /^(\d+)\s*-\s*(\d+)$/.exec(pieza)
    if (rango) {
      const desde = Number(rango[1])
      const hasta = Number(rango[2])
      if (hasta < desde) throw new Error(`El rango «${pieza}» está al revés.`)
      if (hasta - desde + 1 > 500) throw new Error('Demasiados trasteros de una vez (máximo 500).')
      for (let i = desde; i <= hasta; i++) añadir(String(i))
    } else {
      añadir(pieza)
    }
    if (salida.length > 500) throw new Error('Demasiados trasteros de una vez (máximo 500).')
  }
  return salida
}
