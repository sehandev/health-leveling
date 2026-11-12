import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useState } from 'react'
import appCss from '../styles/app.css?url'

function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  }))

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function RootDocument() {
  return (
    <html lang="ko">
      <head><HeadContent /></head>
      <body>
        <AppProviders><Outlet /></AppProviders>
        <Scripts />
      </body>
    </html>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '나건렙 — 나답게 건강 레벨업' },
      { name: 'description', content: '매일의 건강 기록을 차분히 쌓아가는 개인 건강 기록 앱입니다.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootDocument,
})
