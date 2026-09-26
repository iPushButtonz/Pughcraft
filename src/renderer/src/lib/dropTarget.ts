/**
 * Whoever should receive a file dropped anywhere on the window right now (for example an open
 * Import screen). Registered while it's showing, so drops never depend on hitting a small box.
 */
type Target = (paths: string[]) => void
let current: Target | null = null

/** Registers the drop receiver; returns a function that removes it again. */
export function setDropTarget(fn: Target): () => void {
  current = fn
  return () => {
    if (current === fn) current = null
  }
}

export const dropTarget = (): Target | null => current
