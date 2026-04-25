import { Link } from 'react-router-dom'

import { PersonaGlyph } from '../components/PersonaGlyph'
import { projectMaturityScore } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function PublishPage() {
  const { activeProject, loading, loadingReason, handleExport } = useStudio()
  const maturity = projectMaturityScore(activeProject)
  const exportedFiles = activeProject?.exported_files ?? []
  const ready = Boolean(activeProject?.profile)

  const capabilities = [
    { title: '回复工作消息', sub: '保留反问习惯和时间锚点', score: '92%' },
    { title: '起草方案开头', sub: '先列“不做什么”再写“怎么做”', score: '88%' },
    { title: '周报 / 总结', sub: '三段式结构，短句，少情绪词', score: '84%' },
    { title: '拒绝不合适的请求', sub: '先承认诉求再说原因，不堆客套', score: '71%' },
    { title: '向上汇报', sub: '先给判断再给不确定度', score: '68%' },
    { title: '闲聊 / 情绪化场景', sub: '样本偏少，不建议现在用', score: '32%' },
  ]

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">06 / 固化</div>
          <h1>把这一版定下来，拿去用</h1>
          <p>固化不是新阶段，而是验证通过之后的一键打包。导出后，这版规则可以作为一份独立 skill 被调用，直到你下次再训它。</p>
        </div>
      </div>

      <div className="release-hero" style={{ marginBottom: 20 }}>
        <div className="release-seal">
          <PersonaGlyph maturity={Math.max(0.8, maturity)} size={64} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--ok)' }}>
            {ready ? '准备就绪' : '仍待验证'}
          </div>
          <div style={{ fontSize: 18, color: 'var(--fg-0)', fontWeight: 500 }}>{activeProject?.name ?? '当前版本'} · 当前版</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4 }}>
            基于 {activeProject?.documents.length ?? 0} 份材料 · {(activeProject?.profile ? Object.values(activeProject.profile).reduce((sum, items) => sum + items.length, 0) : 0)} 条规则 · 最近导出 {exportedFiles.length} 个文件
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/validation/manual" className="btn ghost">
            再跑一轮验证
          </Link>
          <button className="btn accent" type="button" disabled={loading || !ready} onClick={() => void handleExport()}>
            {loadingReason === 'export' ? '导出中…' : '导出当前版本'}
          </button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>
        已具备的能力 · 这版能稳定做的事
      </div>
      <div className="grid g-3" style={{ marginBottom: 22 }}>
        {capabilities.map((capability) => {
          const score = Number.parseInt(capability.score, 10)
          const tone = score > 80 ? 'ok' : score > 60 ? 'warn' : 'danger'
          return (
            <div key={capability.title} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{capability.title}</span>
                <span className={`badge-soft ${tone}`}>{capability.score}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>{capability.sub}</div>
              <div className="bar">
                <span
                  style={{
                    width: capability.score,
                    background: score > 80 ? 'var(--ok)' : score > 60 ? 'var(--warn)' : 'var(--danger)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid g-2" style={{ marginBottom: 22 }}>
        <div className="export-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="ec-title">user-operating-system/</div>
              <div className="ec-sub">Skill 目录 · 可直接放进 Claude Code / Projects</div>
            </div>
            <button className="btn sm" type="button" onClick={() => void handleExport()} disabled={loading || !ready}>
              导出 .zip
            </button>
          </div>
          <pre>{`user-operating-system/
├── SKILL.md
├── principles.md
├── decision_rules.md
├── workflows.md
├── voice_patterns.md
├── boundaries.md
└── output_patterns.md`}</pre>
        </div>
        <div className="export-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="ec-title">system_prompt.md</div>
              <div className="ec-sub">作为单一 system prompt 注入</div>
            </div>
            <Link to="/release/exports" className="btn sm">
              查看内容
            </Link>
          </div>
          <pre>{(exportedFiles[0]?.content ?? `# 你（当前版）
先澄清问题，再讨论方案。面对不确定，给范围不给点。
写方案先列“这一版不做什么”。
短句优先，一段不超过 3 句。
...`).slice(0, 260)}</pre>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>最近导出</h3>
          <span className="card-sub">{exportedFiles.length}</span>
        </div>
        {exportedFiles.length === 0 ? <div className="empty">还没有导出记录。先完成验证，再导出当前稳定版。</div> : null}
        {exportedFiles.slice(0, 4).map((file) => (
          <div key={file.relative_path} className="list-row">
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', width: 54 }}>
              导出
            </span>
            <div className="flex1">
              <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{file.filename}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }}>
                {file.relative_path}
              </div>
            </div>
            <Link to="/release/exports" className="btn sm ghost">
              查看
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
