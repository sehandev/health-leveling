import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { WeightHistoryChart } from '../components/progression-charts'
import { Button } from '../components/ui/button'
import { keepDialogFocusValid, keepDialogTabInside } from '../components/workout/dialog-focus'
import { getUndoableMeasurement, healthApi, loadProfile, type HealthMeasurement, type UnitPreference } from '../lib/health-api'
import { displayWeight, formatDateTimeForZone } from '../lib/health-time'
import { useProgressionSnapshot } from '../lib/use-progression-snapshot'

export const Route = createFileRoute('/body-weight-progression')({ component: BodyWeightProgressionPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function formatWeight(valueKg: number, unit: UnitPreference) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(displayWeight(valueKg, unit))
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

function WeightProgression({ timezone, unitPreference }: { timezone: string; unitPreference: UnitPreference }) {
  const queryClient = useQueryClient()
  const [undoTarget, setUndoTarget] = useState<HealthMeasurement | null>(null)
  const progressionQuery = useProgressionSnapshot(timezone)
  const measurementsQuery = useQuery({ queryKey: ['health', 'measurements', 'body_weight'], queryFn: healthApi.getBodyWeightMeasurements })
  const undoMeasurement = useMutation({
    mutationFn: healthApi.undoMeasurement,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['health', 'measurements', 'body_weight'] }),
        queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
      ])
      setUndoTarget(null)
    },
  })
  const measurements = measurementsQuery.data?.measurements ?? []
  const undoable = getUndoableMeasurement(measurements)

  return (
    <>
      {progressionQuery.isPending ? <p role="status" className="inline-status">불러오는 중…</p> : null}
      {progressionQuery.isError ? (
        <div role="alert">
          <p className="inline-status inline-status--error">{errorMessage(progressionQuery.error)}</p>
          <Button variant="quiet" onClick={() => void progressionQuery.refetch()}>다시 불러오기</Button>
        </div>
      ) : null}
      {progressionQuery.isSuccess ? <WeightHistoryChart days={progressionQuery.data.days} unitPreference={unitPreference} /> : null}
      <section className="content-section" aria-labelledby="weight-measurements-title">
        <h2 id="weight-measurements-title">전체 측정 기록</h2>
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
              <MeasurementRow key={measurement.id} measurement={measurement} unit={unitPreference} />
            ))}
          </ul>
        ) : null}
        {undoable ? (
          <div className="undo-row">
            <Button
              type="button"
              variant="quiet"
              disabled={undoMeasurement.isPending}
              onClick={() => {
                undoMeasurement.reset()
                setUndoTarget(undoable)
              }}
              aria-label={`${undoable.localDate} 몸무게 기록 되돌리기`}
            >
              {undoMeasurement.isPending ? '되돌리는 중…' : '최근 기록 되돌리기'}
            </Button>
          </div>
        ) : null}
        <WeightUndoDialog
          measurement={undoTarget}
          unit={unitPreference}
          pending={undoMeasurement.isPending}
          error={undoMeasurement.isError ? errorMessage(undoMeasurement.error) : null}
          onClose={() => { if (!undoMeasurement.isPending) setUndoTarget(null) }}
          onUndo={(measurement) => undoMeasurement.mutate(measurement.id)}
        />
        {undoMeasurement.isError && !undoTarget ? <p role="alert" className="inline-status inline-status--error">{errorMessage(undoMeasurement.error)}</p> : null}
        {undoMeasurement.isSuccess ? <p role="status" className="inline-status inline-status--success">되돌렸어요.</p> : null}
      </section>
    </>
  )
}

function WeightUndoDialog({
  measurement,
  unit,
  pending,
  error,
  onClose,
  onUndo,
}: {
  measurement: HealthMeasurement | null
  unit: UnitPreference
  pending: boolean
  error: string | null
  onClose: () => void
  onUndo: (measurement: HealthMeasurement) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const invokingControl = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (measurement && !element.open) {
      const activeElement = document.activeElement
      invokingControl.current = activeElement instanceof HTMLElement ? activeElement : null
      element.showModal()
      element.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
    } else if (!measurement && element.open) element.close()
  }, [measurement])

  useEffect(() => {
    keepDialogFocusValid(dialog.current, document.activeElement)
  }, [pending])

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="weight-undo-dialog"
      aria-labelledby="weight-undo-title"
      onKeyDown={(event) => keepDialogTabInside(dialog.current, event, document.activeElement)}
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose() }}
      onClose={() => {
        const invoking = invokingControl.current
        invokingControl.current = null
        if (invoking?.isConnected) invoking.focus()
      }}
    >
      <div className="weight-undo-dialog__top">
        <Button type="button" variant="quiet" className="weight-undo-dialog__close" aria-label="닫기" data-dialog-initial-focus disabled={pending} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      <h2 id="weight-undo-title">이 몸무게 기록을 되돌릴까요?</h2>
      {measurement ? (
        <dl className="weight-undo-dialog__record">
          <div><dt>기록 시각</dt><dd><time dateTime={measurement.recordedAt}>{formatDateTimeForZone(new Date(measurement.recordedAt), measurement.timezone).replace('T', ' ')}</time></dd></div>
          <div><dt>몸무게</dt><dd>{formatWeight(measurement.value, unit)} {unit === 'Imperial' ? 'lb' : 'kg'}</dd></div>
        </dl>
      ) : null}
      {error ? <p role="alert" className="inline-status inline-status--error">{error}</p> : null}
      <div className="weight-undo-dialog__actions">
        <Button type="button" disabled={!measurement || pending} onClick={() => { if (measurement) onUndo(measurement) }}>되돌리기</Button>
      </div>
    </dialog>
  )
}

function MeasurementRow({ measurement, unit }: { measurement: HealthMeasurement; unit: UnitPreference }) {
  const recordedAt = formatDateTimeForZone(new Date(measurement.recordedAt), measurement.timezone).replace('T', ' ')
  return (
    <li className="measurement-item">
      <time dateTime={measurement.recordedAt}>{recordedAt}</time>
      <span className="measurement-value">{formatWeight(measurement.value, unit)} {unit === 'Imperial' ? 'lb' : 'kg'}</span>
    </li>
  )
}
