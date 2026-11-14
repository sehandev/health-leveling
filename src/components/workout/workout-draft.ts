import type { MuscleGroup, StrengthMode } from '../../domain/workouts.ts'
import { parseStrengthWorkoutDraft, type StrengthWorkoutDraft } from '../../domain/workout-records.ts'
import { canonicalWeight, dateTimeInZoneToIso, displayWeight } from '../../lib/health-time.ts'

export type WorkoutEditorSet = { reps: string; load: string; originalLoadKg: number | null }
export type WorkoutEditorItem = {
  id: string
  name: string
  source: 'curated' | 'custom'
  mode: StrengthMode
  targetMuscles: MuscleGroup[]
  sets: WorkoutEditorSet[]
}
export type WorkoutEditorValues = { recordedAt: string; place: string; note: string; items: WorkoutEditorItem[] }

export function formatWorkoutLoadInput(loadKg: number, unit: 'Metric' | 'Imperial') {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(displayWeight(loadKg, unit))
}

export const FUTURE_WORKOUT_TIME_ERROR = '미래 시각은 기록할 수 없어요.'

export function workoutRecordedAtToIso(value: string, timezone: string, now = new Date()) {
  const recordedAt = dateTimeInZoneToIso(value, timezone)
  if (Date.parse(recordedAt) > now.getTime()) throw new RangeError(FUTURE_WORKOUT_TIME_ERROR)
  return recordedAt
}

export function buildStrengthWorkoutDraft(
  values: WorkoutEditorValues,
  timezone: string,
  unit: 'Metric' | 'Imperial',
  now = new Date(),
): StrengthWorkoutDraft {
  return parseStrengthWorkoutDraft({
    type: 'Strength Training',
    recordedAt: workoutRecordedAtToIso(values.recordedAt, timezone, now),
    timezone,
    place: values.place,
    note: values.note,
    items: values.items.map((item) => ({
      id: item.id,
      name: item.name,
      source: item.source,
      mode: item.mode,
      targetMuscles: item.targetMuscles,
      sets: item.sets.map((set) => {
        const reps = set.reps.trim() === '' ? null : Number(set.reps)
        const loadValue = set.load.trim() === '' ? null : Number(set.load)
        const unchangedLoad = set.originalLoadKg !== null && set.load === formatWorkoutLoadInput(set.originalLoadKg, unit)
        return {
          reps,
          loadKg: loadValue === null ? null : unchangedLoad ? set.originalLoadKg : canonicalWeight(loadValue, unit),
        }
      }),
    })),
  })
}

export function moveWorkoutItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
