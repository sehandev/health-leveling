import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/">
          <span className="brand-mark" aria-hidden="true" />
          나건렙
        </Link>
      </header>
      <div className="page-content">{children}</div>
    </main>
  )
}
