import { createFileRoute } from '@tanstack/react-router'
import { WorkoutsPage } from '../components/workout/workouts-page'

export const Route = createFileRoute('/workouts/')({ component: WorkoutsPage })
