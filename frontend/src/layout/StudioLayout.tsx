import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { EvidenceDrawer } from '../components/EvidenceDrawer'
import { MiniGlyph } from '../components/PersonaGlyph'
import { StageRail } from '../components/StageRail'
import { StudioLoadingIndicator } from '../components/StudioLoadingIndicator'
import { StudioToast } from '../components/StudioToast'
import {
  journeySnapshot,
  projectMaturityScore,
  routeAccess,
  routeLabel,
  stageAccessMap,
} from '../lib/format'
import { useStudio } from '../lib/studio-context'
import { getStageKey } from '../lib/stages'

const PRIMARY_NAV = [
  { key: 'start', num: '01', label: '开始', to: '/start', hint: 'G S' },
  { key: 'materials', num: '02', label: '材料', to: '/materials', hint: 'G M' },
  { key: 'summary', num: '03', label: '理解', to: '/summary', hint: 'G U' },
  { key: 'correction', num: '04', label: '校正', to: '/correction/profile', hint: 'G C' },
  { key: 'validation', num: '05', label: '验证', to: '/validation/manual', hint: 'G V' },
  { key: 'release', num: '06', label: '固化', to: '/release', hint: 'G R' },
] as const

const DIAG_NAV = [
  { num: '↳', label: '资料库', to: '/materials/library', hint: 'D L' },
  { num: '↳', label: '自动实验', to: '/experiments', hint: 'D E' },
] as const

function maturityLabel(score: number) {
  if (score < 0.3) return { text: '资料不足', tone: 'warn' }
  if (score < 0.55) return { text: '可训练', tone: '' }
  if (score < 0.8) return { text: '可试运行', tone: 'accent' }
  return { text: '可发布', tone: 'ok' }
}

