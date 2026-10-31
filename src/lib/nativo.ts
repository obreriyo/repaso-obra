import { Capacitor } from '@capacitor/core'

/** ¿Se está ejecutando dentro del APK de Android (y no en el navegador)? */
export function esNativa(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
