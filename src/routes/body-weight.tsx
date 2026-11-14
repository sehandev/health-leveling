import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { FormField, TextInput } from '../components/ui/form-field'
import { healthApi, loadProfile, type HealthProfile } from '../lib/health-api'
import { canonicalWeight, dateTimeInZoneToIso, formatDateTimeForZone } from '../lib/health-time'

export const Route = createFileRoute('/body-weight')({ component: BodyWeightPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function positiveNumberError(value: string) {
  if (!value.trim()) return '측정값을 입력해 주세요.'
  return Number.isFinite(Number(value)) && Number(value) > 0 ? undefined : '0보다 큰 숫자를 입력해 주세요.'
}

function recordedAtError(value: string, timezone: string) {
  try { dateTimeInZoneToIso(value, timezone); return undefined }
  catch (error) { return error instanceof Error ? error.message : '측정 시간을 확인해 주세요.' }
}

function BodyWeightPage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const saveMeasurement = useMutation({
    mutationFn: healthApi.createMeasurement,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'measurements', 'body_weight'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })

  if (profileQuery.isPending) return <AppShell><h1>몸무게 기록</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>몸무게 기록</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <h1>몸무게 기록</h1>
      <WeightRecorder
        key={profileQuery.data.unitPreference}
        profile={profileQuery.data}
        pending={saveMeasurement.isPending}
        onSave={(input) => saveMeasurement.mutateAsync(input)}
      />
      {saveMeasurement.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(saveMeasurement.error)}</p> : null}
      {saveMeasurement.isSuccess ? <p role="status" className="inline-status inline-status--success">저장했어요.</p> : null}
    </AppShell>
  )
}

function WeightRecorder({
  profile,
  pending,
  onSave,
}: {
  profile: HealthProfile
  pending: boolean
  onSave: (input: { metric: 'body_weight'; value: number; recordedAt: string; timezone: string }) => Promise<unknown>
}) {
  const initialTime = useMemo(() => formatDateTimeForZone(new Date(), profile.timezone), [profile.timezone])
  const previousTimezone = useRef(profile.timezone)
  const draftInstant = useRef(dateTimeInZoneToIso(initialTime, profile.timezone))
  const form = useForm({
    defaultValues: { value: '', recordedAt: initialTime },
    onSubmit: async ({ value }) => {
      const { value: inputValue, recordedAt } = value
      try {
        await onSave({
          metric: 'body_weight',
          value: canonicalWeight(Number(inputValue), profile.unitPreference),
          recordedAt: dateTimeInZoneToIso(recordedAt, profile.timezone),
          timezone: profile.timezone,
        })
        const nextTime = formatDateTimeForZone(new Date(), profile.timezone)
        form.reset({ value: '', recordedAt: nextTime })
        draftInstant.current = dateTimeInZoneToIso(nextTime, profile.timezone)
      } catch {
        // Keep the draft when the server rejects the save.
      }
    },
  })

  useEffect(() => {
    const fromTimezone = previousTimezone.current
    if (fromTimezone === profile.timezone) return
    previousTimezone.current = profile.timezone
    form.setFieldValue('recordedAt', formatDateTimeForZone(new Date(draftInstant.current), profile.timezone))
  }, [form, initialTime, profile.timezone])

  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}
    >
      <form.Field name="value" validators={{
        onChange: ({ value }) => positiveNumberError(value),
        onSubmit: ({ value }) => positiveNumberError(value),
      }}>
        {(field) => {
          const error = field.state.meta.errors[0]
          return (
            <FormField id="body-weight" label={`새 측정값 (${profile.unitPreference === 'Imperial' ? 'lb' : 'kg'})`} error={error}>
              <TextInput
                id="body-weight"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                autoComplete="off"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'body-weight-error' : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <form.Field name="recordedAt" validators={{
        onChange: ({ value }) => recordedAtError(value, profile.timezone),
        onSubmit: ({ value }) => recordedAtError(value, profile.timezone),
      }}>
        {(field) => {
          const error = field.state.meta.errors[0]
          return (
            <FormField id="recorded-at" label={`측정한 시간 (${profile.timezone})`} error={error}>
              <TextInput
                id="recorded-at"
                type="datetime-local"
                step="60"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  const nextTime = event.target.value
                  field.handleChange(nextTime)
                  try { draftInstant.current = dateTimeInZoneToIso(nextTime, profile.timezone) }
                  catch { /* Keep the last valid instant through invalid drafts and timezone changes. */ }
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'recorded-at-error' : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <Button type="submit" wide disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
    </form>
  )
}
