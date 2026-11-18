import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMannequin } from './mannequin.ts'

test('mannequin has finite surfaces and quad edges spanning head to feet', () => {
  const { geometry, edges } = createMannequin()
  const positions = geometry.getAttribute('position')
  assert.ok(positions.count > 0)
  assert.ok(Array.from(positions.array).every(Number.isFinite))
  assert.equal(geometry.index!.count % 6, 0)
  assert.equal(edges.index!.count % 2, 0)
  geometry.computeBoundingBox()
  assert.ok(geometry.boundingBox!.max.y >= .99)
  assert.ok(geometry.boundingBox!.min.y <= -.98)
  geometry.dispose()
  edges.dispose()
})

test('arms and legs share vertices with the torso', () => {
  const { geometry, edges } = createMannequin()
  const positions = geometry.getAttribute('position')
  const index = geometry.index!
  const neighbours = Array.from({ length: positions.count }, () => new Set<number>())
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    for (const a of vertices) for (const b of vertices) neighbours[a].add(b)
  }
  const torso = Array.from({ length: positions.count }, (_, i) => i)
    .find(i => Math.abs(positions.getX(i) - .125) < .001 && Math.abs(positions.getY(i) - .23) < .001)!
  assert.notEqual(torso, undefined)
  const connected = new Set([torso])
  const queue = [torso]
  for (const i of queue) for (const next of neighbours[i]) if (!connected.has(next)) {
    connected.add(next)
    queue.push(next)
  }
  for (const side of [-1, 1]) {
    assert.ok([...connected].some(i => positions.getX(i) * side > .21 && positions.getY(i) > .25 && positions.getY(i) < .35))
    assert.ok([...connected].some(i => positions.getX(i) * side > .1 && positions.getY(i) < -.35))
  }
  geometry.dispose()
  edges.dispose()
})

test('shoulders and calves retain their intended proportions', () => {
  const { geometry, edges } = createMannequin()
  const p = geometry.getAttribute('position')
  const width = (y: number) => {
    const xs = Array.from({ length: p.count }, (_, i) => i)
      .filter(i => Math.abs(p.getY(i) - y) < .001).map(i => p.getX(i))
    return Math.max(...xs) - Math.min(...xs)
  }
  assert.ok(width(.66) > width(.23) * 1.4)
  assert.ok(width(-.54) > width(-.89))
  geometry.dispose()
  edges.dispose()
})

test('each XP group covers both sides with one selectable region', async () => {
  const { muscleRegions } = await import('./muscles.ts')
  const { geometry, edges, regions } = createMannequin()
  assert.deepEqual(regions.map(region => region.id).sort(), muscleRegions.map(region => region.id).sort())
  const averageZ = (id: string) => {
    const region = regions.find(item => item.id === id)!.geometry
    const p = region.getAttribute('position'), indices = region.index!
    return Array.from({ length: indices.count }, (_, i) => p.getZ(indices.getX(i))).reduce((a, b) => a + b, 0) / indices.count
  }
  assert.ok(averageZ('Chest') > 0)
  assert.ok(averageZ('Back') < 0)
  assert.ok(averageZ('Quadriceps') > 0)
  assert.ok(averageZ('Hamstrings') < 0)
  const yExtent = (id: string) => {
    const region = regions.find(item => item.id === id)!.geometry
    const p = region.getAttribute('position'), indices = region.index!
    const ys = Array.from({ length: indices.count }, (_, i) => p.getY(indices.getX(i)))
    return { min: Math.min(...ys), max: Math.max(...ys) }
  }
  assert.ok(yExtent('Back').max > .65 && yExtent('Back').min < .2)
  assert.ok(yExtent('Core').max > .35 && yExtent('Core').min < .1)
  for (const region of regions) {
    assert.ok(region.geometry.index!.count >= 6)
    assert.equal(region.geometry.index!.count % 6, 0)
    const vertices = region.geometry.getAttribute('position'), indices = region.geometry.index!
    const xs = Array.from({ length: indices.count }, (_, i) => vertices.getX(indices.getX(i)))
    assert.ok(Math.min(...xs) < -.01 && Math.max(...xs) > .01, `${region.id} must cover both sides`)
    region.geometry.dispose()
  }
  geometry.dispose()
  edges.dispose()
})

test('neutral outlines cover non-muscle parts without duplicating muscle edges', () => {
  const { geometry, outline, edges, neutralEdges, regions } = createMannequin()
  const neutral = neutralEdges.index!, muscle = edges.index!
  const positions = neutralEdges.getAttribute('position')
  const edgeKeys = (index: typeof neutral) => new Set(Array.from({ length: index.count / 2 }, (_, i) => {
    const point = (n: number) => [positions.getX(n), positions.getY(n), positions.getZ(n)].map(value => Math.round(value * 10000)).join(',')
    return [point(index.getX(i * 2)), point(index.getX(i * 2 + 1))].sort().join(':')
  }))
  const muscleKeys = edgeKeys(muscle)
  for (const key of edgeKeys(neutral)) assert.ok(!muscleKeys.has(key))
  const hasY = (y: number) => Array.from({ length: neutral.count }, (_, i) => positions.getY(neutral.getX(i))).some(value => Math.abs(value - y) < .001)
  assert.ok(hasY(.765))
  assert.ok(hasY(-.925))
  assert.equal(outline.getAttribute('position').count, geometry.getAttribute('position').count)
  assert.ok(Array.from(outline.getAttribute('position').array).every(Number.isFinite))
  geometry.dispose(); outline.dispose(); edges.dispose(); neutralEdges.dispose()
  regions.forEach(region => region.geometry.dispose())
})
