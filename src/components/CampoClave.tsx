import { useState } from 'react'

interface Props {
  id: string
  value: string
  onChange: (valor: string) => void
  autoComplete: string
}

/** Campo de contraseña con un ojo para verla mientras se escribe. */
export default function CampoClave({ id, value, onChange, autoComplete }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="clave-caja">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <button
        type="button"
        className="clave-ojo"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  )
}
