import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { FormField, SelectInput, TextInput } from '../components/ui/form-field'
import { healthApi, loadProfile, type ProfilePreferences, type UnitPreference } from '../lib/health-api'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요.'
}

function timezoneError(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return undefined }
  catch { return '시간대를 확인해 주세요.' }
}

function SettingsPage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const saveProfile = useMutation({
    mutationFn: healthApi.updateProfile,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })

  if (profileQuery.isPending) return <AppShell><h1>기록 설정</h1><p role="status" className="inline-status">불러오는 중…</p></AppShell>
  if (profileQuery.isError) {
    return (
      <AppShell>
        <h1>기록 설정</h1>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <h1>기록 설정</h1>
      <ProfileSettings
        key={`${profileQuery.data.unitPreference}:${profileQuery.data.timezone}`}
        profile={profileQuery.data}
        pending={saveProfile.isPending}
        onSave={(profile) => saveProfile.mutateAsync(profile)}
      />
      {saveProfile.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(saveProfile.error)}</p> : null}
      {saveProfile.isSuccess ? <p role="status" className="inline-status inline-status--success">저장했어요.</p> : null}
    </AppShell>
  )
}

function ProfileSettings({
  profile,
  pending,
  onSave,
}: {
  profile: ProfilePreferences
  pending: boolean
  onSave: (profile: ProfilePreferences) => Promise<unknown>
}) {
  const form = useForm({
    defaultValues: { unitPreference: profile.unitPreference, timezone: profile.timezone },
    onSubmit: async ({ value }) => {
      try { await onSave(value) }
      catch { /* The mutation owns and displays request errors. */ }
    },
  })
  useEffect(() => { form.reset({ unitPreference: profile.unitPreference, timezone: profile.timezone }) }, [profile.unitPreference, profile.timezone])

  return (
    <form className="form-stack" noValidate onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}>
      <form.Field name="unitPreference">
        {(field) => (
          <FormField id="unit-preference" label="단위">
            <SelectInput
              id="unit-preference"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value as UnitPreference)}
            >
              <option value="Metric">미터법 (kg)</option>
              <option value="Imperial">야드파운드법 (lb)</option>
            </SelectInput>
          </FormField>
        )}
      </form.Field>
      <form.Field name="timezone" validators={{
        onChange: ({ value }) => timezoneError(value),
        onSubmit: ({ value }) => timezoneError(value),
      }}>
        {(field) => {
          const error = field.state.meta.errors[0]
          return (
            <FormField id="profile-timezone" label="시간대" error={error}>
              <TextInput
                id="profile-timezone"
                autoComplete="off"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'profile-timezone-error' : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <Button type="submit" variant="quiet" disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
    </form>
  )
}
