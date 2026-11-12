import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { WeightHistoryChart, XpHistoryChart } from '../components/progression-charts'
import { Button } from '../components/ui/button'
import { FormField, SelectInput, TextInput } from '../components/ui/form-field'
import { getUndoableMeasurement, healthApi, type HealthGoal, type HealthMeasurement, type HealthProfile, type ProfilePreferences, type UnitPreference } from '../lib/health-api'
import { progressionQueryKey, xpProgress } from '../lib/progression'
import { canonicalWeight, dateInTimezone, dateTimeInZoneToIso, displayWeight, formatDateTimeForZone } from '../lib/health-time'

export const Route = createFileRoute('/')({ component: HomePage })

async function loadProfile() {
  const profile = await healthApi.getProfile()
  if (typeof window === 'undefined' || profile.initialized) return profile

  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return deviceTimezone
    ? healthApi.updateProfile({ unitPreference: profile.unitPreference, timezone: deviceTimezone })
    : profile
}

function errorMessage(error: Error | null) {
  return error?.message ?? '요청을 처리하지 못했어요. 다시 시도해 주세요.'
}

function formatWeight(valueKg: number, unit: UnitPreference) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(displayWeight(valueKg, unit))
}

function positiveNumberError(value: string, label: string) {
  if (!value.trim()) return `${label}을 입력해 주세요.`
  return Number.isFinite(Number(value)) && Number(value) > 0 ? undefined : '0보다 큰 숫자를 입력해 주세요.'
}

function recordedAtError(value: string, timezone: string) {
  try { dateTimeInZoneToIso(value, timezone); return undefined }
  catch (error) { return error instanceof Error ? error.message : '날짜와 시간을 확인해 주세요.' }
}

function timezoneError(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return undefined }
  catch { return '올바른 IANA 시간대를 입력해 주세요.' }
}

