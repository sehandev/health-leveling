import { createFileRoute } from '@tanstack/react-router'
import { WorkoutEditorPage } from '../components/workout/workout-editor-page'

export const Route = createFileRoute('/workouts/new')({ component: () => <WorkoutEditorPage workoutId={null} /> })
