import { useState } from 'react'
import { Link } from 'react-router-dom'

import { documentTypeCounts, formatDocumentType } from '../lib/format'
import { useStudio } from '../lib/studio-context'

const DOC_TARGETS: Record<string, { label: string; target: number }> = {
  reply_draft: { label: '真实回复', target: 10 },
  prd: { label: 'PRD / 方案', target: 5 },
  proposal: { label: 'PRD / 方案', target: 5 },
  retrospective: { label: '复盘 / 决策', target: 4 },
  notes: { label: '日常笔记', target: 6 },
  weekly_report: { label: '周报 / 汇报', target: 4 },
  generic: { label: '通用材料', target: 5 },
}

function coverageItems(entries: Array<[string, number]>) {
  const merged = new Map<string, number>()
  for (const [type, count] of entries) {
    const config = DOC_TARGETS[type]
    const key = config?.label ?? formatDocumentType(type as never)
    merged.set(key, (merged.get(key) ?? 0) + count)
  }

  return Array.from(merged.entries()).map(([label, count]) => {
    const target = Object.values(DOC_TARGETS).find((item) => item.label === label)?.target ?? 5
    return { label, count, target }
  })
}

export function MaterialsPage() {
  const {
    activeProject,
    pendingFiles,
    loading,
    loadingReason,
    setPendingFiles,
    handleUpload,
    handleImportDocumentLink,
    handleDistill,
    handleOpenDocument,
  } = useStudio()
  const [linkInput, setLinkInput] = useState('')

  const documents = activeProject?.documents ?? []
  const claimCount = activeProject?.claims.length ?? 0
  const coverage = coverageItems(documentTypeCounts(activeProject))
  const completedCoverage = coverage.filter((item) => item.count >= item.target).length
  const coverageRatio = coverage.length === 0 ? 0 : completedCoverage / coverage.length
  const canDistill = Boolean(activeProject) && documents.length > 0

  async function importLink() {
    const url = linkInput.trim()
    if (!url) return
    await handleImportDocumentLink(url)
    setLinkInput('')
  }

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">02 / 材料</div>
          <h1>给它喂点真正代表你的东西</h1>
          <p>它不看简历、不看职位，它看你实际写过的字。越是你平常怎么处理事情的原件，它学得越像。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/materials/library" className="btn ghost">
            资料库 {documents.length}
          </Link>
          <button className="btn primary" disabled={!canDistill || loading} onClick={() => void handleDistill()}>
            {!documents.length
              ? '继续补材料'
              : loadingReason === 'distillFirst' || loadingReason === 'distillRedo'
                ? '蒸馏中…'
                : claimCount > 0
                  ? '重新蒸馏 →'
                  : '开始第一次蒸馏 →'}
          </button>
        </div>
      </div>

      <div className="grid g-2 materials-top-grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>上传材料</h3>
            <span className="card-sub">支持 txt / md / doc / docx / pdf / 飞书公开链接</span>
          </div>
          <label className="upload-zone">
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv,.py,.ts,.tsx,.js,.jsx,.css,.yaml,.yml,.html,.htm,.doc,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              style={{ display: 'none' }}
              onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
              disabled={!activeProject}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M12 15V3M8 7l4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
              <strong>把文件拖进来，或点击选择</strong>
              <div className="uz-hint">
                {pendingFiles.length > 0 ? `已选择 ${pendingFiles.length} 份，点下方上传` : '原件比总结好；细节比摘要好'}
              </div>
            </div>
          </label>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
            <input
              type="url"
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="粘贴飞书公开链接，系统会抓取正文"
              disabled={!activeProject || loading}
            />
            <button
              className="btn sm ghost"
              type="button"
              disabled={!activeProject || loading || !linkInput.trim()}
              onClick={() => void importLink()}
            >
              {loadingReason === 'importLink' ? '导入中…' : '导入链接'}
            </button>
          </div>
          <div className="row materials-upload-foot" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 6, color: 'var(--fg-3)', fontSize: 11.5 }}>
              <span className="chip ok">
                <span className="dot" />
                本地处理
              </span>
              <span className="chip">
                <span className="dot" />
                不会发到云端
              </span>
            </div>
            <button
              className="btn sm"
              type="button"
              disabled={loading || !activeProject || pendingFiles.length === 0}
              onClick={() => void handleUpload()}
            >
              {loadingReason === 'upload' ? '上传中…' : pendingFiles.length > 0 ? `上传 ${pendingFiles.length} 份` : '等待选文件'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>材料够不够让它开始学</h3>
            <span className="card-sub">{Math.round(coverageRatio * 100)}% 覆盖</span>
          </div>
          <div style={{ marginTop: 6, marginBottom: 12 }}>
            <div className="bar">
              <span style={{ width: `${Math.round(coverageRatio * 100)}%` }} />
            </div>
          </div>
          <div className="coverage-grid">
            {coverage.map((item) => {
              const ratio = Math.min(1, item.count / item.target)
              const tone = item.count === 0 ? 'empty' : ratio >= 1 ? 'ok' : 'warn'
              return (
                <div key={item.label} className={`cov-item ${tone}`}>
                  <div className="cov-label">{item.label}</div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="cov-count">
                      {item.count} / {item.target}
                    </span>
                  </div>
                  <div className="cov-bar">
                    <span style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <div className="cov-gap">{item.count < item.target ? `还差 ${item.target - item.count} 份` : '已达标'}</div>
                </div>
              )
            })}
            {coverage.length === 0 ? <div className="empty" style={{ gridColumn: '1 / -1' }}>还没有材料，先上传样本。</div> : null}
          </div>
        </div>
      </div>

      <div className="card materials-recent-card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--line-1)' }}>
          <h3>最近上传</h3>
          <span className="card-sub">{documents.length} 份 · 点任一行可回看原文</span>
        </div>
        <div>
          {documents.length === 0 ? <div className="empty" style={{ margin: 14 }}>上传后这里会出现最近材料。</div> : null}
          {documents.map((document, index) => (
            <button
              key={document.id}
              type="button"
              className="doc-row"
              onClick={() => void handleOpenDocument(document.id)}
            >
              <span style={{ color: 'var(--fg-4)', fontSize: 10 }} className="mono">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div style={{ textAlign: 'left' }}>
                <div className="doc-name">{document.filename}</div>
                <div className="doc-meta">上传于 {new Date(document.created_at).toLocaleString()}</div>
              </div>
              <span className="badge-soft">{formatDocumentType(document.document_type)}</span>
              <span className="badge-soft ok">已归一</span>
              <span className="icon-btn" aria-hidden>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M5 3l5 5-5 5" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
