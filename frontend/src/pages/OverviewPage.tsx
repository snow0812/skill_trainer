import { Link } from 'react-router-dom'

import { PersonaGlyph } from '../components/PersonaGlyph'
import { learnedPatternClaims, overviewFocusCards, projectMaturityScore } from '../lib/format'
import { useStudio } from '../lib/studio-context'

function facetConfidence(items: string[]) {
  return Math.max(1, Math.min(5, items.length))
}

export function OverviewPage() {
  const { activeProject } = useStudio()
  const profile = activeProject?.profile
  const maturity = projectMaturityScore(activeProject)
  const focusCards = overviewFocusCards(activeProject)
  const learnedPatterns = learnedPatternClaims(activeProject)

  const facets = profile
    ? [
        { key: 'identity', title: '他是谁', label: '身份', items: profile.identity.slice(0, 2) },
        { key: 'principles', title: '他相信什么', label: '原则', items: profile.principles.slice(0, 3) },
        { key: 'decision_rules', title: '他怎么取舍', label: '决策', items: profile.decision_rules.slice(0, 3) },
        { key: 'workflows', title: '他怎么推进事情', label: '工作流', items: profile.workflows.slice(0, 3) },
        { key: 'voice', title: '他怎么说话', label: '语气', items: profile.voice.slice(0, 3) },
        { key: 'boundaries', title: '他不做什么', label: '边界', items: profile.boundaries.slice(0, 3) },
      ]
    : []

  const summary =
    profile?.principles[0] ?? profile?.workflows[0] ?? profile?.voice[0] ?? '当前还没有足够稳定的规则，先回材料页补样本再蒸馏。'

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">03 / 理解</div>
          <h1>它现在以为的你</h1>
          <p>先读一遍。理解对了的地方不用管；理解歪了的地方，下一步就在「校正」里改成稳定规则。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/materials" className="btn ghost">
            补一点材料
          </Link>
          <Link to="/correction/profile" className="btn primary">
            去把不对的改掉 →
          </Link>
        </div>
      </div>

      <div className="twin-card" style={{ marginBottom: 22 }}>
        <PersonaGlyph maturity={maturity} size={64} />
        <div className="twin-card-body">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            它怎么描述自己
          </div>
          <div className="twin-quote">"{summary}"</div>
          <div className="twin-meta">
            <span className="chip accent">
              <span className="dot" />
              本版基于 {activeProject?.documents.length ?? 0} 份材料 · {activeProject?.claims.length ?? 0} 条理解
            </span>
            <span className="chip">
              <span className="dot" />
              蒸馏方式 {activeProject?.distillation_meta?.mode ?? 'heuristic'}
            </span>
            <span className="chip">
              <span className="dot" />
              成熟度 {Math.round(maturity * 100)}%
            </span>
          </div>
        </div>
        <Link to="/materials" className="btn sm ghost">
          重新蒸馏这版
        </Link>
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>
        六个维度 · 它把你拆成这样
      </div>
      <div className="grid g-3" style={{ marginBottom: 22 }}>
        {facets.map((facet) => (
          <div key={facet.key} className="facet-card">
            <div className="fc-head">
              <span className="fc-title">{facet.title}</span>
              <span className="fc-label">{facet.label}</span>
            </div>
            <ul>
              {(facet.items.length > 0 ? facet.items : ['这一块目前信息还不够，建议继续补材料。']).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="fc-confidence">
                <span>置信度</span>
                <span className="conf-dots">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <span key={index} className={index < facetConfidence(facet.items) ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <Link to="/correction/profile" className="btn sm ghost">
                改写这一块
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head">
            <h3>最值得先处理</h3>
            <span className="card-sub">系统标出的偏差</span>
          </div>
          <div className="col" style={{ gap: 10 }}>
            {focusCards.slice(0, 3).map((card) => (
              <div key={card.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="badge-soft accent" style={{ marginTop: 2 }}>
                  {card.title}
                </span>
                <div className="flex1" style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                  {card.items[0] ?? '这块还需要你人工确认。'}
                </div>
                <Link to="/correction/profile" className="btn sm ghost">
                  去校正 →
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>它是从哪里学到的</h3>
            <span className="card-sub">按材料贡献度</span>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {learnedPatterns.slice(0, 5).map((claim, index) => (
              <div key={claim.id} className="row" style={{ gap: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', width: 20 }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex1">
                  <div style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>{claim.source_document_id || '未标注文档'}</div>
                  <div className="bar" style={{ marginTop: 4 }}>
                    <span style={{ width: `${Math.max(18, claim.confidence * 18)}%` }} />
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>
                  {claim.confidence} 级
                </span>
              </div>
            ))}
            {learnedPatterns.length === 0 ? <div className="empty">当前还没有足够稳定的结构模板，建议继续补充方案或复盘材料。</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
