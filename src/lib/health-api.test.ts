import assert from 'node:assert/strict'
import test from 'node:test'
import { getUndoableMeasurement, healthApi, type HealthMeasurement } from './health-api.ts'

test('undo selection follows the latest saved capability, not recording-time sort order', () => {
  const measurements: HealthMeasurement[] = [
    {
      id: 'newer-recorded-time', metric: 'body_weight', value: 70,
      recordedAt: '2026-11-12T00:00:00.000Z', timezone: 'UTC', localDate: '2026-11-12', canUndo: false, xpAwarded: false,
    },
    {
      id: 'latest-saved-backdated', metric: 'body_weight', value: 71,
      recordedAt: '2026-11-10T00:00:00.000Z', timezone: 'UTC', localDate: '2026-11-10', canUndo: true, xpAwarded: true,
    },
  ]

  assert.equal(getUndoableMeasurement(measurements)?.id, 'latest-saved-backdated')
})

test('progression API uses the supplied local end date and preserves server data', async () => {
  const originalFetch = globalThis.fetch
  const snapshot = {
    avatar: { xp: 1, level: 1 },
    bodyMetrics: [{ metric: 'body_weight' as const, xp: 1, level: 1 }],
    days: [{ date: '2026-11-12', bodyWeightKg: 68.5, xp: 1, level: 1 }],
  }
  let requestedUrl = ''
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    assert.deepEqual(await healthApi.getProgression('2026-11-12'), snapshot)
    assert.equal(requestedUrl, '/api/health/progression?endDate=2026-11-12')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('progression API failures stay errors instead of becoming a zero-XP snapshot', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Health data storage is unavailable.' }), { status: 503 })
  try {
    await assert.rejects(healthApi.getProgression('2026-11-12'), /Health data storage is unavailable/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
