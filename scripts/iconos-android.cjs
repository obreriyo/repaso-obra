// Se ejecuta solo tras «npx cap sync» (gancho capacitor:sync:after de package.json).
// Copia el icono de la app a la carpeta android generada. No necesita instalar nada.
const fs = require('fs')
const path = require('path')

const res = path.join('android', 'app', 'src', 'main', 'res')
if (!fs.existsSync(res)) {
  console.log('Iconos: no hay carpeta android, no se hace nada.')
  process.exit(0)
}

const densidades = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
const archivos = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']
for (const d of densidades) {
  const destino = path.join(res, `mipmap-${d}`)
  fs.mkdirSync(destino, { recursive: true })
  for (const a of archivos) {
    fs.copyFileSync(path.join('branding', 'android', `mipmap-${d}`, a), path.join(destino, a))
  }
}

// Icono adaptable (Android 8+): el dibujo ocupa el centro y el fondo es del mismo azul
fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true })
const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/icono_fondo"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), xml)
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), xml)
fs.mkdirSync(path.join(res, 'values'), { recursive: true })
fs.writeFileSync(
  path.join(res, 'values', 'icono_fondo.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="icono_fondo">#1F5190</color>
</resources>
`
)
console.log('Iconos de la app copiados.')
