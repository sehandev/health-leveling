import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { WeightHistoryChart } from '../components/progression-charts'
import { Button } from '../components/ui/button'
import { loadProfile } from '../lib/health-api'
import { useProgressionSnapshot } from '../lib/use-progression-snapshot'

export const Route = createFileRoute('/body-weight-progression')({ component: BodyWeightProgressionPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function BodyWeightProgressionPage() {
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  if (profileQuery.isPending) return <AppShell><h1>몸무게 변화</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>몸무게 변화</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }
  return <AppShell><h1>몸무게 변화</h1><WeightProgression timezone={profileQuery.data.timezone} unitPreference={profileQuery.data.unitPreference} /></AppShell>
}

function WeightProgression({ timezone, unitPreference }: { timezone: string; unitPreference: 'Metric' | 'Imperial' }) {
  const progressionQuery = useProgressionSnapshot(timezone)
  if (progressionQuery.isPending) return <p role="status" className="inline-status">불러오는 중…</p>
  if (progressionQuery.isError) {
    return (
      <div role="alert">
        <p className="inline-status inline-status--error">{errorMessage(progressionQuery.error)}</p>
        <Button variant="quiet" onClick={() => void progressionQuery.refetch()}>다시 불러오기</Button>
      </div>
    )
  }
  return <WeightHistoryChart days={progressionQuery.data.days} unitPreference={unitPreference} />
}
