import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalWeight, dateInTimezone, dateTimeInZoneToIso, displayWeight, formatDateTimeForZone } from './health-time.ts'

test('converts a recorded local time using its IANA timezone', () => {
  assert.equal(dateTimeInZoneToIso('2026-11-12T09:30', 'Asia/Seoul'), '2026-11-12T00:30:00.000Z')
})

test('formats an instant in the selected timezone', () => {
  assert.equal(formatDateTimeForZone(new Date('2026-11-12T00:30:00.000Z'), 'Asia/Seoul'), '2026-11-12T09:30')
})

test('computes the progression day in the profile timezone across UTC midnight', () => {
  assert.equal(dateInTimezone(new Date('2026-11-12T01:00:00.000Z'), 'America/Los_Angeles'), '2026-11-11')
})

test('keeps a recording-time draft instant stable when its profile timezone changes', () => {
  const instant = dateTimeInZoneToIso('2026-11-12T10:00', 'Asia/Seoul')
  assert.equal(formatDateTimeForZone(new Date(instant), 'UTC'), '2026-11-12T01:00')
})

test('rejects a local time skipped by the spring daylight-saving transition', () => {
  assert.throws(() => dateTimeInZoneToIso('2026-03-08T02:30', 'America/New_York'), /존재하지 않는 시각/)
})

test('converts imperial weight display values to canonical kilograms', () => {
  const kg = canonicalWeight(150, 'Imperial')
  assert.ok(Math.abs(kg - 68.0388555) < 1e-7)
  assert.ok(Math.abs(displayWeight(kg, 'Imperial') - 150) < 1e-9)
})
