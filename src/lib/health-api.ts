import type { ProgressionSnapshot } from '../domain/progression-view'

export type UnitPreference = 'Metric' | 'Imperial'
export type HealthMetric = 'body_weight' | 'body_fat_percentage' | 'skeletal_muscle_mass'

export type HealthProfile = {
  unitPreference: UnitPreference
  timezone: string
  initialized: boolean
}

export type ProfilePreferences = Pick<HealthProfile, 'unitPreference' | 'timezone'>

export type HealthMeasurement = {
  id: string
  metric: HealthMetric
  value: number
  recordedAt: string
  timezone: string
  localDate: string
  canUndo: boolean
  xpAwarded: boolean
}

export type HealthGoal = {
  id: string
  metric: HealthMetric
  targetValue: number
  targetDate: string
  active: boolean
  activatedAt: string
}

type MeasurementsResponse = { measurements: HealthMeasurement[] }
type MeasurementResponse = { measurement: HealthMeasurement }
type GoalsResponse = { goals: HealthGoal[] }
type GoalResponse = { goal: HealthGoal }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new Error('서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
    throw new Error(message)
  }
  return body as T
}

function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function getUndoableMeasurement(measurements: readonly HealthMeasurement[]) {
  return measurements.find((measurement) => measurement.canUndo)
}

export const healthApi = {
  getProfile: () => request<HealthProfile>('/api/health/profile'),
  updateProfile: (profile: ProfilePreferences) =>
    request<HealthProfile>('/api/health/profile', jsonRequest('PUT', profile)),
  getBodyWeightMeasurements: () =>
    request<MeasurementsResponse>('/api/health/measurements?metric=body_weight'),
  getProgression: (endDate?: string) =>
    request<ProgressionSnapshot>(`/api/health/progression${endDate ? `?endDate=${encodeURIComponent(endDate)}` : ''}`),
  createMeasurement: (measurement: {
    metric: 'body_weight'
    value: number
    recordedAt: string
    timezone: string
  }) => request<MeasurementResponse>('/api/health/measurements', jsonRequest('POST', measurement)),
  undoMeasurement: (id: string) =>
    request<{ ok: true }>(`/api/health/measurements/${encodeURIComponent(id)}/undo`, jsonRequest('POST', {})),
  getGoals: () => request<GoalsResponse>('/api/health/goals'),
  createBodyWeightGoal: (goal: {
    metric: 'body_weight'
    targetValue: number
    targetDate: string
  }) => request<GoalResponse>('/api/health/goals', jsonRequest('POST', goal)),
}

export async function loadProfile() {
  const profile = await healthApi.getProfile()
  if (typeof window === 'undefined' || profile.initialized) return profile

  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return deviceTimezone
    ? healthApi.updateProfile({ unitPreference: profile.unitPreference, timezone: deviceTimezone })
    : profile
}
