import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Group, PerspectiveCamera } from 'three'
import { MUSCLE_GROUPS } from '../../domain/workouts.ts'
import { projectMuscleAnchor } from './muscle-anchors.ts'

test('each connector uses the nearer projected side and follows camera and model rotation', () => {
  const camera = new PerspectiveCamera(35, 1, .1, 100)
  camera.position.set(0, 0, 3.5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const model = new Group()
  for (const group of MUSCLE_GROUPS) {
    const left = projectMuscleAnchor(group, 'left', camera, model)
    const right = projectMuscleAnchor(group, 'right', camera, model)
    assert.ok(Number.isFinite(left.x) && Number.isFinite(left.y), group)
    assert.ok(left.x < right.x, group)
  }
  const front = projectMuscleAnchor('Chest', 'left', camera, model)
  assert.equal(front.hidden, false)
  assert.equal(projectMuscleAnchor('Back', 'right', camera, model).hidden, true)
  model.rotation.y = Math.PI
  const rear = projectMuscleAnchor('Chest', 'left', camera, model)
  assert.equal(rear.hidden, true)
  assert.equal(projectMuscleAnchor('Back', 'right', camera, model).hidden, false)
  assert.notEqual(front.x, rear.x)
  const beforeCameraMove = projectMuscleAnchor('Forearms', 'left', camera, model)
  camera.position.set(2, 0, 3)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const afterCameraMove = projectMuscleAnchor('Forearms', 'left', camera, model)
  assert.notEqual(afterCameraMove.x, beforeCameraMove.x)
  camera.position.set(3.5, 0, .01)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const beforeSide = projectMuscleAnchor('Chest', 'left', camera, model)
  camera.position.z = -.01
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const afterSide = projectMuscleAnchor('Chest', 'left', camera, model)
  assert.ok(Math.abs(beforeSide.x - afterSide.x) < .02)
  camera.position.set(2, 0, 3)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.aspect = .5
  camera.updateProjectionMatrix()
  assert.ok(Math.abs(projectMuscleAnchor('Forearms', 'left', camera, model).x) > Math.abs(afterCameraMove.x))
})
