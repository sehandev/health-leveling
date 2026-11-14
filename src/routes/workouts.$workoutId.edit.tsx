import { createFileRoute } from '@tanstack/react-router'
import { WorkoutEditorPage } from '../components/workout/workout-editor-page'

export const Route = createFileRoute('/workouts/$workoutId/edit')({
  component: () => <WorkoutEditorPage workoutId={Route.useParams().workoutId} />,
})
