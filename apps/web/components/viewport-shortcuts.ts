export type ViewportShortcut = 'fit-content' | 'fit-canvas'

interface ShortcutEventLike {
  code: string
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

interface EditableTargetLike {
  tagName?: string
  isContentEditable?: boolean
}

export function getViewportShortcut(event: ShortcutEventLike): ViewportShortcut | null {
  const primaryModifier = event.ctrlKey === true || event.metaKey === true
  if (
    event.code === 'Digit1' &&
    event.shiftKey === true &&
    !primaryModifier &&
    event.altKey !== true
  ) {
    return 'fit-content'
  }
  if (
    event.code === 'Digit0' &&
    primaryModifier &&
    event.shiftKey !== true &&
    event.altKey !== true
  ) {
    return 'fit-canvas'
  }
  return null
}

export function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false
  const editable = target as EditableTargetLike
  const tagName = editable.tagName?.toUpperCase()
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || editable.isContentEditable === true
}
