import { MUSCLE_GROUPS, type MuscleGroup } from '../../domain/workouts.ts'

export const muscleNames: Record<MuscleGroup, string> = {
  Chest: '가슴', Back: '등', Shoulders: '어깨', Biceps: '이두', Triceps: '삼두',
  Forearms: '전완', Core: '코어', Glutes: '둔근', Quadriceps: '대퇴사두근', Hamstrings: '햄스트링', Calves: '종아리',
}

export const muscleRegions = MUSCLE_GROUPS.map(id => ({ id, label: muscleNames[id] }))

export function adjacentMuscle(current: MuscleGroup | null, direction: 1 | -1): MuscleGroup {
  const index = muscleRegions.findIndex(region => region.id === current)
  return muscleRegions[index < 0 ? (direction === 1 ? 0 : muscleRegions.length - 1) : (index + direction + muscleRegions.length) % muscleRegions.length].id
}
