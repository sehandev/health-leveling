import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_TARGET_MUSCLES, MUSCLE_GROUPS, type MuscleGroup, type StrengthMode } from '../../domain/workouts'
import { pickerOptions, targetMusclesForWorkoutItem, type StrengthWorkoutDraft, type StrengthWorkoutRecord, type WorkoutPickerState } from '../../domain/workout-records'
import { Button } from '../ui/button'
import { FormField, SelectInput, TextInput } from '../ui/form-field'
import { formatDateTimeForZone } from '../../lib/health-time'
import { buildStrengthWorkoutDraft, formatWorkoutLoadInput, FUTURE_WORKOUT_TIME_ERROR, moveWorkoutItem, workoutRecordedAtToIso, type WorkoutEditorItem as EditorItem, type WorkoutEditorSet as EditorSet, type WorkoutEditorValues as EditorValues } from './workout-draft'
import { workoutApi } from '../../lib/workout-api'
import { loadWorkoutProfile } from './workout-profile'
import { workoutDetailQueryKey, workoutPickerQueryKey, workoutsQueryKey, progressionQueryKey } from './query-keys'
import { keepDialogFocusValid, keepDialogTabInside } from './dialog-focus'

const MODE_LABELS: Record<StrengthMode, string> = { Machine: '머신', 'Free Weight': '프리 웨이트', Bodyweight: '맨몸' }
const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  Chest: '가슴', Back: '등', Shoulders: '어깨', Biceps: '이두', Triceps: '삼두',
  Forearms: '전완', Core: '코어', Glutes: '둔근', Quadriceps: '대퇴사두', Hamstrings: '햄스트링', Calves: '종아리',
}
const MODES: readonly StrengthMode[] = ['Machine', 'Free Weight', 'Bodyweight']

function messageFor(error: unknown) {
  if (error instanceof RangeError) return error.message === FUTURE_WORKOUT_TIME_ERROR ? FUTURE_WORKOUT_TIME_ERROR : '입력 내용을 확인해 주세요.'
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.'
}

export function WorkoutEditorPage({ workoutId }: { workoutId: string | null }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadWorkoutProfile })
  const pickerQuery = useQuery({ queryKey: workoutPickerQueryKey, queryFn: workoutApi.getWorkoutPicker })
  const workoutQuery = useQuery({
    queryKey: workoutDetailQueryKey(workoutId ?? ''),
    queryFn: () => workoutApi.getWorkout(workoutId!),
    enabled: workoutId !== null,
  })
  const invalidateAfterWorkout = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: workoutsQueryKey }),
    queryClient.invalidateQueries({ queryKey: workoutPickerQueryKey }),
    queryClient.invalidateQueries({ queryKey: progressionQueryKey }),
    ...(workoutId ? [queryClient.invalidateQueries({ queryKey: workoutDetailQueryKey(workoutId) })] : []),
  ])
  const createMutation = useMutation({
    mutationFn: ({ draft, idempotencyKey }: { draft: StrengthWorkoutDraft; idempotencyKey: string }) => workoutApi.createWorkout(draft, idempotencyKey),
    onSuccess: invalidateAfterWorkout,
  })
  const updateMutation = useMutation({
    mutationFn: (input: { workout: StrengthWorkoutDraft; version: number }) => workoutApi.updateWorkout(workoutId!, input.workout, input.version),
    onSuccess: invalidateAfterWorkout,
  })
  const usageMutation = useMutation({
    mutationFn: workoutApi.addCustomUsage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workoutPickerQueryKey }),
  })

  const ready = profileQuery.isSuccess && pickerQuery.isSuccess && (workoutId === null || workoutQuery.isSuccess)
  if (!ready) {
    const error = profileQuery.error ?? pickerQuery.error ?? workoutQuery.error
    return (
      <EditorShell>
        {profileQuery.isError || pickerQuery.isError || (workoutId && workoutQuery.isError)
          ? <p className="inline-status inline-status--error" role="alert">{messageFor(error)}</p>
          : <p className="inline-status" role="status">불러오는 중…</p>}
        <Link className="button button--quiet" to="/workouts">목록</Link>
      </EditorShell>
    )
  }

  return (
    <WorkoutEditorForm
      key={workoutId ?? 'new'}
      workout={workoutId ? workoutQuery.data!.workout : null}
      profile={profileQuery.data!}
      pickerState={pickerQuery.data!}
      onAddUsage={(usage) => usageMutation.mutateAsync(usage)}
      usagePending={usageMutation.isPending}
      savePending={createMutation.isPending || updateMutation.isPending}
      onCreate={(draft, idempotencyKey) => createMutation.mutateAsync({ draft, idempotencyKey })}
      onUpdate={(_id, draft, version) => updateMutation.mutateAsync({ workout: draft, version })}
      onSaved={() => void navigate({ to: '/' })}
      onCancel={() => void navigate({ to: '/workouts' })}
    />
  )
}

