export function progressionQueryKey(timezone: string, endDate: string) {
  return ['health', 'progression', timezone, endDate] as const
}

export function xpProgress(xp: number) {
  const xpIntoLevel = xp % 10
  return { xpIntoLevel, percent: xpIntoLevel * 10, xpToNextLevel: 10 - xpIntoLevel }
}
