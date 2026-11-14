import type {
  CustomWorkoutUsage,
  StrengthWorkoutDraft,
  StrengthWorkoutRecord,
  WorkoutPickerState,
} from '../domain/workout-records'

type WorkoutListResponse = { workouts: StrengthWorkoutRecord[] }
type WorkoutResponse = { workout: StrengthWorkoutRecord }
type WorkoutMutationResponse = WorkoutResponse & { xpChange: { added: number; cancelled: number } }
type PickerUsageResponse = { usage: CustomWorkoutUsage }

export class WorkoutApiError extends Error {
  readonly status: number
  readonly serverMessage: string

  constructor(message: string, status: number, serverMessage = message) {
    super(message)
    this.name = 'WorkoutApiError'
    this.status = status
    this.serverMessage = serverMessage
  }
}

function displayErrorMessage(status: number, serverMessage: string) {
  if (status === 409 && serverMessage.includes('version is stale')) return '기록이 변경되어 저장하지 않았어요. 최신 기록을 다시 열어 주세요.'
  if (status === 409 && serverMessage.includes('correction would')) return '진행 기록과 충돌해 저장하지 않았어요.'
  if (status === 409) return '데이터가 변경되어 요청하지 못했어요. 다시 시도해 주세요.'
  if (status === 404) return '기록을 찾을 수 없어요.'
  if (status === 400 || status === 413 || status === 415) return '입력 내용을 확인해 주세요.'
  if (status >= 500) return '서버에서 요청을 처리하지 못했어요. 다시 시도해 주세요.'
  return serverMessage
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { cache: 'no-store', ...init })
  } catch {
    throw new WorkoutApiError('서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.', 0)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
    throw new WorkoutApiError(displayErrorMessage(response.status, message), response.status, message)
  }
  return body as T
}

function jsonRequest(method: 'POST' | 'PUT' | 'DELETE', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const workoutApi = {
  getWorkouts: () => request<WorkoutListResponse>('/api/health/workouts'),
  getWorkout: (id: string) => request<WorkoutResponse>(`/api/health/workouts/${encodeURIComponent(id)}`),
  createWorkout: (draft: StrengthWorkoutDraft, idempotencyKey: string) =>
    request<WorkoutMutationResponse>('/api/health/workouts', {
      ...jsonRequest('POST', draft),
      headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    }),
  updateWorkout: (id: string, draft: StrengthWorkoutDraft, expectedVersion: number) =>
    request<WorkoutMutationResponse>(
      `/api/health/workouts/${encodeURIComponent(id)}`,
      jsonRequest('PUT', { ...draft, expectedVersion }),
    ),
  deleteWorkout: (id: string, expectedVersion: number) =>
    request<{ ok: true; xpChange: { added: number; cancelled: number } }>(
      `/api/health/workouts/${encodeURIComponent(id)}`,
      jsonRequest('DELETE', { expectedVersion }),
    ),
  getWorkoutPicker: () => request<WorkoutPickerState>('/api/health/workout-picker'),
  addCustomUsage: (usage: { usageId: string; mode: StrengthWorkoutDraft['items'][number]['mode']; name: string }) =>
    request<PickerUsageResponse>('/api/health/workout-picker/usages', jsonRequest('POST', usage)),
}
