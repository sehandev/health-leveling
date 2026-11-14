import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { healthApi, getUndoableMeasurement, loadProfile, type HealthMeasurement, type UnitPreference } from '../lib/health-api'
import { displayWeight } from '../lib/health-time'

export const Route = createFileRoute('/body-weight-history')({ component: BodyWeightHistoryPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function formatWeight(valueKg: number, unit: UnitPreference) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(displayWeight(valueKg, unit))
}

function BodyWeightHistoryPage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const measurementsQuery = useQuery({ queryKey: ['health', 'measurements', 'body_weight'], queryFn: healthApi.getBodyWeightMeasurements })
  const undoMeasurement = useMutation({
    mutationFn: healthApi.undoMeasurement,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'measurements', 'body_weight'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })

  if (profileQuery.isPending) return <AppShell><h1>몸무게 기록 목록</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>몸무게 기록 목록</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }

  const measurements = measurementsQuery.data?.measurements ?? []
  const undoable = getUndoableMeasurement(measurements)

  return (
    <AppShell>
      <h1>몸무게 기록 목록</h1>
      {measurementsQuery.isPending ? <p role="status" className="inline-status">불러오는 중…</p> : null}
      {measurementsQuery.isError ? (
        <div role="alert">
          <p className="inline-status inline-status--error">{errorMessage(measurementsQuery.error)}</p>
          <Button variant="quiet" onClick={() => void measurementsQuery.refetch()}>다시 불러오기</Button>
        </div>
      ) : null}
      {measurementsQuery.isSuccess && measurements.length === 0 ? <p className="inline-status">아직 기록이 없어요.</p> : null}
      {measurementsQuery.isSuccess && measurements.length > 0 ? (
        <ul className="measurement-list" aria-label="몸무게 기록">
          {measurements.map((measurement) => (
            <MeasurementRow key={measurement.id} measurement={measurement} unit={profileQuery.data.unitPreference} />
          ))}
        </ul>
      ) : null}
      {undoable ? (
        <div className="undo-row">
          <Button
            type="button"
            variant="quiet"
            disabled={undoMeasurement.isPending}
            onClick={() => undoMeasurement.mutate(undoable.id)}
            aria-label={`${undoable.localDate} 몸무게 기록 되돌리기`}
          >
            {undoMeasurement.isPending ? '되돌리는 중…' : '최근 기록 되돌리기'}
          </Button>
        </div>
      ) : null}
      {undoMeasurement.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(undoMeasurement.error)}</p> : null}
      {undoMeasurement.isSuccess ? <p role="status" className="inline-status inline-status--success">되돌렸어요.</p> : null}
    </AppShell>
  )
}

function MeasurementRow({ measurement, unit }: { measurement: HealthMeasurement; unit: UnitPreference }) {
  return (
    <li className="measurement-item">
      <time dateTime={measurement.recordedAt}>{measurement.localDate}</time>
      <span className="measurement-value">{formatWeight(measurement.value, unit)} {unit === 'Imperial' ? 'lb' : 'kg'}</span>
    </li>
  )
}
