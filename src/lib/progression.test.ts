import assert from 'node:assert/strict'
import test from 'node:test'
import { progressionQueryKey, xpProgress } from './progression.ts'

test('progression cache identity includes timezone and local end date', () => {
  assert.deepEqual(progressionQueryKey('Asia/Seoul', '2026-11-12'), [
    'health', 'progression', 'Asia/Seoul', '2026-11-12',
  ])
  assert.notDeepEqual(progressionQueryKey('UTC', '2026-11-12'), progressionQueryKey('Asia/Seoul', '2026-11-12'))
  assert.notDeepEqual(progressionQueryKey('Asia/Seoul', '2026-11-13'), progressionQueryKey('Asia/Seoul', '2026-11-12'))
})

test('Avatar progress uses actual XP within the fixed ten-XP level threshold', () => {
  assert.deepEqual(xpProgress(0), { xpIntoLevel: 0, percent: 0, xpToNextLevel: 10 })
  assert.deepEqual(xpProgress(19), { xpIntoLevel: 9, percent: 90, xpToNextLevel: 1 })
  assert.deepEqual(xpProgress(20), { xpIntoLevel: 0, percent: 0, xpToNextLevel: 10 })
})
