import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AppShell } from '../components/app-shell'
import { XpHistoryChart } from '../components/progression-charts'
import { Button } from '../components/ui/button'
import { healthApi, loadProfile } from '../lib/health-api'
import { xpProgress } from '../lib/progression'
import { useProgressionSnapshot } from '../lib/use-progression-snapshot'

export const Route = createFileRoute('/progression')({ component: ProgressionPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function ProgressionPage() {
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  if (profileQuery.isPending) return <AppShell><h1>성장 기록</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>성장 기록</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }
  return <AppShell><h1>성장 기록</h1><ProgressionView timezone={profileQuery.data.timezone} /></AppShell>
}

function ProgressionView({ timezone }: { timezone: string }) {
  const progressionQuery = useProgressionSnapshot(timezone)
  const [selectedMuscle, setSelectedMuscle] = useState('Chest')

  if (progressionQuery.isPending) return <p role="status" className="inline-status">불러오는 중…</p>
  if (progressionQuery.isError) {
    return (
      <div role="alert">
        <p className="inline-status inline-status--error">{errorMessage(progressionQuery.error)}</p>
        <Button variant="quiet" onClick={() => void progressionQuery.refetch()}>다시 불러오기</Button>
      </div>
    )
  }

  const snapshot = progressionQuery.data
  const muscle = snapshot.muscles.find((item) => item.group === selectedMuscle) ?? snapshot.muscles[0]
  return (
    <>
      <section className="content-section" aria-labelledby="avatar-heading">
        <div className="section-heading">
          <h2 id="avatar-heading">아바타</h2>
        </div>
        <AvatarSummary avatar={snapshot.avatar} />
      </section>
      <section className="content-section" aria-labelledby="xp-history-heading">
        <h2 id="xp-history-heading">XP 변화</h2>
        {snapshot.avatar.xp === 0 ? <p className="inline-status">아직 XP 기록이 없어요.</p> : null}
        <XpHistoryChart days={snapshot.days} />
      </section>
      <section className="content-section" aria-labelledby="body-metric-xp-heading">
        <h2 id="body-metric-xp-heading">신체 지표</h2>
        <ul className="progression-list">
          {snapshot.bodyMetrics.map((metric) => (
            <li key={metric.metric}>
              <span>{metricLabel(metric.metric)}</span>
              <span>레벨 {metric.level} · {metric.xp} XP</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="content-section" aria-labelledby="muscle-xp-heading">
        <h2 id="muscle-xp-heading">근육 그룹</h2>
        {muscle ? (
          <div className="muscle-progression">
            <label className="form-row" htmlFor="muscle-group">
              <span className="field-label">근육 그룹</span>
              <select
                id="muscle-group"
                className="select-input"
                value={muscle.group}
                onChange={(event) => setSelectedMuscle(event.target.value)}
              >
                {snapshot.muscles.map((item) => <option key={item.group} value={item.group}>{muscleLabel(item.group)}</option>)}
              </select>
            </label>
            <p className="progression-next-level" aria-live="polite">{muscleLabel(muscle.group)} · 레벨 {muscle.level} · {muscle.xp} XP</p>
          </div>
        ) : <p className="inline-status">근육 기록이 없어요.</p>}
      </section>
    </>
  )
}

function AvatarSummary({ avatar }: { avatar: { xp: number; level: number } }) {
  const progress = xpProgress(avatar.xp)
  return (
    <div className="avatar-summary">
      <div className="avatar-summary__stats">
        <strong>레벨 {avatar.level}</strong>
        <span>{avatar.xp} XP</span>
      </div>
      <div
        className="progress-line"
        role="progressbar"
        aria-label="다음 아바타 레벨까지 XP"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={progress.xpIntoLevel}
        aria-valuetext={`레벨 ${avatar.level}, 총 ${avatar.xp} XP, 다음 레벨까지 ${progress.xpToNextLevel} XP`}
      >
        <span className="progress-line__fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="progression-next-level">다음 레벨까지 {progress.xpToNextLevel} XP</p>
    </div>
  )
}

function metricLabel(metric: string) {
  switch (metric) {
    case 'body_weight': return '몸무게'
    case 'body_fat_percentage': return '체지방률'
    case 'skeletal_muscle_mass': return '골격근량'
    default: return metric
  }
}

function muscleLabel(group: string) {
  switch (group) {
    case 'Chest': return '가슴'
    case 'Back': return '등'
    case 'Shoulders': return '어깨'
    case 'Biceps': return '이두'
    case 'Triceps': return '삼두'
    case 'Core': return '코어'
    case 'Glutes': return '둔근'
    case 'Quadriceps': return '대퇴사두근'
    case 'Hamstrings': return '햄스트링'
    case 'Calves': return '종아리'
    default: return group
  }
}
