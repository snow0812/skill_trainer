import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { changedProfileSectionCount, formatRelativeTime, hasUnsavedProfileChanges } from '../lib/format'
import { useStudio } from '../lib/studio-context'
import { patchProfile } from '../lib/training-helpers'
import type { ProfileChangeSourceKind, ProfileSections } from '../types'

const SECTION_LABELS: Array<{ key: keyof ProfileSections; label: string }> = [
  { key: 'principles', label: '原则' },
  { key: 'decision_rules', label: '决策方式' },
  { key: 'workflows', label: '工作流' },
  { key: 'voice', label: '语气' },
  { key: 'boundaries', label: '边界' },
  { key: 'uncertainty_policy', label: '不确定时怎么处理' },
]

export function TrainingProfilePage() {
  const {
    activeProject,
    editableProfile,
    loading,
    loadingReason,
    setEditableProfile,
    handleSaveProfile,
    profileDraftHighlight,
    profileDraftChangeMeta,
    savedProfileVersionMeta,
    clearProfileDraftHighlight,
    recordProfileDraftManualChange,
    patchQueue,
  } = useStudio()

  const [activeSection, setActiveSection] = useState<keyof ProfileSections>('principles')
  const dirty = hasUnsavedProfileChanges(activeProject, editableProfile)
  const changedSections = changedProfileSectionCount(activeProject, editableProfile)
  const pendingFeedback = patchQueue.filter((item) => item.status === 'pending').length

  const patchSection = useCallback(
    (section: keyof ProfileSections, value: string[]) => {
      if (profileDraftHighlight?.section === section) {
        clearProfileDraftHighlight()
      }
      patchProfile(setEditableProfile, section, value)
      recordProfileDraftManualChange(section)
    },
    [clearProfileDraftHighlight, profileDraftHighlight?.section, recordProfileDraftManualChange, setEditableProfile],
  )

  if (!activeProject?.profile || !editableProfile) {
    return (
      <div className="page-inner fadein">
        <div className="empty">
          还没有可编辑的规则草稿。先完成一次蒸馏，再回来把真正会生效的规则整理出来。
        </div>
      </div>
    )
  }

  const activeRules = editableProfile[activeSection] ?? []

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">04 / 校正</div>
          <h1>把不对的地方改成稳定规则</h1>
          <p>这里有三件事：处理验证带回来的反馈、核对系统判断、直接编辑规则本。规则本是它真正执行时会遵守的唯一来源。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" type="button" onClick={() => void handleSaveProfile()} disabled={loading}>
            {loadingReason === 'saveProfile' ? '保存中…' : dirty ? '保存并验证 →' : '进入验证 →'}
          </button>
        </div>
      </div>

      <div className="loop-viz" style={{ marginBottom: 18 }}>
        <Link to="/validation/feedback" className="loop-node">
          <span className="ln-label">验证反馈</span>
          <span className="ln-sub">{pendingFeedback} 待处理</span>
        </Link>
        <span className="loop-arrow">→</span>
        <Link to="/correction/claims" className="loop-node">
          <span className="ln-label">系统说</span>
          <span className="ln-sub">{activeProject.claims.filter((claim) => claim.review_status === 'pending').length} 条待确认</span>
        </Link>
        <span className="loop-arrow">→</span>
        <div className="loop-node active">
          <span className="ln-label">规则本</span>
          <span className="ln-sub">{Object.values(editableProfile).reduce((sum, items) => sum + items.length, 0)} 条生效</span>
        </div>
        <span className="loop-arrow" style={{ transform: 'rotate(90deg)' }}>
          →
        </span>
        <Link to="/validation/manual" className="loop-node">
          <span className="ln-label">再验证</span>
          <span className="ln-sub">跑真实任务</span>
        </Link>
      </div>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className={`card${dirty ? ' active-card' : ''}`}>
          <div className="card-head">
            <h3>{dirty ? '这轮规则修改还没保存' : '当前规则草稿已保存'}</h3>
            <span className="card-sub">{dirty ? `${changedSections} 个分区待提交` : '已保存'}</span>
          </div>
          <p className="muted">
            {dirty ? '没保存时，验证仍然使用旧版规则。' : '当前验证与导出都会继续使用这版已保存规则。'}
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>这版是怎么来的</h3>
            <span className="card-sub">{profileDraftChangeMeta ? '最近改动' : '当前来源'}</span>
          </div>
          <p className="muted">
            {profileDraftChangeMeta
              ? `${profileDraftChangeMeta.title} · ${formatRelativeTime(profileDraftChangeMeta.updated_at)}`
              : savedProfileVersionMeta
                ? `${sourceKindLabel(savedProfileVersionMeta.source_kind)} · ${savedProfileVersionMeta.title}`
                : '当前还没有可追溯的版本说明。'}
          </p>
        </div>
      </div>

      <div className="rulebook">
        <div className="rulebook-nav">
          {SECTION_LABELS.map((section) => (
            <button
              key={section.key}
              className={activeSection === section.key ? 'on' : ''}
              onClick={() => setActiveSection(section.key)}
            >
              <span>{section.label}</span>
              <span className="rn-count">{editableProfile[section.key].length}</span>
            </button>
          ))}
        </div>

        <div className="rulebook-panel">
          <h2>{SECTION_LABELS.find((item) => item.key === activeSection)?.label}</h2>
          <div className="rp-hint">直接写规则本。只有这里保存后的内容，会真正进入下一轮验证。</div>

          {profileDraftHighlight?.section === activeSection ? (
            <div className="badge-soft accent">刚插入了一条来自反馈建议的规则，确认后记得保存。</div>
          ) : null}

          <div className="col" style={{ gap: 8 }}>
            {activeRules.length === 0 ? <div className="empty">这个维度还没有规则，可以直接手动补一条。</div> : null}
            {activeRules.map((rule, index) => (
              <div
                key={`${activeSection}-${index}-${rule}`}
                className={`rule-item${profileDraftHighlight?.section === activeSection && profileDraftHighlight.snippet === rule ? ' fresh' : ''}`}
              >
                <span className="ri-num">{String(index + 1).padStart(2, '0')}</span>
                <div className="ri-text">{rule}</div>
                <span className="ri-handle" title="当前版本不支持拖拽排序">
                  ⋮⋮
                </span>
              </div>
            ))}

            <section className={`card${profileDraftHighlight?.section === activeSection ? ' profile-draft-highlight-card' : ''}`}>
              <textarea
                className={profileDraftHighlight?.section === activeSection ? 'profile-draft-highlight-textarea' : undefined}
                rows={Math.max(8, activeRules.length + 2)}
                value={activeRules.join('\n')}
                onChange={(event) =>
                  patchSection(
                    activeSection,
                    event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function sourceKindLabel(kind: ProfileChangeSourceKind) {
  const mapping: Record<ProfileChangeSourceKind, string> = {
    manual: '手动编辑',
    preview_feedback: '试运行反馈',
    claims_candidate: '候选判断改写',
    claims_rebuild: '候选判断重建',
    distill: '重新蒸馏',
  }
  return mapping[kind]
}
