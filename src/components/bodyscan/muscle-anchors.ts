import { Vector3, type Camera, type Object3D } from 'three'
import type { MuscleGroup } from '../../domain/workouts.ts'

type Anchor = { x: number; y: number; z: number; edge: number; face: -1 | 0 | 1 }

// shortcut: anchors approximate the procedural mesh; update them when its proportions change.
const anchors: Record<MuscleGroup, Anchor> = {
  Shoulders: { x: .20, y: .59, z: 0, edge: .21, face: 0 },
  Chest: { x: .09, y: .55, z: .12, edge: .18, face: 1 },
  Biceps: { x: .23, y: .34, z: .045, edge: .27, face: 1 },
  Triceps: { x: .23, y: .34, z: -.045, edge: .27, face: -1 },
  Forearms: { x: .265, y: .10, z: 0, edge: .285, face: 0 },
  Core: { x: .07, y: .30, z: .08, edge: .14, face: 1 },
  Back: { x: .10, y: .49, z: -.09, edge: .17, face: -1 },
  Glutes: { x: .075, y: -.04, z: -.08, edge: .15, face: -1 },
  Quadriceps: { x: .095, y: -.27, z: .07, edge: .16, face: 1 },
  Hamstrings: { x: .095, y: -.27, z: -.07, edge: .16, face: -1 },
  Calves: { x: .095, y: -.64, z: 0, edge: .15, face: 0 },
}

export function projectMuscleAnchor(group: MuscleGroup, side: 'left' | 'right', camera: Camera, model: Object3D) {
  const anchor = anchors[group]
  model.updateWorldMatrix(true, false)
  camera.updateWorldMatrix(true, false)
  const eye = model.worldToLocal(camera.getWorldPosition(new Vector3()))
  const facing = anchor.face === 0 ? 1 : Math.max(0, Math.min(1, (eye.z * anchor.face / Math.hypot(eye.x, eye.z) + .25) / .5))
  const hidden = facing < .5
  const x = anchor.edge + (anchor.x - anchor.edge) * facing
  const z = anchor.z * facing
  const point = (sign: number) => model.localToWorld(new Vector3(sign * x, anchor.y, z)).project(camera)
  const first = point(-1), second = point(1)
  const chosen = (first.x < second.x) === (side === 'left') ? first : second
  return { x: chosen.x, y: chosen.y, hidden }
}
