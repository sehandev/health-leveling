import { createFileRoute, Outlet } from '@tanstack/react-router'
import '../styles/workouts.css'

export const Route = createFileRoute('/workouts')({ component: Outlet })
