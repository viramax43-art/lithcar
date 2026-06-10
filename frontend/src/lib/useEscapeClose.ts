import { useEffect } from 'react'

/** Closes a modal/sheet on Escape — desktop users expect this everywhere. */
export function useEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onClose])
}
