import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { StrengthWorkoutRecord } from '../../domain/workout-records'
import { Button } from '../ui/button'
import { workoutApi } from '../../lib/workout-api'
import { workoutDetailQueryKey, workoutPickerQueryKey, workoutsQueryKey, progressionQueryKey } from './query-keys'
import { DeleteWorkoutDialog } from './delete-workout-dialog'

function messageFor(error: unknown) {
  if (error instanceof RangeError) return '입력 내용을 확인해 주세요.'
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.'
}

function formatWhen(record: StrengthWorkoutRecord) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: record.timezone,
  }).format(new Date(record.recordedAt))
}

export function WorkoutsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: workoutsQueryKey, queryFn: workoutApi.getWorkouts })
  const [deleteTarget, setDeleteTarget] = useState<StrengthWorkoutRecord | null>(null)
  const deleteMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => workoutApi.deleteWorkout(id, version),
    onSuccess: async (_result, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsQueryKey }),
        queryClient.invalidateQueries({ queryKey: workoutDetailQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: workoutPickerQueryKey }),
        queryClient.invalidateQueries({ queryKey: progressionQueryKey }),
      ])
    },
  })
  const deleteError = deleteMutation.isError ? messageFor(deleteMutation.error) : null

  return (
    <main className="app-shell workouts-shell">
      <header className="site-header">
        <Link className="wordmark workouts-home-link" to="/" aria-label="홈으로 돌아가기"><span className="brand-mark" aria-hidden="true" />나건렙</Link>
        <Link className="workouts-nav-link" to="/">홈</Link>
      </header>
      <header className="workouts-intro">
        <h1>운동 기록</h1>
      </header>
      <div className="workouts-page-heading">
        <h2>저장한 기록</h2>
        <Link className="button" to="/workouts/new">새 근력 운동</Link>
      </div>
      {query.isPending ? <p className="inline-status" role="status">불러오는 중…</p> : null}
      {query.isError ? (
        <div className="workouts-query-error" role="alert">
          <p className="inline-status inline-status--error">{messageFor(query.error)}</p>
          <Button type="button" variant="quiet" onClick={() => void query.refetch()}>다시 불러오기</Button>
        </div>
      ) : null}
      {query.isSuccess && query.data.workouts.length === 0 ? <p className="workouts-empty">저장한 운동이 없어요.</p> : null}
      {query.isSuccess && query.data.workouts.length > 0 ? (
        <ul className="workout-record-list">
          {query.data.workouts.map((workout) => (
            <li className="workout-record" key={workout.id}>
              <Link className="workout-record__link" to="/workouts/$workoutId" params={{ workoutId: workout.id }}>
                <time className="workout-record__time" dateTime={workout.recordedAt}>{formatWhen(workout)}</time>
                <p className="workout-record__summary">{workout.items.length}개 · {workout.items.map((item) => item.name).join(' · ')}</p>
                {workout.place ? <p className="workout-record__place">{workout.place}</p> : null}
              </Link>
              <div className="workout-record__actions">
                <Link className="button button--quiet" to="/workouts/$workoutId/edit" params={{ workoutId: workout.id }}>수정</Link>
                <Button type="button" variant="quiet" onClick={() => { deleteMutation.reset(); setDeleteTarget(workout) }}>삭제</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <DeleteWorkoutDialog
        workout={deleteTarget}
        pending={deleteMutation.isPending}
        error={deleteError}
        onCancel={() => { setDeleteTarget(null); deleteMutation.reset() }}
        onDelete={async (workout) => {
          try {
            await deleteMutation.mutateAsync({ id: workout.id, version: workout.version })
            setDeleteTarget(null)
            deleteMutation.reset()
          } catch { /* Keep the dialog open so a stale-version error cannot be mistaken for deletion. */ }
        }}
      />
    </main>
  )
}
