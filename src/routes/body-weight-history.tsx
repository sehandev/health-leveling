import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/body-weight-history')({
  beforeLoad: () => {
    throw redirect({ to: '/body-weight-progression' })
  },
})
