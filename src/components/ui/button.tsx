import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet'
  wide?: boolean
}

export function Button({ className = '', variant = 'primary', wide = false, ...props }: ButtonProps) {
  return (
    <button
      className={`button button--${variant}${wide ? ' button--wide' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}
