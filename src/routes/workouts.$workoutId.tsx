import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/workouts/$workoutId')({ component: Outlet })
