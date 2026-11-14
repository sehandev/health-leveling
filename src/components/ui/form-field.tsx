import type { InputHTMLAttributes, ReactNode } from 'react'

export function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="form-row">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...inputProps } = props
  return <input className={`text-input${className ? ` ${className}` : ''}`} {...inputProps} />
}

export function SelectInput(props: InputHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...inputProps } = props
  return <select className={`select-input${className ? ` ${className}` : ''}`} {...inputProps} />
}