export function StudioLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    projects,
    activeProject,
    hasHydratedProjects,
    llmConfigured,
    distillMode,
    queuedRoute,
    manualPreviewResult,
    patchQueue,
    clearQueuedRoute,
    handleSelectProject,
  } = useStudio()

  const snapshot = journeySnapshot(activeProject)
  const currentStageKey = getStageKey(location.pathname)
  const stageAccess = stageAccessMap(activeProject)
  const accessGuard = routeAccess(activeProject, location.pathname, Boolean(manualPreviewResult?.response))
  const crumbPage = routeLabel(location.pathname)
  const maturity = projectMaturityScore(activeProject)
  const maturityState = maturityLabel(maturity)
  const pendingPatches = patchQueue.filter((item) => item.status === 'pending').length
  const reviewedPatches = patchQueue.filter((item) => Boolean(item.experiment_result)).length
  const experimentTag = pendingPatches + reviewedPatches
  const isExperimentRoute = location.pathname.startsWith('/experiments')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return 'light'
  })
  const [density, setDensity] = useState<'default' | 'compact'>(() => {
    try {
      return (localStorage.getItem('studio-density') as 'default' | 'compact') ?? 'default'
    } catch {
      return 'default'
    }
  })
  const [showGlyph, setShowGlyph] = useState<'glyph' | 'portrait' | 'off'>(() => {
    try {
      return (localStorage.getItem('studio-show-glyph') as 'glyph' | 'portrait' | 'off') ?? 'glyph'
    } catch {
      return 'glyph'
    }
  })
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [cmdkQuery, setCmdkQuery] = useState('')
  const glyphMaturity = showGlyph === 'off' ? 0.18 : showGlyph === 'portrait' ? Math.max(0.25, maturity * 0.72) : maturity
  const nextStep = nextCtaMeta(activeProject, location.pathname)
  const commandItems = useMemo(
    () => [
      ...PRIMARY_NAV.map((item) => ({
        group: '阶段',
        label: item.label,
        hint: item.hint,
        action: () => navigate(item.to),
      })),
      ...DIAG_NAV.map((item) => ({
        group: '诊断',
        label: item.label,
        hint: item.hint,
        action: () => navigate(item.to),
      })),
      ...projects.map((project) => ({
        group: '项目',
        label: project.name,
        hint: project.id === activeProject?.id ? '当前' : '切换',
        action: () => {
          void handleSelectProject(project.id)
          navigate('/start')
        },
      })),
      activeProject
        ? {
            group: '动作',
            label: nextStep?.label ?? '下一步',
            hint: '下一步',
            action: () => {
              if (nextStep) navigate(nextStep.route)
            },
          }
        : null,
    ].filter(Boolean) as Array<{ group: string; label: string; hint: string; action: () => void }>,
    [activeProject, handleSelectProject, navigate, nextStep, projects],
  )
  const filteredCommandItems = cmdkQuery.trim()
    ? commandItems.filter((item) => item.label.toLowerCase().includes(cmdkQuery.toLowerCase()))
    : commandItems

  useEffect(() => {
    if (!hasHydratedProjects) return
    if (!accessGuard.allowed) {
      clearQueuedRoute()
      navigate(accessGuard.fallback, { replace: true })
      return
    }
    if (!queuedRoute) return
    navigate(queuedRoute)
    clearQueuedRoute()
  }, [accessGuard, clearQueuedRoute, hasHydratedProjects, navigate, queuedRoute])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('studio-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    try {
      localStorage.setItem('studio-density', density)
    } catch {
      /* ignore */
    }
  }, [density])

  useEffect(() => {
    try {
      localStorage.setItem('studio-show-glyph', showGlyph)
    } catch {
      /* ignore */
    }
  }, [showGlyph])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCmdkOpen(true)
      }
      if (event.key === 'Escape') {
        setCmdkOpen(false)
        setTweaksOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-shell studio-shell">
      <aside className="sidebar studio-sidebar">
        <div className="sidebar-top">
          <NavLink to="/start" className="sidebar-brand" end>
            <MiniGlyph maturity={glyphMaturity} />
            <div>
              <div className="brand-name">Twin Studio</div>
              <div className="brand-sub">本地分身工作台</div>
            </div>
          </NavLink>

          <button
            type="button"
            className="project-switcher"
            onClick={() => setCmdkOpen(true)}
            title="切换项目"
          >
            <span className="ps-name">{activeProject?.name ?? '未选择项目'}</span>
            <span className="ps-meta">⌘K</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section">
            <span className="sidebar-section-label">训练阶段</span>
            <span className="count">{PRIMARY_NAV.length}</span>
          </div>
          <ul className="nav-list">
            {PRIMARY_NAV.map((item) => {
              const isRelease = item.key === 'release'
              const unlocked = isRelease ? snapshot.releaseAvailable : stageAccess[item.key].unlocked
              const active =
                (item.key === 'release' && location.pathname.startsWith('/release')) || currentStageKey === item.key

              return (
                <li key={item.to}>
                  <button
                    type="button"
                    className={`nav-item${active ? ' active' : ''}${!unlocked ? ' locked' : ''}`}
                    onClick={() => navigate(item.to)}
                    title={!unlocked ? (isRelease ? '需先完成校正与验证，形成稳定版本后再固化。' : stageAccess[item.key].reason) : undefined}
                  >
                    <span className="num">{item.num}</span>
                    <span>{item.label}</span>
                    {item.key === 'correction' && pendingPatches > 0 ? (
                      <span className="badge-soft accent" style={{ marginLeft: 'auto' }}>
                        {pendingPatches} 待处理
                      </span>
                    ) : active ? (
                      <span className="tag">current</span>
                    ) : !unlocked ? (
                      <span className="tag">later</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="sidebar-section" style={{ marginTop: 8 }}>
            <span className="sidebar-section-label">诊断</span>
          </div>
          <ul className="nav-list">
            {DIAG_NAV.map((item) => {
              const active = location.pathname.startsWith(item.to)
              const tag =
                item.to === '/materials/library'
                  ? String(activeProject?.documents.length ?? 0)
                  : String(experimentTag > 0 ? experimentTag : activeProject?.benchmark_tasks.length ?? 0)

              return (
                <li key={item.to}>
                  <button
                    type="button"
                    className={`nav-item${active ? ' active' : ''}`}
                    onClick={() => navigate(item.to)}
                  >
                    <span className="num">{item.num}</span>
                    <span>{item.label}</span>
                    <span className="tag">{tag}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="sidebar-footer">
          <span className="status">
            ● 本地 · {llmConfigured ? 'LLM 已连' : 'LLM 未连'} · {distillMode}
          </span>
          <button type="button" className="icon-btn" title="主题 / 密度" onClick={() => setTweaksOpen((value) => !value)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="main-col studio-main">
        <header className="topbar">
          <div className="crumbs">
            <strong>{activeProject?.name ?? 'Twin Studio'}</strong>
            <span className="sep">/</span>
            <span>{crumbPage}</span>
          </div>
          <span className={`chip ${maturityState.tone}`}>
            <span className="dot" />
            {maturityState.text}
          </span>
          <div className="topbar-spacer" />
          <button type="button" className="cmdk" onClick={() => setCmdkOpen(true)}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3 3" />
            </svg>
            <span>搜索或跳转…</span>
            <span style={{ marginLeft: 'auto' }} className="kbd">
              ⌘K
            </span>
          </button>
        </header>

        {isExperimentRoute ? null : <StageRail pathname={location.pathname} project={activeProject} stageAccess={stageAccess} />}

        <div className="page-body">
          <Outlet />
        </div>
      </div>

      {nextStep ? (
        <div className="next-cta fadein">
          <div className="nc-body">
            <div className="nc-eyebrow">下一步</div>
            <div className="nc-title">{nextStep.label}</div>
            <div className="nc-sub">{nextStep.sub}</div>
          </div>
          <button className="nc-go" type="button" onClick={() => navigate(nextStep.route)}>
            <span>{nextStep.cta}</span>
            <span className="arrow">→</span>
          </button>
        </div>
      ) : null}

      {tweaksOpen ? (
        <div className="tweaks-panel fadein">
          <div className="tweaks-head">
            <h4>Tweaks</h4>
            <button className="icon-btn" type="button" onClick={() => setTweaksOpen(false)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
          <div className="tweaks-body">
            <div className="tweak-row">
              <div className="t-label">主题</div>
              <div className="seg">
                <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
                  深色
                </button>
                <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
                  浅色
                </button>
              </div>
            </div>
            <div className="tweak-row">
              <div className="t-label">密度</div>
              <div className="seg">
                <button className={density === 'default' ? 'on' : ''} onClick={() => setDensity('default')}>
                  默认
                </button>
                <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')}>
                  紧凑
                </button>
              </div>
            </div>
            <div className="tweak-row">
              <div className="t-label">分身图示</div>
              <div className="seg">
                <button className={showGlyph === 'glyph' ? 'on' : ''} onClick={() => setShowGlyph('glyph')}>
                  抽象
                </button>
                <button className={showGlyph === 'portrait' ? 'on' : ''} onClick={() => setShowGlyph('portrait')}>
                  轮廓
                </button>
                <button className={showGlyph === 'off' ? 'on' : ''} onClick={() => setShowGlyph('off')}>
                  关
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cmdkOpen ? (
        <div className="cmdk-backdrop" onClick={() => setCmdkOpen(false)}>
          <div className="cmdk-modal fadein" onClick={(event) => event.stopPropagation()}>
            <input
              className="cmdk-input"
              autoFocus
              placeholder="跳转到阶段、切换项目、执行动作…"
              value={cmdkQuery}
              onChange={(event) => setCmdkQuery(event.target.value)}
            />
            <div className="cmdk-list">
              {Array.from(new Set(filteredCommandItems.map((item) => item.group))).map((group) => (
                <div key={group}>
                  <div className="cmdk-group">{group}</div>
                  {filteredCommandItems
                    .filter((item) => item.group === group)
                    .map((item, index) => (
                      <button
                        key={`${group}-${index}-${item.label}`}
                        type="button"
                        className="cmdk-item"
                        onClick={() => {
                          item.action()
                          setCmdkOpen(false)
                          setCmdkQuery('')
                        }}
                      >
                        <span>{item.label}</span>
                        <span className="cmdk-hint">{item.hint}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <StudioLoadingIndicator />
      <StudioToast />
      <EvidenceDrawer />
    </div>
  )
}

function nextCtaMeta(project: ReturnType<typeof useStudio>['activeProject'], pathname: string) {
  if (!project) return null
  if (pathname.startsWith('/start')) {
    return {
      label: project.documents.length === 0 ? '上传第一份材料' : '去材料页继续补样本',
      sub: project.documents.length === 0 ? '它先从你的原始材料开始学。' : '先补到能开始第一次蒸馏。',
      cta: '去材料',
      route: '/materials',
    }
  }
  if (pathname.startsWith('/materials')) {
    return {
      label: project.claims.length > 0 ? '回看系统怎么理解你' : '开始第一次蒸馏',
      sub: project.claims.length > 0 ? '材料已经有结果，可以先看理解概览。' : '上传到位后，让系统先生成第一版理解。',
      cta: project.claims.length > 0 ? '去理解' : '看材料',
      route: project.claims.length > 0 ? '/summary' : '/materials',
    }
  }
  if (pathname.startsWith('/summary')) {
    return {
      label: '把不对的地方改成稳定规则',
      sub: '下一步进入校正，把系统理解改成可复用规则。',
      cta: '去校正',
      route: '/correction/profile',
    }
  }
  if (pathname.startsWith('/correction')) {
    return {
      label: '跑一次真实任务',
      sub: '规则改好后，用真实任务验证它是不是真的像你。',
      cta: '去验证',
      route: '/validation/manual',
    }
  }
  if (pathname.startsWith('/validation')) {
    return {
      label: '整理当前稳定版本',
      sub: '验证通过后，进入固化页检查并导出当前版本。',
      cta: '去固化',
      route: '/release',
    }
  }
  return {
    label: '查看导出结果',
    sub: '检查当前版本的 bundle 与导出文件。',
    cta: '看导出',
    route: '/release/exports',
  }
}
