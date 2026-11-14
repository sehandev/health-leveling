import { useEffect, useRef } from 'react'
import type { StrengthWorkoutRecord } from '../../domain/workout-records'
import { Button } from '../ui/button'
import { keepDialogFocusValid, keepDialogTabInside } from './dialog-focus'

export function DeleteWorkoutDialog({
  workout,
  pending,
  error,
  onCancel,
  onDelete,
}: {
  workout: StrengthWorkoutRecord | null
  pending: boolean
  error: string | null
  onCancel: () => void
  onDelete: (workout: StrengthWorkoutRecord) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const invokingControl = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (workout && !element.open) {
      const activeElement = document.activeElement
      invokingControl.current = activeElement instanceof HTMLElement ? activeElement : null
      element.showModal()
      element.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
    } else if (!workout && element.open) element.close()
  }, [workout])
  useEffect(() => {
    keepDialogFocusValid(dialog.current, document.activeElement)
  }, [pending])

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="workout-dialog workout-confirm-dialog"
      aria-labelledby="workout-delete-title"
      onKeyDown={(event) => keepDialogTabInside(dialog.current, event, document.activeElement)}
      onCancel={(event) => { event.preventDefault(); onCancel() }}
      onClose={() => {
        const invoking = invokingControl.current
        invokingControl.current = null
        if (workout) onCancel()
        if (invoking?.isConnected) invoking.focus()
      }}
    >
      <h2 id="workout-delete-title">이 운동 기록을 삭제할까요?</h2>
      {workout ? <p className="workout-delete-name">{workout.items.map((item) => item.name).join(' · ')}</p> : null}
      {error ? <p className="inline-status inline-status--error" role="alert">{error}</p> : null}
      <div className="workout-dialog__actions">
        <Button type="button" variant="quiet" data-dialog-initial-focus disabled={pending} onClick={onCancel}>취소</Button>
        <Button type="button" disabled={!workout || pending} onClick={() => { if (workout) void onDelete(workout) }}>{pending ? '삭제 중…' : '삭제'}</Button>
      </div>
    </dialog>
  )
}