function HomePage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  const measurementsQuery = useQuery({ queryKey: ['health', 'measurements', 'body_weight'], queryFn: healthApi.getBodyWeightMeasurements })
  const goalsQuery = useQuery({ queryKey: ['health', 'goals'], queryFn: healthApi.getGoals })

  const saveMeasurement = useMutation({
    mutationFn: healthApi.createMeasurement,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'measurements', 'body_weight'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })
  const undoMeasurement = useMutation({
    mutationFn: healthApi.undoMeasurement,
    onSuccess: () => {
      saveMeasurement.reset()
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['health', 'measurements', 'body_weight'] }),
        queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
      ])
    },
  })
  const saveGoal = useMutation({
    mutationFn: healthApi.createBodyWeightGoal,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'goals'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })
  const saveProfile = useMutation({
    mutationFn: healthApi.updateProfile,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['health', 'progression'] }),
    ]),
  })

  if (profileQuery.isPending) {
    return <Shell><p role="status" className="inline-status">건강 기록을 불러오고 있어요…</p></Shell>
  }
  if (profileQuery.isError) {
    return (
      <Shell>
        <p role="alert" className="inline-status inline-status--error">{errorMessage(profileQuery.error)}</p>
        <Button variant="quiet" onClick={() => void profileQuery.refetch()}>다시 불러오기</Button>
      </Shell>
    )
  }

  const profile = profileQuery.data
  const measurements = measurementsQuery.data?.measurements ?? []
  const latestMeasurement = measurements[0]
  const undoableMeasurement = getUndoableMeasurement(measurements)
  const activeGoal = goalsQuery.data?.goals.find((goal) => goal.metric === 'body_weight' && goal.active)

  return (
    <Shell>
      <header className="home-intro">
        <p className="eyebrow">오늘, 나를 위한 한 걸음</p>
        <h1>나답게,<br />건강을 레벨업.</h1>
        <p className="intro-copy">몸의 변화를 숫자로 차분히 기록해요. 꾸준히 남긴 기록이 나만의 흐름이 됩니다.</p>
      </header>

      <ProgressionSummary profile={profile} />

      <section className="content-section" aria-labelledby="weight-heading">
        <div className="section-heading">
          <h2 id="weight-heading">몸무게</h2>
          <p className="section-note">BODY WEIGHT</p>
        </div>
        {measurementsQuery.isPending ? <p role="status" className="inline-status">기록을 불러오고 있어요…</p> : null}
        {measurementsQuery.isError ? (
          <div role="alert">
            <p className="inline-status inline-status--error">{errorMessage(measurementsQuery.error)}</p>
            <Button variant="quiet" onClick={() => void measurementsQuery.refetch()}>다시 불러오기</Button>
          </div>
        ) : null}
        {latestMeasurement ? (
          <p className="current-value">
            {formatWeight(latestMeasurement.value, profile.unitPreference)}
            <small>{profile.unitPreference === 'Imperial' ? 'lb' : 'kg'} · 최근 기록</small>
          </p>
        ) : measurementsQuery.isSuccess ? (
          <p className="inline-status">아직 기록이 없어요. 첫 측정값을 남겨 보세요.</p>
        ) : null}
        {measurementsQuery.isSuccess ? (
          <WeightRecorder
            key={profile.unitPreference}
            profile={profile}
            pending={saveMeasurement.isPending}
            onSave={(input) => saveMeasurement.mutateAsync(input)}
          />
        ) : null}
        {saveMeasurement.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(saveMeasurement.error)}</p> : null}
        {saveMeasurement.isSuccess ? (
          <p role="status" className="inline-status inline-status--success">
            측정값을 저장했어요. {saveMeasurement.data.measurement.xpAwarded ? '몸무게 XP +1을 얻었고 아바타에도 반영됐어요.' : '이번 기록에는 XP가 추가되지 않았어요.'}
          </p>
        ) : null}
        {measurementsQuery.isSuccess && measurements.length > 0 ? (
          <>
            <ul className="measurement-list" aria-label="최근 몸무게 기록">
              {measurements.slice(0, 5).map((measurement) => (
                <MeasurementRow key={measurement.id} measurement={measurement} unit={profile.unitPreference} />
              ))}
            </ul>
            {undoableMeasurement ? (
              <div className="undo-row">
                <p className="field-hint">되돌릴 기록 · {undoableMeasurement.localDate} · {formatWeight(undoableMeasurement.value, profile.unitPreference)} {profile.unitPreference === 'Imperial' ? 'lb' : 'kg'}</p>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={undoMeasurement.isPending}
                  onClick={() => undoMeasurement.mutate(undoableMeasurement.id)}
                  aria-label={`${undoableMeasurement.localDate} 몸무게 기록 되돌리기`}
                >
                  {undoMeasurement.isPending ? '되돌리는 중…' : '최근 저장 기록 되돌리기'}
                </Button>
              </div>
            ) : null}
            {undoMeasurement.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(undoMeasurement.error)}</p> : null}
            {undoMeasurement.isSuccess && !undoableMeasurement && !saveMeasurement.isPending && !saveMeasurement.isError ? <p role="status" className="inline-status inline-status--success">측정값과 해당 XP를 되돌려 레벨과 그래프를 다시 계산했어요. 이전 기록은 다시 되돌릴 수 없어요.</p> : null}
          </>
        ) : null}
      </section>

      <section className="content-section" aria-labelledby="goal-heading">
        <div className="section-heading">
          <h2 id="goal-heading">몸무게 목표</h2>
          <p className="section-note">NUMERIC GOAL</p>
        </div>
        {goalsQuery.isPending ? <p role="status" className="inline-status">목표를 불러오고 있어요…</p> : null}
        {goalsQuery.isError ? (
          <div role="alert">
            <p className="inline-status inline-status--error">{errorMessage(goalsQuery.error)}</p>
            <Button variant="quiet" onClick={() => void goalsQuery.refetch()}>다시 불러오기</Button>
          </div>
        ) : null}
        {goalsQuery.isSuccess ? (
          <>
            {activeGoal ? <GoalSummary goal={activeGoal} unit={profile.unitPreference} /> : <p className="inline-status">현재 설정된 몸무게 목표가 없어요.</p>}
            <GoalForm
              key={profile.unitPreference}
              unit={profile.unitPreference}
              pending={saveGoal.isPending}
              onSave={(goal) => saveGoal.mutateAsync(goal)}
            />
            {saveGoal.isError ? <p role="alert" className="inline-status inline-status--error">{errorMessage(saveGoal.error)}</p> : null}
            {saveGoal.isSuccess ? <p role="status" className="inline-status inline-status--success">목표를 저장했어요. 이전 몸무게 목표는 비활성화됐어요.</p> : null}
          </>
        ) : null}
      </section>

      <ProfileSettings
        profile={profile}
        pending={saveProfile.isPending}
        onSave={(nextProfile) => saveProfile.mutateAsync(nextProfile)}
        error={saveProfile.isError ? errorMessage(saveProfile.error) : null}
        saved={saveProfile.isSuccess}
      />
    </Shell>
  )
}

