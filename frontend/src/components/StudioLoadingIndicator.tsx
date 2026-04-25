import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { studioLoadingBannerLabel } from '../lib/studio-loading-reasons'
import { useStudio } from '../lib/studio-context'

export function StudioLoadingIndicator() {
  const { loadingReason } = useStudio()

  useEffect(() => {
    if (loadingReason) {
      document.body.dataset.studioBusy = 'true'
      document.body.dataset.studioBusyReason = loadingReason
    } else {
      delete document.body.dataset.studioBusy
      delete document.body.dataset.studioBusyReason
    }
    return () => {
      delete document.body.dataset.studioBusy
      delete document.body.dataset.studioBusyReason
    }
  }, [loadingReason])

  if (!loadingReason) return null

  return createPortal(
    <div className="studio-loading-root" role="status" aria-live="polite" aria-busy="true">
      <div className="studio-loading-bar-track">
        <div className="studio-loading-bar-fill" />
      </div>
      <div className="studio-loading-label">
        <span className="studio-loading-spinner" aria-hidden />
        {studioLoadingBannerLabel(loadingReason)}
      </div>
    </div>,
    document.body,
  )
}
