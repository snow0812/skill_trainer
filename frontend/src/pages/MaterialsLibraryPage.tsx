import { Link } from 'react-router-dom'

import { documentTypeCounts, formatDocumentType } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function MaterialsLibraryPage() {
  const { activeProject, handleOpenDocument } = useStudio()
  const documents = activeProject?.documents ?? []
  const typeCounts = documentTypeCounts(activeProject)

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">02 / 材料 / 资料库</div>
          <h1>逐份回看你已经交给系统的材料</h1>
          <p>这一页只负责浏览和回看材料；上传、补缺口和重新蒸馏，请回到材料首页处理。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge-soft">{documents.length} 份资料</span>
          <Link to="/materials" className="btn ghost">
            回材料首页
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>资料分布</h3>
          <span className="card-sub">Types</span>
        </div>
        <div className="scenario-pills">
          {typeCounts.map(([type, count]) => (
            <span key={type} className="pill on">
              {formatDocumentType(type)} · {count}
            </span>
          ))}
          {typeCounts.length === 0 ? <span className="muted">还没有资料。</span> : null}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--line-1)' }}>
          <h3>全部资料</h3>
          <span className="card-sub">点任一行查看详情</span>
        </div>
        <div>
          {documents.length === 0 ? <div className="empty" style={{ margin: 14 }}>还没有资料。先回到材料页上传几份最能代表你的真实材料。</div> : null}
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
                <div className="doc-meta">
                  {document.media_type} · {new Date(document.created_at).toLocaleString()}
                </div>
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
