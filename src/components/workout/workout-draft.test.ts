import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStrengthWorkoutDraft } from '../../domain/workout-records.ts'
import { canonicalWeight, formatDateTimeForZone } from '../../lib/health-time.ts'
import { buildStrengthWorkoutDraft, FUTURE_WORKOUT_TIME_ERROR, moveWorkoutItem, workoutRecordedAtToIso, type WorkoutEditorValues } from './workout-draft.ts'

const TEST_NOW = new Date('2026-11-13T00:30:00.000Z')
const values = (overrides: Partial<WorkoutEditorValues> = {}): WorkoutEditorValues => ({
  recordedAt: '2026-11-12T19:30', place: '', note: '',
  items: [{
    id: 'stable-id', name: 'Push-up', source: 'curated', mode: 'Bodyweight', targetMuscles: ['Chest'],
    sets: [{ reps: '', load: '', originalLoadKg: null }],
  }],
  ...overrides,
})

test('draft conversion keeps empty bodyweight load and blank optional fields unrecorded', () => {
  assert.deepEqual(buildStrengthWorkoutDraft(values({ place: '  ', note: '\n' }), 'Asia/Seoul', 'Metric', TEST_NOW), {
    type: 'Strength Training', recordedAt: '2026-11-12T10:30:00.000Z', timezone: 'Asia/Seoul', place: '', note: '',
    items: [{ id: 'stable-id', name: 'Push-up', source: 'curated', mode: 'Bodyweight', targetMuscles: ['Chest'], sets: [{ reps: null, loadKg: null }] }],
  })
})

test('imperial display conversion preserves untouched canonical load and converts edited values', () => {
  const untouched = values({ items: [{
    id: 'stable-id', name: 'Chest Press', source: 'curated', mode: 'Machine', targetMuscles: ['Chest'],
    sets: [{ reps: '8', load: '22', originalLoadKg: 10 }],
  }] })
  assert.equal(buildStrengthWorkoutDraft(untouched, 'UTC', 'Imperial', TEST_NOW).items[0].sets[0].loadKg, 10)
  const changed = values({ items: [{ ...untouched.items[0], sets: [{ reps: '8', load: '23', originalLoadKg: 10 }] }] })
  assert.equal(buildStrengthWorkoutDraft(changed, 'UTC', 'Imperial', TEST_NOW).items[0].sets[0].loadKg, canonicalWeight(23, 'Imperial'))
})

test('draft conversion validates required workout items and actual repetitions', () => {
  assert.throws(() => buildStrengthWorkoutDraft(values({ items: [] }), 'UTC', 'Metric', TEST_NOW), /between 1 and/)
  const badReps = values({ items: [{ ...values().items[0], name: 'Chest Press', mode: 'Machine', sets: [{ reps: '1.5', load: '', originalLoadKg: null }] }] })
  assert.throws(() => buildStrengthWorkoutDraft(badReps, 'UTC', 'Metric', TEST_NOW), /non-negative safe integer/)
})

test('future Workout instants are rejected while past and current minutes pass in IANA zones', () => {
  const now = new Date('2026-11-12T00:30:00.000Z')
  for (const timezone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Europe/Berlin']) {
    const past = formatDateTimeForZone(new Date(now.getTime() - 60_000), timezone)
    const current = formatDateTimeForZone(now, timezone)
    const future = formatDateTimeForZone(new Date(now.getTime() + 60_000), timezone)
    assert.equal(workoutRecordedAtToIso(past, timezone, now), new Date(now.getTime() - 60_000).toISOString(), timezone)
    assert.equal(workoutRecordedAtToIso(current, timezone, now), now.toISOString(), timezone)
    assert.throws(() => workoutRecordedAtToIso(future, timezone, now), (error: unknown) => error instanceof RangeError && error.message === FUTURE_WORKOUT_TIME_ERROR, timezone)
  }
})

test('future draft rejection preserves entered values and legacy future records still parse', () => {
  const futureValues = values({ recordedAt: '2026-11-13T00:31' })
  const before = structuredClone(futureValues)
  assert.throws(
    () => buildStrengthWorkoutDraft(futureValues, 'UTC', 'Metric', new Date('2026-11-12T00:30:00.000Z')),
    (error: unknown) => error instanceof RangeError && error.message === FUTURE_WORKOUT_TIME_ERROR,
  )
  assert.deepEqual(futureValues, before)

  const legacyDraft = {
    ...buildStrengthWorkoutDraft(values({ recordedAt: '2026-11-12T00:30' }), 'UTC', 'Metric', TEST_NOW),
    recordedAt: '2030-01-01T00:00:00.000Z',
  }
  assert.equal(parseStrengthWorkoutDraft(legacyDraft).recordedAt, legacyDraft.recordedAt)
})

test('invalid and nonexistent local times keep their existing validation errors', () => {
  assert.throws(() => workoutRecordedAtToIso('2026-02-30T12:00', 'UTC', TEST_NOW), /날짜와 시간을 확인해 주세요/)
  assert.throws(() => workoutRecordedAtToIso('2026-03-08T02:30', 'America/New_York', TEST_NOW), /존재하지 않는 시각/)
})

test('reordering preserves item identity while changing only list order', () => {
  const source = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  const reordered = moveWorkoutItem(source, 0, 2)
  assert.deepEqual(reordered.map(({ id }) => id), ['two', 'three', 'one'])
  assert.deepEqual(source.map(({ id }) => id), ['one', 'two', 'three'])
})