function ProgressionSummary({ profile }: { profile: HealthProfile }) {
  const [currentDay, setCurrentDay] = useState<{ timezone: string; date: string } | null>(null)
  useEffect(() => {
    const refresh = () => setCurrentDay({ timezone: profile.timezone, date: dateInTimezone(new Date(), profile.timezone) })
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [profile.timezone])

  const endDate = currentDay?.timezone === profile.timezone ? currentDay.date : undefined
  const progressionQuery = useQuery({
    queryKey: progressionQueryKey(profile.timezone, endDate ?? ''),
    queryFn: () => healthApi.getProgression(endDate),
    enabled: Boolean(endDate),
  })

  return (
    <section className="progression content-section" aria-labelledby="avatar-heading">
      <div className="section-heading">
        <h2 id="avatar-heading">아바타</h2>
        <p className="section-note">신체 지표 XP</p>
      </div>
      <p className="progression-scope">현재는 신체 지표 기록 XP만 반영해요. 운동·영양제 XP는 아직 연결되지 않았어요.</p>
      {!endDate || progressionQuery.isPending ? <p role="status" className="inline-status">성장 기록을 불러오고 있어요…</p> : null}
      {progressionQuery.isError ? (
        <div role="alert">
          <p className="inline-status inline-status--error">{errorMessage(progressionQuery.error)}</p>
          <Button variant="quiet" onClick={() => void progressionQuery.refetch()}>다시 불러오기</Button>
        </div>
      ) : null}
      {progressionQuery.isSuccess ? (
        <>
          <AvatarSummary avatar={progressionQuery.data.avatar} />
          <details className="progression-details">
            <summary>최근 14일 성장 기록</summary>
            <div className="chart-section">
              <WeightHistoryChart days={progressionQuery.data.days} unitPreference={profile.unitPreference} />
            </div>
            <div className="chart-section">
              {progressionQuery.data.avatar.xp === 0 ? <p className="inline-status">아직 XP 기록이 없어요.</p> : null}
              <XpHistoryChart days={progressionQuery.data.days} />
            </div>
            <details className="metric-progression">
              <summary>신체 지표별 XP</summary>
              <ul className="metric-progression-list">
                {progressionQuery.data.bodyMetrics.map((metric) => (
                  <li key={metric.metric}>
                    <span>{metricLabel(metric.metric)}</span>
                    <span>레벨 {metric.level} · {metric.xp} XP</span>
                  </li>
                ))}
              </ul>
            </details>
          </details>
        </>
      ) : null}
    </section>
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
        aria-label="다음 아바타 레벨까지의 XP 진행도"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={progress.xpIntoLevel}
        aria-valuetext={`레벨 ${avatar.level}, 총 ${avatar.xp} XP, 다음 레벨까지 ${progress.xpToNextLevel} XP`}
      >
        <span className="progress-line__fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="field-hint">다음 레벨까지 {progress.xpToNextLevel} XP</p>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <div className="site-header">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true" />나건렙</div>
        <span className="header-caption">기록은 가볍게, 변화는 꾸준히</span>
      </div>
      {children}
      <footer className="app-footer">
        <p>현재 MVP는 로그인 없이 공개되어 있어요. 배포 환경에서는 누구나 건강 기록을 조회·변경·삭제할 수 있으니 실제 데이터를 저장하기 전에 이 점을 꼭 확인해 주세요.</p>
        <p>건강 기록은 의료 진단이나 치료를 대신하지 않습니다.</p>
      </footer>
    </main>
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
        const displayValue = Number(inputValue)
        await onSave({
          metric: 'body_weight',
          value: canonicalWeight(displayValue, profile.unitPreference),
          recordedAt: dateTimeInZoneToIso(recordedAt, profile.timezone),
          timezone: profile.timezone,
        })
        const nextTime = formatDateTimeForZone(new Date(), profile.timezone)
        form.reset({ value: '', recordedAt: nextTime })
        draftInstant.current = dateTimeInZoneToIso(nextTime, profile.timezone)
      } catch {
        // The mutation owns and displays request errors; invalid local times are shown by field validation.
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
        onChange: ({ value }) => positiveNumberError(value, '측정값'),
        onSubmit: ({ value }) => positiveNumberError(value, '측정값'),
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
                placeholder={profile.unitPreference === 'Imperial' ? '예: 150' : '예: 68.5'}
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
            <FormField id="recorded-at" label="측정한 시간" hint={`기록 시간대: ${profile.timezone}`} error={error}>
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
                  catch { /* Keep the last valid instant rather than reinterpret an invalid draft after a timezone change. */ }
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'recorded-at-error' : 'recorded-at-hint'}
              />
            </FormField>
          )
        }}
      </form.Field>
      <Button type="submit" wide disabled={pending}>{pending ? '저장하는 중…' : '몸무게 저장'}</Button>
    </form>
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

