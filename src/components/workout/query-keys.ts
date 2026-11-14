export const workoutsQueryKey = ['health', 'workouts'] as const
export const workoutPickerQueryKey = ['health', 'workout-picker'] as const
export const progressionQueryKey = ['health', 'progression'] as const
export const workoutDetailQueryKey = (id: string) => ['health', 'workouts', id] as const
