import assert from 'node:assert/strict'
import test from 'node:test'
import { workoutApi, WorkoutApiError } from './workout-api.ts'
import type { StrengthWorkoutDraft, StrengthWorkoutRecord, WorkoutPickerState } from '../domain/workout-records.ts'

const draft: StrengthWorkoutDraft = {
  type: 'Strength Training',
  recordedAt: '2026-11-12T10:30:00.000Z',
  timezone: 'Asia/Seoul',
  place: '',
  note: '',
  items: [{
    id: 'item-1', name: 'Chest Press', source: 'curated', mode: 'Machine', targetMuscles: ['Chest'],
    sets: [{ reps: 8, loadKg: null }],
  }],
}
const record: StrengthWorkoutRecord = {
  ...draft, id: 'workout 1', version: 3, localDate: '2026-11-12',
  createdAt: '2026-11-12T10:31:00.000Z', updatedAt: '2026-11-12T10:31:00.000Z',
}

function withFetch<T>(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, run: () => Promise<T>) {
  const original = globalThis.fetch
  globalThis.fetch = handler as typeof fetch
  return run().finally(() => { globalThis.fetch = original })
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

test('workout list and detail use no-store GETs and encode path IDs', async () => {
  const calls: { url: string; method: string; cache: RequestCache | undefined }[] = []
  await withFetch(async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', cache: init?.cache })
    return String(input).endsWith('/workouts') ? jsonResponse({ workouts: [record] }) : jsonResponse({ workout: record })
  }, async () => {
    assert.deepEqual(await workoutApi.getWorkouts(), { workouts: [record] })
    assert.deepEqual(await workoutApi.getWorkout('workout 1'), { workout: record })
  })
  assert.deepEqual(calls, [
    { url: '/api/health/workouts', method: 'GET', cache: 'no-store' },
    { url: '/api/health/workouts/workout%201', method: 'GET', cache: 'no-store' },
  ])
})

test('create, update, and delete send exact JSON mutations and preserve CAS version', async () => {
  const calls: { url: string; method: string; body: unknown; contentType: string | null; idempotencyKey: string | null }[] = []
  await withFetch(async (input, init) => {
    calls.push({
      url: String(input), method: init?.method ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : null,
      contentType: new Headers(init?.headers).get('content-type'),
      idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
    })
    return init?.method === 'DELETE' ? jsonResponse({ ok: true, xpChange: { added: 0, cancelled: 1 } })
      : jsonResponse({ workout: record, xpChange: { added: 1, cancelled: 0 } })
  }, async () => {
    assert.equal((await workoutApi.createWorkout(draft, 'a0fda400-2b60-4fe9-8141-dfe3dd1983f1')).workout.id, record.id)
    assert.equal((await workoutApi.updateWorkout(record.id, draft, 3)).xpChange.added, 1)
    assert.deepEqual(await workoutApi.deleteWorkout(record.id, 4), { ok: true, xpChange: { added: 0, cancelled: 1 } })
  })
  assert.deepEqual(calls, [
    { url: '/api/health/workouts', method: 'POST', body: draft, contentType: 'application/json', idempotencyKey: 'a0fda400-2b60-4fe9-8141-dfe3dd1983f1' },
    { url: '/api/health/workouts/workout%201', method: 'PUT', body: { ...draft, expectedVersion: 3 }, contentType: 'application/json', idempotencyKey: null },
    { url: '/api/health/workouts/workout%201', method: 'DELETE', body: { expectedVersion: 4 }, contentType: 'application/json', idempotencyKey: null },
  ])
})

test('a lost create response can be retried with the same action idempotency key', async () => {
  const key = '325ca870-0907-4cde-bba2-1acec38408c0'
  const seenKeys: string[] = []
  let attempts = 0
  await withFetch(async (_input, init) => {
    seenKeys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '')
    assert.deepEqual(JSON.parse(String(init?.body)), draft)
    attempts += 1
    if (attempts === 1) throw new TypeError('response lost after commit')
    return jsonResponse({ workout: record, xpChange: { added: 1, cancelled: 0 } })
  }, async () => {
    await assert.rejects(workoutApi.createWorkout(draft, key), (error: unknown) => error instanceof WorkoutApiError && error.status === 0)
    assert.equal((await workoutApi.createWorkout(draft, key)).workout.id, record.id)
  })
  assert.deepEqual(seenKeys, [key, key])
})

test('picker reads derived state and explicit additions post an idempotency UUID', async () => {
  const picker: WorkoutPickerState = { usages: [], selections: [] }
  const calls: { url: string; method: string; body: unknown }[] = []
  await withFetch(async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    return init?.method ? jsonResponse({ usage: { id: 'usage-1', mode: 'Machine', name: 'Exact name ', addedAt: '2026-11-12T10:30:00.000Z', sequence: 1 } }) : jsonResponse(picker)
  }, async () => {
    assert.deepEqual(await workoutApi.getWorkoutPicker(), picker)
    assert.equal((await workoutApi.addCustomUsage({ usageId: 'attempt-1', mode: 'Machine', name: 'Exact name ' })).usage.name, 'Exact name ')
  })
  assert.deepEqual(calls, [
    { url: '/api/health/workout-picker', method: 'GET', body: null },
    { url: '/api/health/workout-picker/usages', method: 'POST', body: { usageId: 'attempt-1', mode: 'Machine', name: 'Exact name ' } },
  ])
})

test('API errors retain HTTP status and server messages; transport failures remain errors', async () => {
  await withFetch(async () => jsonResponse({ error: 'Workout version is stale.' }, 409), async () => {
    await assert.rejects(workoutApi.updateWorkout(record.id, draft, 2), (error: unknown) => {
      assert.ok(error instanceof WorkoutApiError)
      assert.equal(error.status, 409)
      assert.equal(error.message, '기록이 변경되어 저장하지 않았어요. 최신 기록을 다시 열어 주세요.')
      assert.equal(error.serverMessage, 'Workout version is stale.')
      return true
    })
  })
  await withFetch(async () => new Response('bad json', { status: 503 }), async () => {
    await assert.rejects(workoutApi.getWorkouts(), (error: unknown) => error instanceof WorkoutApiError && error.status === 503)
  })
  await withFetch(async () => { throw new Error('private transport detail') }, async () => {
    await assert.rejects(workoutApi.getWorkoutPicker(), (error: unknown) => error instanceof WorkoutApiError && error.status === 0 && !error.message.includes('private'))
  })
})
