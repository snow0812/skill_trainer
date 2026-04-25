import { Link } from 'react-router-dom'

import { exportedFilePreview } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function PublishExportsPage() {
  const { activeProject } = useStudio()
  const files = activeProject?.exported_files ?? []

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">06 / 固化 / 导出内容</div>
          <h1>浏览最近生成的导出文件</h1>
          <p>这里展示稳定版导出的具体产物：规则文件来自已保存规则草稿，其余 evidence 与 examples 来自候选判断整理结果。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge-soft">{files.length} 个文件</span>
          <Link to="/release" className="btn ghost">
            回固化页
          </Link>
        </div>
      </div>

      <div className="grid g-2">
        {files.map((file) => (
          <article key={file.relative_path} className="export-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="ec-title">{file.filename}</div>
                <div className="ec-sub">{file.relative_path}</div>
              </div>
              <span className="badge-soft ok">已导出</span>
            </div>
            <pre>{exportedFilePreview(file.content, 480)}</pre>
          </article>
        ))}
        {files.length === 0 ? (
          <section className="card">
            <div className="empty">还没有导出记录。先回到固化页导出当前稳定版本。</div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
