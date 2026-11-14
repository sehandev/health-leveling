import { createFileRoute } from '@tanstack/react-router'
import { WorkoutDetailPage } from '../components/workout/workout-detail-page'

export const Route = createFileRoute('/workouts/$workoutId/')({
  component: () => <WorkoutDetailPage workoutId={Route.useParams().workoutId} />,
})
