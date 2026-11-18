export const muscleNames = {
  chest: '가슴', shoulder: '어깨', biceps: '이두', triceps: '삼두', forearm: '전완',
  abs: '복근', oblique: '외복사근', traps: '승모근', lat: '광배근', glute: '둔근',
  quad: '대퇴사두근', hamstring: '햄스트링', calf: '종아리',
} as const

export type Muscle = keyof typeof muscleNames
export const muscleRegions = (Object.keys(muscleNames) as Muscle[]).map(id => ({ id, label: muscleNames[id] }))

export function adjacentMuscle(current: Muscle | null, direction: 1 | -1): Muscle {
  const index = muscleRegions.findIndex(region => region.id === current)
  return muscleRegions[index < 0 ? (direction === 1 ? 0 : muscleRegions.length - 1) : (index + direction + muscleRegions.length) % muscleRegions.length].id
}
