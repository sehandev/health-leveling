import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjacentMuscle, muscleRegions } from './muscles.ts'

test('keyboard selection starts at either end and wraps in both directions', () => {
  const first = muscleRegions[0].id
  const last = muscleRegions.at(-1)!.id
  assert.equal(adjacentMuscle(null, 1), first)
  assert.equal(adjacentMuscle(null, -1), last)
  assert.equal(adjacentMuscle(last, 1), first)
  assert.equal(adjacentMuscle(first, -1), last)
  assert.equal(adjacentMuscle(first, 1), muscleRegions[1].id)
})
