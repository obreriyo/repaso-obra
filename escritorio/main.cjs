// Programa de Windows: abre la misma app dentro de una ventana (sin instalar nada más).
const { app, BrowserWindow, Menu, shell, session } = require('electron')
const path = require('path')

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let ventana = null

function crearVentana() {
  Menu.setApplicationMenu(null)
  ventana = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    minHeight: 600,
    title: 'Repaso obra',
    autoHideMenuBar: true,
    backgroundColor: '#F2F1ED',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  ventana.loadFile(path.join(__dirname, 'dist', 'index.html'))
  // Los enlaces externos se abren en el navegador, no dentro de la app
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.on('closed', () => {
    ventana = null
  })
}

app.on('second-instance', () => {
  if (ventana) {
    if (ventana.isMinimized()) ventana.restore()
    ventana.focus()
  }
})

app.whenReady().then(() => {
  // Permiso de cámara (para hacer fotos con la webcam) y nada más
  session.defaultSession.setPermissionRequestHandler((_wc, permiso, cb) => cb(permiso === 'media'))
  crearVentana()
})

app.on('window-all-closed', () => app.quit())
