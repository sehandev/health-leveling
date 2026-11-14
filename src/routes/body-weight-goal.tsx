import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { healthApi, loadProfile } from '../lib/health-api'
import { displayWeight } from '../lib/health-time'

export const Route = createFileRoute('/body-weight-goal')({ component: BodyWeightGoalPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function BodyWeightGoalPage() {
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const goalsQuery = useQuery({ queryKey: ['health', 'goals'], queryFn: healthApi.getGoals })
  if (profileQuery.isPending || goalsQuery.isPending) return <AppShell><h1>몸무게 목표</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError || goalsQuery.isError) {
    const error = profileQuery.isError ? profileQuery.error : goalsQuery.error
    return (
      <AppShell>
        <h1>몸무게 목표</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(error)}</p>
        <Button variant="quiet" onClick={() => { void profileQuery.refetch(); void goalsQuery.refetch() }}>다시 불러오기</Button>
      </AppShell>
    )
  }

  const goal = goalsQuery.data.goals.find((item) => item.metric === 'body_weight' && item.active)
  const unit = profileQuery.data.unitPreference
  return (
    <AppShell>
      <h1>몸무게 목표</h1>
      {goal ? (
        <p className="goal-summary">
          <strong>{new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(displayWeight(goal.targetValue, unit))} {unit === 'Imperial' ? 'lb' : 'kg'}</strong>
          <time dateTime={goal.targetDate}>{goal.targetDate}</time>
        </p>
      ) : <p className="inline-status">목표가 없어요.</p>}
      <Link className="button button--quiet" to="/body-weight-goal-new">목표 등록</Link>
    </AppShell>
  )
}
