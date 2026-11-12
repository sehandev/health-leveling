function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(({ type, value }) => [type, value])) as Record<string, string>
}

function partsToWallTime(parts: Record<string, string>) {
  return Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  )
}

export function formatDateTimeForZone(date: Date, timezone: string): string {
  const parts = localParts(date, timezone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function dateInTimezone(date: Date, timezone: string): string {
  const parts = localParts(date, timezone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function dateTimeInZoneToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('날짜와 시간을 확인해 주세요.')

  const [, year, month, day, hour, minute] = match
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  const check = new Date(wallTime)
  if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() + 1 !== Number(month) || check.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) {
    throw new Error('날짜와 시간을 확인해 주세요.')
  }

  let instant = wallTime
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observedWallTime = partsToWallTime(localParts(new Date(instant), timezone))
    const next = wallTime - (observedWallTime - instant)
    if (next === instant) break
    instant = next
  }

  if (partsToWallTime(localParts(new Date(instant), timezone)) !== wallTime) {
    throw new Error('해당 시간대에 존재하지 않는 시각이에요. 다른 시간을 선택해 주세요.')
  }
  return new Date(instant).toISOString()
}

export function displayWeight(valueKg: number, unitPreference: 'Metric' | 'Imperial'): number {
  return unitPreference === 'Imperial' ? valueKg / 0.45359237 : valueKg
}

export function canonicalWeight(displayValue: number, unitPreference: 'Metric' | 'Imperial'): number {
  return unitPreference === 'Imperial' ? displayValue * 0.45359237 : displayValue
}
