import { Link } from 'react-router-dom'

import { TrainingClaimCard } from '../components/TrainingClaimCard'
import { claimGroups, useStudio } from '../lib/studio-context'
import { handleRewriteClaim } from '../lib/training-helpers'

export function TrainingClaimsPage() {
  const {
    activeProject,
    loading,
    loadingReason,
    setEditableProfile,
    handleRebuildProfile,
    handleClaimPatch,
    handleOpenDocument,
    recordProfileDraftClaimCandidateChange,
  } = useStudio()
  const groups = claimGroups(activeProject?.claims ?? [])

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">04 / 校正 / 系统说</div>
          <h1>核对候选判断与证据</h1>
          <p>这里审查的是候选判断，不是最终生效规则；最终仍要回到规则草稿确认并保存。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void handleRebuildProfile()}
            disabled={loading || !activeProject?.claims.length}
          >
            {loadingReason === 'rebuildProfile' ? '生成中…' : '用已选判断生成规则草稿'}
          </button>
          <Link to="/correction/profile" className="btn ghost">
            回规则草稿
          </Link>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="card-head" style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--line-1)' }}>
            <h3>{group.title}</h3>
            <span className="card-sub">{group.claims.length}</span>
          </div>
          <div>
            {group.claims.map((claim) => (
              <TrainingClaimCard
                key={claim.id}
                claim={claim}
                disabled={loading}
                onKeep={() =>
                  void handleClaimPatch(claim.id, {
                    review_status: 'accepted',
                    selected: true,
                  })
                }
                onReject={() =>
                  void handleClaimPatch(claim.id, {
                    review_status: 'rejected',
                    selected: false,
                  })
                }
                onRewriteSave={(value) =>
                  void handleRewriteClaim(
                    claim,
                    value,
                    setEditableProfile,
                    handleClaimPatch,
                    recordProfileDraftClaimCandidateChange,
                  )
                }
                onViewEvidence={() => void handleOpenDocument(claim.source_document_id, claim.evidence_text)}
              />
            ))}
            {group.claims.length === 0 ? <div className="empty" style={{ margin: 14 }}>这一组还没有可编辑的判断。</div> : null}
          </div>
        </section>
      ))}
    </div>
  )
}
