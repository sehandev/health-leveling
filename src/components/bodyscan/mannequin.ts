import { BufferGeometry, Float32BufferAttribute } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Muscle } from './muscles.ts'

type Ring = [y: number, x: number, z: number, width: number, depth: number]

// Rings run from head to foot so the visible edges follow the body rather than triangle diagonals.
export function createMannequin() {
  const positions: number[] = []
  const triangles: number[] = []
  const lines: number[] = []
  const neutralLines: number[] = []
  const regionTriangles: Partial<Record<Muscle, number[]>> = {}
  const sides = 12

  function surface(rings: Ring[], { legSide = 0, shoulder, torso = false, neutralRows = [] }: { legSide?: number, shoulder?: { boundary: number[], side: number }, torso?: boolean, neutralRows?: number[] } = {}) {
    const start = positions.length / 3
    for (const [row, [y, x, z, width, depth]] of rings.entries()) {
      for (let i = 0; i < sides; i++) {
        const angle = 2 * Math.PI * i / sides + (shoulder ? -shoulder.side * Math.PI / 2 : 0)
        const cosine = Math.cos(angle)
        const px = legSide && row === 0 ? legSide * Math.max(0, legSide * cosine) * .148 : x + width * cosine
        if (shoulder && row <= 1) {
          const index = shoulder.boundary[i] * 3
          positions.push(positions[index] + (row ? shoulder.side * .036 : 0), positions[index + 1] - (row ? .025 : 0), positions[index + 2] * (row ? .85 : 1))
        } else {
          const collarDip = torso && (row === 1 || row === 2) ? .014 * Math.max(0, Math.sin(angle)) : 0
          positions.push(px, y - collarDip, z + depth * Math.sin(angle))
        }
      }
    }
    function region(row: number, i: number): Muscle | undefined {
      if (row < 0 || row >= rings.length - 1) return undefined
      const angle = 2 * Math.PI * (i + .5) / sides + (shoulder ? -shoulder.side * Math.PI / 2 : 0)
      const front = Math.sin(angle) > 0
      let muscle: Muscle | undefined
      if (torso) {
        if (row >= 3 && row <= 5 && front) muscle = 'chest'
        else if (row >= 6 && row <= 8 && front && Math.abs(Math.cos(angle)) < .7) muscle = 'abs'
        else if (row >= 6 && row <= 9 && Math.abs(Math.cos(angle)) >= .7) muscle = 'oblique'
        else if (row >= 1 && row <= 3 && !front) muscle = 'traps'
        else if (row >= 4 && row <= 8 && !front) muscle = 'lat'
        else if (row >= 10 && !front) muscle = 'glute'
      } else if (shoulder) {
        if (row <= 2) muscle = 'shoulder'
        else if (row <= 5) muscle = front ? 'biceps' : 'triceps'
        else if (row <= 8) muscle = 'forearm'
      } else if (legSide) {
        if (row <= 4) muscle = front ? 'quad' : 'hamstring'
        else if (row >= 6 && row <= 9) muscle = 'calf'
      }
      return muscle
    }
    for (let row = 0; row < rings.length; row++) {
      for (let i = 0; i < sides; i++) {
        const a = start + row * sides + i
        const b = start + row * sides + (i + 1) % sides
        const hole = torso && (i === 11 || i === 0 || i === 5 || i === 6)
        const current = region(row, i)
        if (neutralRows.includes(row) && !current && !region(row - 1, i)) neutralLines.push(a, b)
        if (!(torso && row === 4 && hole) && current !== region(row - 1, i) && (current || region(row - 1, i))) lines.push(a, b)
        if (row < rings.length - 1) {
          const c = a + sides, d = b + sides
          if (!(torso && (row === 3 || row === 4) && hole)) {
            triangles.push(a, b, c, b, d, c)
            if (current) (regionTriangles[current] ??= []).push(a, b, c, b, d, c)
            if (current !== region(row, (i + sides - 1) % sides) && (current || region(row, (i + sides - 1) % sides))) lines.push(a, c)
          }
        }
      }
    }
    return start
  }

  surface([
    [1.00, 0, 0, .008, .008], [.985, 0, 0, .055, .047], [.95, 0, 0, .080, .064],
    [.90, 0, .003, .086, .070], [.84, 0, .005, .085, .068], [.79, 0, .006, .073, .059],
    [.765, 0, .005, .055, .045], [.74, 0, 0, .047, .044], [.713, 0, 0, .047, .042],
  ], { neutralRows: [6, 8] })
  const torso = surface([
    [.713, 0, 0, .047, .042], [.695, 0, .003, .095, .053], [.675, 0, .006, .158, .067],
    [.66, 0, .006, .186, .080], [.60, 0, .012, .179, .105], [.52, 0, .018, .172, .115],
    [.40, 0, .012, .158, .102], [.31, 0, .005, .143, .083], [.23, 0, 0, .125, .075],
    [.15, 0, .005, .139, .082], [.07, 0, .005, .158, .085], [0, 0, .003, .160, .086], [-.105, 0, 0, .148, .082],
  ], { torso: true, neutralRows: [0, 10, 12] })
  for (const side of [-1, 1]) {
    const arm = (y: number, x: number, width: number, depth: number): Ring => [y - .1 * Math.max(0, Math.min(1, (.46 - y) / .62)), side * x, 0, width, depth]
    const sector = side === 1 ? 11 : 5
    const vertex = (row: number, offset: number) => torso + row * sides + (sector + offset) % sides
    const boundary = [vertex(3, 0), vertex(3, 0), vertex(3, 1), vertex(3, 2), vertex(3, 2),
      vertex(4, 2), vertex(5, 2), vertex(5, 2), vertex(5, 1), vertex(5, 0), vertex(5, 0), vertex(4, 0)]
    surface([
      arm(.59, .18, .05, .06), arm(.56, .19, .05, .06), arm(.46, .215, .050, .056),
      arm(.38, .228, .046, .051), arm(.30, .246, .040, .045), arm(.24, .247, .038, .042), arm(.17, .250, .039, .044),
      arm(.10, .259, .035, .040), arm(.04, .265, .029, .033), arm(.005, .269, .025, .027),
      arm(-.035, .272, .029, .020), arm(-.09, .275, .027, .017), arm(-.125, .276, .021, .014),
      arm(-.14, .276, .010, .009),
    ], { shoulder: { boundary, side }, neutralRows: [10, 13] })
    surface([
      arm(-.025, .295, .010, .012), arm(-.055, .305, .009, .010), arm(-.085, .307, .005, .007),
    ])
    for (let finger = 0; finger < 4; finger++) {
      const x = .262 + finger * .010
      surface([arm(-.115, x, .0055, .009), arm(-.15 + Math.abs(finger - 1.5) * .005, x, .005, .007), arm(-.158 + Math.abs(finger - 1.5) * .005, x, .002, .004)])
    }
    const leg = (y: number, x: number, z: number, width: number, depth: number): Ring => [y, side * x, z, width, depth]
    surface([
      leg(-.105, .074, 0, .074, .082), leg(-.17, .075, 0, .075, .079),
      leg(-.25, .088, 0, .075, .076), leg(-.33, .090, 0, .068, .069),
      leg(-.38, .092, 0, .060, .061), leg(-.415, .093, 0, .055, .056),
      leg(-.47, .094, -.002, .057, .057), leg(-.54, .094, -.004, .061, .063),
      leg(-.64, .094, -.005, .057, .061), leg(-.75, .094, -.004, .047, .052),
      leg(-.89, .094, 0, .034, .037), leg(-.925, .094, .015, .038, .050),
      leg(-.96, .094, .045, .044, .085), leg(-.985, .094, .065, .048, .120),
      leg(-.99, .094, .065, .045, .115),
    ], { legSide: side, neutralRows: [11, 14] })
  }
  const raw = new BufferGeometry()
  raw.setAttribute('position', new Float32BufferAttribute(positions, 3))
  raw.setIndex(triangles)
  const geometry = mergeVertices(raw)
  raw.dispose()
  geometry.computeVertexNormals()
  // shortcut: outline width varies with viewport size, use screen-space strokes if consistency becomes necessary.
  const outline = geometry.clone()
  const outlinePosition = outline.getAttribute('position')
  const normal = outline.getAttribute('normal')
  for (let i = 0; i < outlinePosition.count; i++) {
    outlinePosition.setXYZ(i, outlinePosition.getX(i) + normal.getX(i) * .004, outlinePosition.getY(i) + normal.getY(i) * .004, outlinePosition.getZ(i) + normal.getZ(i) * .004)
  }
  const segmentKey = (a: number, b: number) => {
    const point = (index: number) => positions.slice(index * 3, index * 3 + 3).map(value => Math.round(value * 10000)).join(',')
    return [point(a), point(b)].sort().join(':')
  }
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i += 2) seen.add(segmentKey(lines[i], lines[i + 1]))
  const neutralOnly: number[] = []
  for (let i = 0; i < neutralLines.length; i += 2) {
    const key = segmentKey(neutralLines[i], neutralLines[i + 1])
    if (!seen.has(key)) { seen.add(key); neutralOnly.push(neutralLines[i], neutralLines[i + 1]) }
  }
  const neutralEdges = new BufferGeometry()
  neutralEdges.setAttribute('position', new Float32BufferAttribute(positions, 3))
  neutralEdges.setIndex(neutralOnly)
  const edges = new BufferGeometry()
  edges.setAttribute('position', new Float32BufferAttribute(positions, 3))
  edges.setIndex(lines)
  const regions = Object.entries(regionTriangles).map(([id, indices]) => {
    const patch = new BufferGeometry()
    patch.setAttribute('position', new Float32BufferAttribute(positions, 3))
    patch.setIndex(indices)
    return { id: id as Muscle, geometry: patch }
  })
  return { geometry, outline, edges, neutralEdges, regions }
}
