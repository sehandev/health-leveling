import { env } from 'cloudflare:workers'
import type {} from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { handleHealthRequest } from '../../../server/health-api'

async function handle({ request }: { request: Request }): Promise<Response> {
  const response = await handleHealthRequest(
    request,
    { DB: env.DB },
  )
  return response ?? new Response('Not Found', { status: 404 })
}

export const Route = createFileRoute('/api/health/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
    },
  },
})
