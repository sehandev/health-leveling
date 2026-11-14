import assert from 'node:assert/strict'
import test from 'node:test'
import { keepDialogFocusValid, keepDialogTabInside } from './dialog-focus.ts'

type FocusTarget = {
  tabIndex: number
  disabled: boolean
  visible: boolean
  focus: () => void
  getClientRects: () => { length: number }
}

function setupDialog() {
  const targets: FocusTarget[] = []
  let focused: FocusTarget | 'dialog' | null = null
  let queries = 0
  const dialog = {
    open: true,
    querySelectorAll: () => {
      queries += 1
      return targets.filter((target) => !target.disabled && target.visible) as unknown as NodeListOf<HTMLElement>
    },
    contains: (target: unknown) => targets.includes(target as FocusTarget),
    focus: () => { focused = 'dialog' as const },
  } as unknown as HTMLDialogElement
  const addTarget = (): FocusTarget => {
    const target: FocusTarget = {
      tabIndex: 0,
      disabled: false,
      visible: true,
      focus: () => { focused = target },
      getClientRects: () => ({ length: target.visible ? 1 : 0 }),
    }
    targets.push(target)
    return target
  }
  return {
    dialog,
    targets,
    addTarget,
    get focused() { return focused },
    get queries() { return queries },
  }
}

function tabEvent(shiftKey = false) {
  let prevented = false
  return {
    event: { key: 'Tab', shiftKey, preventDefault: () => { prevented = true } },
    wasPrevented: () => prevented,
  }
}

test('Tab from the final Add control wraps to the first enabled dialog control', () => {
  const scope = setupDialog()
  const mode = scope.addTarget()
  scope.addTarget() // name
  const add = scope.addTarget()
  const event = tabEvent()

  keepDialogTabInside(scope.dialog, event.event, add as unknown as Element)

  assert.equal(event.wasPrevented(), true)
  assert.equal(scope.focused, mode)
})

test('Shift+Tab from the first control wraps to the final enabled control', () => {
  const scope = setupDialog()
  const first = scope.addTarget()
  const last = scope.addTarget()
  const event = tabEvent(true)

  keepDialogTabInside(scope.dialog, event.event, first as unknown as Element)

  assert.equal(event.wasPrevented(), true)
  assert.equal(scope.focused, last)
})

test('each Tab recalculates enabled visible controls and recovers focus outside the dialog', () => {
  const scope = setupDialog()
  const first = scope.addTarget()
  const cancel = scope.addTarget()
  const pendingAdd = scope.addTarget()
  pendingAdd.disabled = true
  const outside = {} as Element
  const event = tabEvent()

  keepDialogTabInside(scope.dialog, event.event, outside)

  assert.equal(scope.queries, 1)
  assert.equal(event.wasPrevented(), true)
  assert.equal(scope.focused, first)

  const nextEvent = tabEvent()
  keepDialogTabInside(scope.dialog, nextEvent.event, cancel as unknown as Element)

  assert.equal(scope.queries, 2)
  assert.equal(nextEvent.wasPrevented(), true)
  assert.equal(scope.focused, first)
})

test('pending state moves focus off controls that are no longer tabbable', () => {
  const scope = setupDialog()
  const cancel = scope.addTarget()
  const add = scope.addTarget()
  add.disabled = true

  keepDialogFocusValid(scope.dialog, add as unknown as Element)
  assert.equal(scope.focused, cancel)

  cancel.disabled = true
  keepDialogFocusValid(scope.dialog, cancel as unknown as Element)
  assert.equal(scope.focused, 'dialog')
})
