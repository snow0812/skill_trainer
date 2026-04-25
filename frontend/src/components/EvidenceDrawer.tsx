import { useLayoutEffect, useMemo, useRef } from 'react'

import { findEvidenceSpan } from '../lib/evidence-highlight'
import { formatDocumentType } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function EvidenceDrawer() {
  const { selectedDocument, documentEvidenceHighlight, setSelectedDocument } = useStudio()
  const markRef = useRef<HTMLElement | null>(null)

  const span = useMemo(() => {
    if (!selectedDocument || !documentEvidenceHighlight) return null
    return findEvidenceSpan(selectedDocument.normalized_text, documentEvidenceHighlight)
  }, [selectedDocument, documentEvidenceHighlight])

  useLayoutEffect(() => {
    if (!span || !markRef.current) return
    markRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedDocument?.id, span])

  if (!selectedDocument) return null

  const text = selectedDocument.normalized_text
  const showNote = Boolean(documentEvidenceHighlight) && !span

  return (
    <aside className="evidence-drawer">
      <div className="evidence-header">
        <div>
          <p className="eyebrow">Evidence</p>
          <h3>{selectedDocument.filename}</h3>
          <p className="muted">
            {formatDocumentType(selectedDocument.document_type)} · {selectedDocument.media_type}
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => setSelectedDocument(null)}>
          关闭
        </button>
      </div>
      {showNote ? (
        <p className="muted evidence-highlight-note">
          未在原文中精确定位到依据片段（可能与换行或节选有关），以下为全文；卡片上的「证据」摘要仍可作为对照。
        </p>
      ) : null}
      <div className="evidence-pre">
        {span ? (
          <>
            {text.slice(0, span.start)}
            <mark ref={markRef} className="evidence-highlight">
              {text.slice(span.start, span.start + span.length)}
            </mark>
            {text.slice(span.start + span.length)}
          </>
        ) : (
          text
        )}
      </div>
    </aside>
  )
}
