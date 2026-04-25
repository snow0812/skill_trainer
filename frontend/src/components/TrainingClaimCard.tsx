import { useState } from 'react'

import type { ClaimSummary } from '../types'

export function TrainingClaimCard({
  claim,
  disabled,
  onKeep,
  onReject,
  onRewriteSave,
  onViewEvidence,
}: {
  claim: ClaimSummary
  disabled: boolean
  onKeep: () => void
  onReject: () => void
  onRewriteSave: (value: string) => void
  onViewEvidence: () => void
}) {
  const [rewriteMode, setRewriteMode] = useState(false)
  const [draft, setDraft] = useState(claim.statement)

  return (
    <article className={`claim-card ${claim.review_status === 'accepted' ? 'accepted' : claim.review_status === 'rejected' ? 'rejected' : ''}`}>
      <span className="cc-type">{claim.type}</span>
      <div>
        <div className="cc-statement">{claim.statement}</div>
        <div className="cc-evidence">
          "{claim.evidence_text}"
          <span className="cc-source">↳ {claim.source_document_id || '未标注来源'} · 置信度 {claim.confidence}</span>
        </div>
      </div>
      <div className="cc-actions">
        <button type="button" className="btn sm accent" disabled={disabled} onClick={onKeep}>
          ✓ 像我
        </button>
        <button type="button" className="btn sm" disabled={disabled} onClick={onReject}>
          不是我
        </button>
        <button type="button" className="btn sm ghost" disabled={disabled} onClick={() => setRewriteMode((current) => !current)}>
          写入规则
        </button>
        <button type="button" className="btn sm ghost" disabled={disabled || !claim.source_document_id} onClick={onViewEvidence}>
          看依据
        </button>
      </div>

      {rewriteMode && (
        <div className="card" style={{ gridColumn: '2 / 4', padding: 14 }}>
          <p className="muted">把这条候选判断改写成你真正认可的规则版本；写入后仍需在规则草稿页保存，才会进入验证与导出。</p>
          <textarea
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn sm accent"
              disabled={disabled || !draft.trim()}
              onClick={() => {
                onRewriteSave(draft.trim())
                setRewriteMode(false)
              }}
            >
              写入草稿候选
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setRewriteMode(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
