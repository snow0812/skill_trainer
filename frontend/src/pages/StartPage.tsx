import { useNavigate } from 'react-router-dom'

import { PersonaGlyph } from '../components/PersonaGlyph'
import { projectMaturityScore, recommendedRoute } from '../lib/format'
import { useStudio } from '../lib/studio-context'
import { STAGE_RAIL } from '../lib/stages'

const MATERIAL_HINTS = ['真实回复（最能学到语气）', '方案 / PRD（学到拆解方式）', '复盘 / 决策（学到取舍）']

const STAGE_EXPLAINS = [
  '创建项目，决定要训练哪一种“你”。',
  '上传样本；覆盖度够了就可以开始学。',
  '系统先给你一版“它以为的你”。',
  '把不对的地方改成稳定规则。',
  '用真实任务检验；不像就继续回改。',
  '验证通过后，导出为可用版本。',
]

export function StartPage() {
  const navigate = useNavigate()
  const {
    activeProject,
    projects,
    patchQueue,
    newProjectName,
    setNewProjectName,
    handleCreateProject,
    handleSelectProject,
    loading,
    loadingReason,
  } = useStudio()

  const heroProject = activeProject ?? null
  const heroScore = projectMaturityScore(heroProject)
  const pendingFeedbackCount = patchQueue.filter((item) => item.status === 'pending').length
  const continueStageLabel =
    pendingFeedbackCount > 0
      ? '校正'
      : heroProject
        ? STAGE_RAIL.find((item) => recommendedRoute(heroProject).startsWith(item.to))?.title ?? '开始'
        : '开始'

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">01 / 开始</div>
          <h1>训练一个你的数字分身</h1>
          <p>
            把你写过的方案、聊天、复盘交给它。它会先学着像你说话和判断，再用真实任务验证。整个过程只有 6
            步，每一步都会告诉你下一步该做什么。
          </p>
        </div>
      </div>

      <div className="hero" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">{heroProject ? '继续上次' : '从零开始'}</div>
          <h1 style={{ fontSize: 22 }}>{heroProject?.name ?? '先创建一个新的分身项目'}</h1>
          <p>
            {heroProject
              ? pendingFeedbackCount > 0
                ? `上次你停在「${continueStageLabel}」。有 ${pendingFeedbackCount} 条验证反馈还没处理，处理完后可以再跑一次真实任务。`
                : `上次你停在「${continueStageLabel}」。现在可以继续主流程，或者先回看系统怎么理解你。`
              : '先决定你要训练哪一种“你”，再开始上传最能代表你的原始材料。'}
          </p>
          <div className="hero-actions">
            {heroProject ? (
              <>
                <button className="btn primary" onClick={() => navigate(recommendedRoute(heroProject))}>
                  继续当前流程 <span className="arrow">→</span>
                </button>
                <button className="btn ghost" onClick={() => navigate('/summary')}>
                  先看理解概览
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={() => navigate('/materials')}>
                去材料页开始 <span className="arrow">→</span>
              </button>
            )}
          </div>
        </div>
        <div className="hero-twin">
          <PersonaGlyph maturity={heroProject ? heroScore : 0.12} size={240} pulse />
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head">
            <h3>所有项目</h3>
            <span className="card-sub">{projects.length} 个</span>
          </div>
          <div className="start-project-list">
            {projects.length === 0 ? <div className="empty">还没有项目，先在右侧创建一个。</div> : null}
            {projects.map((project) => {
              const score = project.id === activeProject?.id ? heroScore : 0.55
              const selected = project.id === activeProject?.id
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`start-project-row${selected ? ' selected' : ''}`}
                  onClick={() => {
                    void handleSelectProject(project.id)
                    navigate('/start')
                  }}
                >
                  <PersonaGlyph maturity={score} size={36} />
                  <div className="flex1">
                    <div className="pp-name">{project.name}</div>
                    <div className="pp-meta">
                      建于 {new Date(project.created_at).toLocaleDateString()} · 成熟度 {Math.round(score * 100)}%
                    </div>
                  </div>
                  <span className={`badge-soft pp-stage${selected ? ' accent' : ''}`}>
                    {selected ? '当前项目' : '切换'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>新建一个分身</h3>
            <span className="card-sub">大约 3 分钟</span>
          </div>
          <form className="col" style={{ gap: 10 }} onSubmit={(event) => void handleCreateProject(event)}>
            <input
              type="text"
              placeholder="例如：产品经理分身 v3"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
            />
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', lineHeight: 1.6 }}>我会引导你准备这几类材料：</div>
            <div className="col" style={{ gap: 4 }}>
              {MATERIAL_HINTS.map((item) => (
                <div key={item} style={{ fontSize: 12, color: 'var(--fg-1)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--fg-4)' }}>·</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <button className="btn accent" type="submit" disabled={loading || !newProjectName.trim()}>
              {loadingReason === 'createProject' ? '创建中…' : '创建并开始'}
            </button>
          </form>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card flat" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '0 4px' }}>
          <h3>它会带你走完这 6 步</h3>
          <span className="card-sub">每一步只做一件事</span>
        </div>
        <div className="grid g-3" style={{ marginTop: 6 }}>
          {STAGE_RAIL.map((stage, index) => (
            <div key={stage.key} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                  {stage.num}
                </span>
                <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{stage.title}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.55 }}>{STAGE_EXPLAINS[index]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
