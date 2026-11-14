import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { healthApi } from './health-api'
import { progressionQueryKey } from './progression'
import { dateInTimezone } from './health-time'

export function useProgressionSnapshot(timezone: string) {
  const [currentDay, setCurrentDay] = useState<{ timezone: string; date: string } | null>(null)
  useEffect(() => {
    const refresh = () => setCurrentDay({ timezone, date: dateInTimezone(new Date(), timezone) })
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [timezone])

  const endDate = currentDay?.timezone === timezone ? currentDay.date : undefined
  return useQuery({
    queryKey: progressionQueryKey(timezone, endDate ?? ''),
    queryFn: () => healthApi.getProgression(endDate),
    enabled: Boolean(endDate),
  })
}
