import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { FormField, TextInput } from '../components/ui/form-field'
import { healthApi, loadProfile } from '../lib/health-api'
import { canonicalWeight } from '../lib/health-time'

export const Route = createFileRoute('/body-weight-goal-new')({ component: BodyWeightGoalNewPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function positiveNumberError(value: string) {
  if (!value.trim()) return '목표값을 입력해 주세요.'
  return Number.isFinite(Number(value)) && Number(value) > 0 ? undefined : '0보다 큰 숫자를 입력해 주세요.'
}

function BodyWeightGoalNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const saveGoal = useMutation({
    mutationFn: healthApi.createBodyWeightGoal,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'goals'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })

  if (profileQuery.isPending) return <AppShell><h1>몸무게 목표 등록</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>몸무게 목표 등록</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <h1>몸무게 목표 등록</h1>
      <GoalForm
        key={profileQuery.data.unitPreference}
        unit={profileQuery.data.unitPreference}
        pending={saveGoal.isPending}
        onSave={(goal) => saveGoal.mutateAsync(goal)}
        onSaved={() => { void navigate({ to: '/body-weight-goal' }) }}
      />
      {saveGoal.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(saveGoal.error)}</p> : null}
    </AppShell>
  )
}

function GoalForm({
  unit,
  pending,
  onSave,
  onSaved,
}: {
  unit: 'Metric' | 'Imperial'
  pending: boolean
  onSave: (goal: { metric: 'body_weight'; targetValue: number; targetDate: string }) => Promise<unknown>
  onSaved: () => void
}) {
  const form = useForm({
    defaultValues: { targetValue: '', targetDate: '' },
    onSubmit: async ({ value }) => {
      try {
        await onSave({
          metric: 'body_weight',
          targetValue: canonicalWeight(Number(value.targetValue), unit),
          targetDate: value.targetDate,
        })
        form.reset({ targetValue: '', targetDate: '' })
        onSaved()
      } catch {
        // The mutation owns and displays request errors.
      }
    },
  })

  return (
    <form
      className="form-stack form-stack--two"
      noValidate
      onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}
    >
      <form.Field name="targetValue" validators={{
        onChange: ({ value }) => positiveNumberError(value),
        onSubmit: ({ value }) => positiveNumberError(value),
      }}>
        {(field) => {
          const error = field.state.meta.errors[0]
          return (
            <FormField id="goal-weight" label={`목표 몸무게 (${unit === 'Imperial' ? 'lb' : 'kg'})`} error={error}>
              <TextInput
                id="goal-weight"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'goal-weight-error' : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <form.Field name="targetDate" validators={{
        onChange: ({ value }) => value ? undefined : '목표 날짜를 선택해 주세요.',
        onSubmit: ({ value }) => value ? undefined : '목표 날짜를 선택해 주세요.',
      }}>
        {(field) => {
          const error = field.state.meta.errors[0]
          return (
            <FormField id="goal-date" label="목표 날짜" error={error}>
              <TextInput
                id="goal-date"
                type="date"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'goal-date-error' : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <Button type="submit" wide disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
    </form>
  )
}