function WorkoutEditorForm({
  workout,
  profile,
  pickerState,
  onAddUsage,
  usagePending,
  savePending,
  onCreate,
  onUpdate,
  onSaved,
  onCancel,
}: {
  workout: StrengthWorkoutRecord | null
  profile: Awaited<ReturnType<typeof loadWorkoutProfile>>
  pickerState: WorkoutPickerState
  onAddUsage: (usage: { usageId: string; mode: StrengthMode; name: string }) => Promise<unknown>
  usagePending: boolean
  savePending: boolean
  onCreate: (draft: StrengthWorkoutDraft, idempotencyKey: string) => Promise<unknown>
  onUpdate: (id: string, draft: StrengthWorkoutDraft, version: number) => Promise<unknown>
  onSaved: () => void
  onCancel: () => void
}) {
  const [displayUnit] = useState(profile.unitPreference)
  const [timezone] = useState(workout?.timezone ?? profile.timezone)
  const [createActionId] = useState(() => workout ? null : crypto.randomUUID())
  const [pickerPosition, setPickerPosition] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const initialTime = useMemo(
    () => formatDateTimeForZone(workout ? new Date(workout.recordedAt) : new Date(), timezone),
    [timezone, workout],
  )
  const defaultValues: EditorValues = {
      recordedAt: initialTime,
      place: workout?.place ?? '',
      note: workout?.note ?? '',
      items: workout?.items.map((item) => ({
        ...item,
        targetMuscles: [...item.targetMuscles],
        sets: item.sets.map((set) => ({
          reps: set.reps === null ? '' : String(set.reps),
          load: set.loadKg === null ? '' : formatWorkoutLoadInput(set.loadKg, displayUnit),
          originalLoadKg: set.loadKg,
        })),
      })) ?? [],
  }
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null)
      try {
        const draft = buildStrengthWorkoutDraft(value, timezone, displayUnit)
        if (workout) await onUpdate(workout.id, draft, workout.version)
        else await onCreate(draft, createActionId!)
        onSaved()
      } catch (error) {
        setSubmitError(messageFor(error))
      }
    },
  })

  const [focusInsertedItemId, setFocusInsertedItemId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusInsertedItemId) return
    const nameInput = document.getElementById(`workout-item-${focusInsertedItemId}-name`)
    if (nameInput) {
      nameInput.focus()
      setFocusInsertedItemId(null)
    }
  }, [focusInsertedItemId, form.state.values.items])

  const addItem = (position: number, mode: StrengthMode, name: string, source: 'curated' | 'custom') => {
    const targetMuscles = targetMusclesForWorkoutItem({ mode, name, source }, pickerState.selections)
    const next: EditorItem = { id: crypto.randomUUID(), name, source, mode, targetMuscles, sets: [{ reps: '', load: '', originalLoadKg: null }] }
    setFocusInsertedItemId(next.id)
    form.setFieldValue('items', (items) => [...items.slice(0, position), next, ...items.slice(position)])
    setPickerPosition(null)
  }
  const addCustomItem = async (mode: StrengthMode, name: string) => {
    if (!name.trim()) throw new Error('운동 이름을 입력해 주세요.')
    await onAddUsage({ usageId: crypto.randomUUID(), mode, name })
    addItem(pickerPosition ?? 0, mode, name, 'custom')
  }

  return (
    <EditorShell>
      <header className="workouts-editor-heading">
        <div><h1>{workout ? '운동 수정' : '새 근력 운동'}</h1></div>
        <Button type="button" variant="quiet" disabled={savePending} onClick={onCancel}>취소</Button>
      </header>
      <form
        className="workout-form"
        noValidate
        onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}
      >
        <section className="workout-meta" aria-label="운동 시간과 메모">
          <form.Field name="recordedAt" validators={{
            onChange: ({ value }) => { try { workoutRecordedAtToIso(value, timezone); return undefined } catch (cause) { return messageFor(cause) } },
            onSubmit: ({ value }) => { try { workoutRecordedAtToIso(value, timezone); return undefined } catch (cause) { return messageFor(cause) } },
          }}>
            {(field) => {
              const fieldError = field.state.meta.errors[0]
              return (
                <FormField id="workout-recorded-at" label={`운동한 시간 · ${timezone}`} error={fieldError}>
                  <TextInput
                    id="workout-recorded-at" type="datetime-local" step="60"
                    value={field.state.value} onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? 'workout-recorded-at-error' : undefined}
                  />
                </FormField>
              )
            }}
          </form.Field>
          <form.Field name="place">
            {(field) => <FormField id="workout-place" label="장소 (선택)"><TextInput id="workout-place" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /></FormField>}
          </form.Field>
          <form.Field name="note">
            {(field) => (
              <div className="form-row">
                <label className="field-label" htmlFor="workout-note">메모 (선택)</label>
                <textarea id="workout-note" className="workout-textarea" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} rows={3} />
              </div>
            )}
          </form.Field>
        </section>

        <section className="workout-items-section" aria-labelledby="workout-items-title">
          <div className="workout-items-heading">
            <h2 id="workout-items-title">운동 순서</h2>
            <span className="section-note">{form.state.values.items.length}개</span>
          </div>
          <form.Field name="items">
            {(field) => (
              <ol className="workout-item-list">
                <WorkoutPicker
                  key="insert-0" index={0} active={pickerPosition === 0} pickerState={pickerState} usagePending={usagePending}
                  onOpen={() => setPickerPosition(0)} onClose={() => setPickerPosition(null)}
                  onChoose={addItem} onCustom={addCustomItem}
                />
                {field.state.value.map((item, index) => (
                  <Fragment key={item.id}>
                  <li className="workout-item">
                    <div className="workout-item__heading">
                      <span className="workout-item__number" aria-hidden="true">{index + 1}</span>
                      <div className="workout-item__actions">
                        <Button type="button" variant="quiet" className="workout-icon-button" disabled={index === 0} aria-label={`${item.name || '운동'} 위로 이동`} onClick={() => field.handleChange(moveWorkoutItem(field.state.value, index, index - 1))}>↑</Button>
                        <Button type="button" variant="quiet" className="workout-icon-button" disabled={index === field.state.value.length - 1} aria-label={`${item.name || '운동'} 아래로 이동`} onClick={() => field.handleChange(moveWorkoutItem(field.state.value, index, index + 1))}>↓</Button>
                        <Button type="button" variant="quiet" className="workout-remove-button" aria-label={`${item.name || '운동'} 삭제`} onClick={() => field.handleChange(field.state.value.filter((_, itemIndex) => itemIndex !== index))}>삭제</Button>
                      </div>
                    </div>
                    <div className="workout-item__details">
                      <FormField id={`workout-item-${item.id}-name`} label="운동 이름">
                        <TextInput
                          id={`workout-item-${item.id}-name`} value={item.name}
                          onChange={(event) => {
                            const name = event.target.value
                            const source = item.source === 'curated' && !Object.hasOwn(DEFAULT_TARGET_MUSCLES[item.mode], name) ? 'custom' : item.source
                            field.handleChange(replaceItem(field.state.value, index, { ...item, name, source }))
                          }}
                        />
                      </FormField>
                      <FormField id={`workout-item-${index}-mode`} label="운동 방식">
                        <SelectInput id={`workout-item-${index}-mode`} value={item.mode} onChange={(event) => {
                          const mode = event.target.value as StrengthMode
                          const source = item.source === 'curated' && !Object.hasOwn(DEFAULT_TARGET_MUSCLES[mode], item.name) ? 'custom' : item.source
                          field.handleChange(replaceItem(field.state.value, index, { ...item, mode, source }))
                        }}>
                          {MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
                        </SelectInput>
                      </FormField>
                    </div>
                    <fieldset className="workout-muscles">
                      <legend>대상 근육 (선택)</legend>
                      <div className="workout-muscles__options">
                        {MUSCLE_GROUPS.map((group) => (
                          <label className="workout-muscle-option" key={group}>
                            <input type="checkbox" checked={item.targetMuscles.includes(group)} onChange={(event) => {
                              const targetMuscles = event.target.checked ? [...item.targetMuscles, group] : item.targetMuscles.filter((selected) => selected !== group)
                              field.handleChange(replaceItem(field.state.value, index, { ...item, targetMuscles }))
                            }} />
                            <span>{MUSCLE_LABELS[group]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="workout-sets-heading"><h3>세트</h3></div>
                    <ol className="workout-set-list" aria-label={`${item.name || '운동'} 세트`}>
                      {item.sets.map((set, setIndex) => (
                        <li className="workout-set" key={`${item.id}-set-${setIndex}`}>
                          <span className="workout-set__number">{setIndex + 1}</span>
                          <label className="workout-set__field">
                            <span>횟수</span>
                            <input className="text-input" aria-label={`${item.name || '운동'} ${setIndex + 1}세트 반복 횟수`} type="number" min="0" step="1" inputMode="numeric" value={set.reps} onChange={(event) => field.handleChange(replaceSet(field.state.value, index, setIndex, { ...set, reps: event.target.value }))} />
                          </label>
                          <label className="workout-set__field">
                            <span>중량 ({displayUnit === 'Imperial' ? 'lb' : 'kg'}, 선택)</span>
                            <input className="text-input" aria-label={`${item.name || '운동'} ${setIndex + 1}세트 중량 (${displayUnit === 'Imperial' ? 'lb' : 'kg'}, 선택)`} type="number" min="0" step="any" inputMode="decimal" value={set.load} onChange={(event) => field.handleChange(replaceSet(field.state.value, index, setIndex, { ...set, load: event.target.value }))} />
                          </label>
                          <Button type="button" variant="quiet" className="workout-set__remove" aria-label={`${item.name || '운동'} ${setIndex + 1}세트 삭제`} onClick={() => field.handleChange(replaceItem(field.state.value, index, { ...item, sets: item.sets.filter((_, removeIndex) => removeIndex !== setIndex) }))}>×</Button>
                        </li>
                      ))}
                    </ol>
                    <Button type="button" variant="quiet" className="workout-set-add" onClick={() => field.handleChange(replaceItem(field.state.value, index, { ...item, sets: [...item.sets, { reps: '', load: '', originalLoadKg: null }] }))}>세트 추가</Button>
                  </li>
                  <WorkoutPicker
                    key={`insert-${index + 1}`} index={index + 1} active={pickerPosition === index + 1} pickerState={pickerState} usagePending={usagePending}
                    onOpen={() => setPickerPosition(index + 1)} onClose={() => setPickerPosition(null)}
                    onChoose={addItem} onCustom={addCustomItem}
                  />
                  </Fragment>
                ))}
              </ol>
            )}
          </form.Field>
        </section>
        {submitError ? <p className="inline-status inline-status--error workout-submit-error" role="alert">{submitError}</p> : null}
        <div className="workout-submit-actions">
          <Button type="button" variant="quiet" disabled={savePending} onClick={onCancel}>취소</Button>
          <Button type="submit" disabled={savePending || usagePending}>{savePending ? '저장 중…' : usagePending ? '추가 중…' : '저장'}</Button>
        </div>
      </form>
    </EditorShell>
  )
}

function WorkoutPicker({
  index,
  active,
  pickerState,
  usagePending,
  onOpen,
  onClose,
  onChoose,
  onCustom,
}: {
  index: number
  active: boolean
  pickerState: WorkoutPickerState
  usagePending: boolean
  onOpen: () => void
  onClose: () => void
  onChoose: (position: number, mode: StrengthMode, name: string, source: 'curated' | 'custom') => void
  onCustom: (mode: StrengthMode, name: string) => Promise<void>
}) {
  const [directInputOpen, setDirectInputOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fade, setFade] = useState({ top: false, bottom: false })
  const scroll = useRef<HTMLDivElement>(null)
  const updateFade = () => {
    const element = scroll.current
    if (element) setFade({ top: element.scrollTop > 2, bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 2 })
  }
  const recent = (mode: StrengthMode) => pickerOptions(mode, pickerState)
  useEffect(() => { if (active) updateFade() }, [active, pickerState])

  if (!active) return <li className="workout-insert-point"><Button type="button" variant="quiet" className={`workout-add-point${index > 0 ? ' workout-add-point--outline' : ''}`} disabled={usagePending} aria-label={`운동 추가, ${index + 1}번째 위치`} onClick={onOpen}>운동 추가</Button></li>

  return (
    <li className="workout-insert-point">
      <section className="workout-picker" aria-label="운동 선택">
        <div className="workout-picker__heading"><h3>운동 선택</h3><Button type="button" variant="quiet" disabled={usagePending} onClick={onClose}>닫기</Button></div>
        {usagePending ? <p className="inline-status" role="status">추가 중…</p> : null}
        {error ? <p className="inline-status inline-status--error" role="alert">{error}</p> : null}
        <div ref={scroll} className={`workout-picker__scroll${fade.top ? ' has-top-fade' : ''}${fade.bottom ? ' has-bottom-fade' : ''}`} onScroll={updateFade}>
          {MODES.map((mode) => {
            const options = recent(mode)
            const curatedNames = Object.keys(DEFAULT_TARGET_MUSCLES[mode])
            return (
              <section className="workout-picker__group" key={mode}>
                <h4>{MODE_LABELS[mode]}</h4>
                <div className="workout-picker__buttons">
                  {curatedNames.map((name) => <Button key={`curated:${name}`} type="button" variant="quiet" className="workout-picker__choice" disabled={usagePending} onClick={() => onChoose(index, mode, name, 'curated')}>{name}</Button>)}
                  {options.promotedCustomNames.length ? (
                    <div className="workout-picker__promoted">
                      <h5>자주 추가한 운동</h5>
                      {options.promotedCustomNames.map((name) => <Button key={`custom:${name}`} type="button" variant="quiet" className="workout-picker__choice" disabled={usagePending} onClick={async () => { setError(null); try { await onCustom(mode, name) } catch (cause) { setError(messageFor(cause)) } }}>{name}</Button>)}
                    </div>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
        <div className="workout-picker__footer"><Button type="button" variant="quiet" disabled={usagePending} onClick={() => setDirectInputOpen(true)}>직접 입력</Button></div>
        <DirectInputDialog
          open={directInputOpen} pickerState={pickerState} pending={usagePending} onClose={() => setDirectInputOpen(false)}
          onAdd={onCustom}
        />
      </section>
    </li>
  )
}

function DirectInputDialog({
  open,
  pickerState,
  pending,
  onClose,
  onAdd,
}: {
  open: boolean
  pickerState: WorkoutPickerState
  pending: boolean
  onClose: () => void
  onAdd: (mode: StrengthMode, name: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const invokingControl = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<StrengthMode>('Machine')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      setMode('Machine')
      setName('')
      setError(null)
      const activeElement = document.activeElement
      invokingControl.current = activeElement instanceof HTMLElement ? activeElement : null
      element.showModal()
      element.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
    } else if (!open && element.open) element.close()
  }, [open])
  useEffect(() => {
    keepDialogFocusValid(dialog.current, document.activeElement)
  }, [pending])

  const recentNames = pickerOptions(mode, pickerState).recentCustomNames
  const add = async (selectedName: string) => {
    if (!selectedName.trim()) { setError('운동 이름을 입력해 주세요.'); return }
    setError(null)
    try { await onAdd(mode, selectedName); onClose() }
    catch (cause) { setError(messageFor(cause)) }
  }
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="workout-dialog workout-direct-dialog"
      aria-labelledby="workout-direct-title"
      onKeyDown={(event) => keepDialogTabInside(dialog.current, event, document.activeElement)}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClose={() => {
        const invoking = invokingControl.current
        invokingControl.current = null
        onClose()
        if (invoking?.isConnected) invoking.focus()
      }}
    >
      <h2 id="workout-direct-title">운동 직접 입력</h2>
      <label className="form-row">
        <span className="field-label">운동 방식</span>
        <SelectInput value={mode} disabled={pending} onChange={(event) => setMode(event.target.value as StrengthMode)}>
          {MODES.map((itemMode) => <option key={itemMode} value={itemMode}>{MODE_LABELS[itemMode]}</option>)}
        </SelectInput>
      </label>
      <label className="form-row" htmlFor="workout-custom-name">
        <span className="field-label">운동 이름</span>
        <TextInput id="workout-custom-name" data-dialog-initial-focus disabled={pending} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {recentNames.length ? (
        <section className="workout-recent" aria-labelledby="workout-recent-title">
          <h3 id="workout-recent-title">최근 추가</h3>
          <div className="workout-recent__list">{recentNames.map((recentName) => <Button key={recentName} type="button" variant="quiet" disabled={pending} onClick={() => void add(recentName)}>{recentName}</Button>)}</div>
        </section>
      ) : null}
      {pending ? <p role="status" className="inline-status">추가 중…</p> : null}
      {error ? <p role="alert" className="inline-status inline-status--error">{error}</p> : null}
      <div className="workout-dialog__actions">
        <Button type="button" variant="quiet" onClick={onClose}>취소</Button>
        <Button type="button" disabled={pending} onClick={() => void add(name)}>{pending ? '추가 중…' : '추가'}</Button>
      </div>
    </dialog>
  )
}

function EditorShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell workouts-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="홈으로 돌아가기"><span className="brand-mark" aria-hidden="true" />나건렙</Link>
      </header>
      {children}
    </main>
  )
}

function replaceItem(items: EditorItem[], index: number, item: EditorItem): EditorItem[] {
  return items.map((current, currentIndex) => currentIndex === index ? item : current)
}
function replaceSet(items: EditorItem[], itemIndex: number, setIndex: number, set: EditorSet): EditorItem[] {
  return replaceItem(items, itemIndex, { ...items[itemIndex], sets: items[itemIndex].sets.map((current, currentIndex) => currentIndex === setIndex ? set : current) })
}
