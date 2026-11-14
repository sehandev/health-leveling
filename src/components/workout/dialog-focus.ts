type TabKeyEvent = {
  key: string
  shiftKey: boolean
  preventDefault: () => void
}

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

function focusableElements(dialog: HTMLDialogElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
}

export function keepDialogTabInside(
  dialog: HTMLDialogElement | null,
  event: TabKeyEvent,
  activeElement: Element | null,
) {
  if (!dialog?.open || event.key !== 'Tab') return

  const focusable = focusableElements(dialog)
  if (!focusable.length) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const activeIndex = activeElement ? focusable.indexOf(activeElement as HTMLElement) : -1
  if (activeIndex === -1) {
    event.preventDefault()
    ;(event.shiftKey ? focusable.at(-1)! : focusable[0]).focus()
  } else if (event.shiftKey && activeIndex === 0) {
    event.preventDefault()
    focusable.at(-1)!.focus()
  } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
    event.preventDefault()
    focusable[0].focus()
  }
}

export function keepDialogFocusValid(dialog: HTMLDialogElement | null, activeElement: Element | null) {
  if (!dialog?.open) return
  const focusable = focusableElements(dialog)
  if (activeElement && focusable.includes(activeElement as HTMLElement)) return
  ;(focusable[0] ?? dialog).focus()
}
