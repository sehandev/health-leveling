import type { MuscleGroup } from '../../domain/workouts.ts'
import type { ProgressionSnapshot } from '../../domain/progression-view.ts'

const layout: readonly { group: MuscleGroup; label: string; side: 'left' | 'right'; row: number }[] = [
  { group: 'Shoulders', label: '어깨', side: 'left', row: 2 },
  { group: 'Chest', label: '가슴', side: 'left', row: 3 },
  { group: 'Biceps', label: '이두', side: 'left', row: 4 },
  { group: 'Triceps', label: '삼두', side: 'left', row: 5 },
  { group: 'Core', label: '코어', side: 'left', row: 6 },
  { group: 'Forearms', label: '전완', side: 'left', row: 7 },
  { group: 'Back', label: '등', side: 'right', row: 3 },
  { group: 'Glutes', label: '둔근', side: 'right', row: 6 },
  { group: 'Quadriceps', label: '대퇴사두근', side: 'right', row: 7 },
  { group: 'Hamstrings', label: '햄스트링', side: 'right', row: 8 },
  { group: 'Calves', label: '종아리', side: 'right', row: 9 },
]

export function muscleStatuses(muscles: ProgressionSnapshot['muscles']) {
  return layout.flatMap(slot => {
    const value = muscles.find(muscle => muscle.group === slot.group)
    return value ? [{ ...slot, xp: value.xp, level: value.level }] : []
  })
}