function GoalSummary({ goal, unit }: { goal: HealthGoal; unit: UnitPreference }) {
  return (
    <p className="goal-summary">
      <strong>{formatWeight(goal.targetValue, unit)} {unit === 'Imperial' ? 'lb' : 'kg'}</strong>
      <span>목표 날짜 · {goal.targetDate}</span>
    </p>
  )
}

function GoalForm({
  unit,
  pending,
  onSave,
}: {
  unit: UnitPreference
  pending: boolean
  onSave: (goal: { metric: 'body_weight'; targetValue: number; targetDate: string }) => Promise<unknown>
}) {
  const form = useForm({
    defaultValues: { targetValue: '', targetDate: '' },
    onSubmit: async ({ value }) => {
      const { targetValue, targetDate } = value
      try {
        await onSave({
          metric: 'body_weight',
          targetValue: canonicalWeight(Number(targetValue), unit),
          targetDate,
        })
        form.reset({ targetValue: '', targetDate: '' })
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
        onChange: ({ value }) => positiveNumberError(value, '목표값'),
        onSubmit: ({ value }) => positiveNumberError(value, '목표값'),
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
                placeholder={unit === 'Imperial' ? '예: 140' : '예: 63'}
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
      <div>
        <Button type="submit" wide disabled={pending}>{pending ? '저장하는 중…' : '목표 저장'}</Button>
      </div>
      <p className="field-hint">새 목표를 저장하면 기존 몸무게 목표는 비활성화돼요.</p>
    </form>
  )
}

function ProfileSettings({
  profile,
  pending,
  onSave,
  error,
  saved,
}: {
  profile: HealthProfile
  pending: boolean
  onSave: (profile: ProfilePreferences) => Promise<unknown>
  error: string | null
  saved: boolean
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
    <details className="preferences">
      <summary>기록 설정</summary>
      <form className="preferences-grid" noValidate onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}>
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
              <FormField id="profile-timezone" label="시간대" hint="예: Asia/Seoul" error={error}>
                <TextInput
                  id="profile-timezone"
                  autoComplete="off"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'profile-timezone-error' : 'profile-timezone-hint'}
                />
              </FormField>
            )
          }}
        </form.Field>
        <div>
          <Button type="submit" variant="quiet" disabled={pending}>{pending ? '저장하는 중…' : '설정 저장'}</Button>
          {error ? <p role="alert" className="inline-status inline-status--error">{error}</p> : null}
          {saved ? <p role="status" className="inline-status inline-status--success">설정을 저장했어요.</p> : null}
        </div>
      </form>
    </details>
  )
}
