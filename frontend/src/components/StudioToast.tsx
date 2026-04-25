import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { useStudio } from '../lib/studio-context'

const AUTO_DISMISS_MS = 5200

export function StudioToast() {
  const { message, clearMessage } = useStudio()

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => clearMessage(), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [message, clearMessage])

  if (!message) return null

  return createPortal(
    <div className="studio-toast" role="status" aria-live="polite">
      <p className="studio-toast-text">{message}</p>
      <button type="button" className="studio-toast-close" onClick={clearMessage} aria-label="关闭">
        ×
      </button>
    </div>,
    document.body,
  )
}
