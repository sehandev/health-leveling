import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildProgressionSnapshot, type MuscleXpEvent } from '../../domain/progression-view.ts'
import { MUSCLE_GROUPS } from '../../domain/workouts.ts'
import { muscleStatuses } from './muscle-status.ts'

test('status cards use each existing XP group exactly once without changing level or XP', () => {
  const events: MuscleXpEvent[] = Array.from({ length: 11 }, (_, i) => ({
    id: `event-${i}`, workoutId: 'workout', itemId: `item-${i}`, group: 'Chest', delta: 1,
    localDate: '2024-11-10', occurredAt: `2024-11-10T12:00:${String(i).padStart(2, '0')}Z`, sequence: i,
  }))
  const snapshot = buildProgressionSnapshot([], [], '2024-11-10', events)
  const statuses = muscleStatuses(snapshot.muscles)
  assert.deepEqual(statuses.map(status => status.group).sort(), [...MUSCLE_GROUPS].sort())
  assert.equal(new Set(statuses.map(status => status.group)).size, MUSCLE_GROUPS.length)
  for (const status of statuses) {
    const source = snapshot.muscles.find(muscle => muscle.group === status.group)!
    assert.deepEqual([status.level, status.xp], [source.level, source.xp])
  }
  const chest = statuses.find(status => status.group === 'Chest')
  assert.deepEqual([chest?.level, chest?.xp], [2, 11])
  assert.equal(snapshot.avatar.xp, 11)
})

test('back and core keep one progression status each without splitting into smaller muscles', () => {
  assert.deepEqual(muscleStatuses([]), [])
  assert.deepEqual(muscleStatuses([
    { group: 'Core', level: 2, xp: 12 },
    { group: 'Back', level: 3, xp: 21 },
  ]).map(({ group, label, level, xp }) => ({ group, label, level, xp })), [
    { group: 'Core', label: '코어', level: 2, xp: 12 },
    { group: 'Back', label: '등', level: 3, xp: 21 },
  ])
})

test('forearms show the existing progression value, starting at level one and zero XP', () => {
  const empty = buildProgressionSnapshot([], [], '2024-11-10')
  const initial = muscleStatuses(empty.muscles).find(status => status.group === 'Forearms')
  assert.deepEqual(initial && [initial.label, initial.level, initial.xp], ['전완', 1, 0])
  const event: MuscleXpEvent = { id: 'forearm', workoutId: 'workout', itemId: 'item', group: 'Forearms', delta: 1, localDate: '2024-11-10', occurredAt: '2024-11-10T12:00:00Z', sequence: 1 }
  const snapshot = buildProgressionSnapshot([], [], '2024-11-10', [event])
  const status = muscleStatuses(snapshot.muscles).find(item => item.group === 'Forearms')
  assert.deepEqual(status && [status.level, status.xp], [1, 1])
  assert.equal(snapshot.avatar.xp, 1)
})
