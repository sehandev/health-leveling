import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { MuscleGroup, StrengthMode } from '../../domain/workouts'
import type { StrengthWorkoutRecord } from '../../domain/workout-records'
import { displayWeight } from '../../lib/health-time'
import { loadWorkoutProfile } from './workout-profile'
import { workoutApi } from '../../lib/workout-api'
import { Button } from '../ui/button'
import { DeleteWorkoutDialog } from './delete-workout-dialog'
import { workoutDetailQueryKey, workoutPickerQueryKey, workoutsQueryKey, progressionQueryKey } from './query-keys'

const modeLabels: Record<StrengthMode, string> = { Machine: '머신', 'Free Weight': '프리 웨이트', Bodyweight: '맨몸' }
const muscleLabels: Record<MuscleGroup, string> = {
  Chest: '가슴', Back: '등', Shoulders: '어깨', Biceps: '이두', Triceps: '삼두',
  Core: '코어', Glutes: '둔근', Quadriceps: '대퇴사두', Hamstrings: '햄스트링', Calves: '종아리',
}

function messageFor(error: unknown) {
  if (error instanceof RangeError) return '입력 내용을 확인해 주세요.'
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.'
}

export function WorkoutDetailPage({ workoutId }: { workoutId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: workoutDetailQueryKey(workoutId), queryFn: () => workoutApi.getWorkout(workoutId) })
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadWorkoutProfile })
  const [deleting, setDeleting] = useState(false)
  const mutation = useMutation({
    mutationFn: (version: number) => workoutApi.deleteWorkout(workoutId, version),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsQueryKey }),
        queryClient.invalidateQueries({ queryKey: workoutDetailQueryKey(workoutId) }),
        queryClient.invalidateQueries({ queryKey: workoutPickerQueryKey }),
        queryClient.invalidateQueries({ queryKey: progressionQueryKey }),
      ])
    },
  })

  return (
    <main className="app-shell workouts-shell">
      <header className="site-header">
        <Link className="wordmark workouts-home-link" to="/" aria-label="홈으로"><span className="brand-mark" aria-hidden="true" />나건렙</Link>
        <Link className="workouts-nav-link" to="/workouts">목록</Link>
      </header>
      {query.isPending || profileQuery.isPending ? <p className="inline-status" role="status">불러오는 중…</p> : null}
      {query.isError || profileQuery.isError ? (
        <div role="alert" className="workouts-query-error">
          <p className="inline-status inline-status--error">{messageFor(query.error ?? profileQuery.error)}</p>
          <Button type="button" variant="quiet" onClick={() => { void query.refetch(); void profileQuery.refetch() }}>다시 불러오기</Button>
        </div>
      ) : null}
      {query.isSuccess && profileQuery.isSuccess ? (
        <WorkoutDetail record={query.data.workout} unit={profileQuery.data.unitPreference} onDelete={() => { mutation.reset(); setDeleting(true) }} />
      ) : null}
      <DeleteWorkoutDialog
        workout={deleting && query.isSuccess ? query.data.workout : null}
        pending={mutation.isPending}
        error={mutation.isError ? messageFor(mutation.error) : null}
        onCancel={() => { setDeleting(false); mutation.reset() }}
        onDelete={async (record) => {
          try {
            await mutation.mutateAsync(record.version)
            setDeleting(false)
            await navigate({ to: '/workouts' })
          } catch { /* Leave the record and confirmation visible after a failed delete. */ }
        }}
      />
    </main>
  )
}

function WorkoutDetail({ record, unit, onDelete }: { record: StrengthWorkoutRecord; unit: 'Metric' | 'Imperial'; onDelete: () => void }) {
  return (
    <article className="workout-detail">
      <header className="workout-detail__heading">
        <div>
          <p className="eyebrow">근력 운동</p>
          <h1>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: record.timezone }).format(new Date(record.recordedAt))}</h1>
        </div>
        <div className="workout-detail__actions">
          <Link className="button" to="/workouts/$workoutId/edit" params={{ workoutId: record.id }}>수정</Link>
          <Button type="button" variant="quiet" onClick={onDelete}>삭제</Button>
        </div>
      </header>
      {record.place ? <p className="workout-detail__place">{record.place}</p> : null}
      <ol className="workout-detail__items">
        {record.items.map((item) => (
          <li key={item.id}>
            <h2>{item.name}</h2>
            <p className="workout-detail__mode">{modeLabels[item.mode]}</p>
            {item.targetMuscles.length ? <p className="workout-detail__muscles">{item.targetMuscles.map((group) => muscleLabels[group]).join(' · ')}</p> : null}
            <ul className="workout-detail__sets">
              {item.sets.map((set, index) => (
                <li key={`${item.id}-set-${index}`}>
                  <span>{index + 1}세트</span>
                  <span>{set.reps === null ? '—' : `${set.reps}회`}</span>
                  <span>{set.loadKg === null ? '' : `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(displayWeight(set.loadKg, unit))} ${unit === 'Imperial' ? 'lb' : 'kg'}`}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {record.note ? <section className="workout-detail__note"><h2>메모</h2><p>{record.note}</p></section> : null}
    </article>
  )
}
