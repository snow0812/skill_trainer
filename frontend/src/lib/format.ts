import type { ClaimSummary, DistillationMeta, DocumentType, ProfileSections, ProjectDetail } from '../types'
import type { JourneyStageKey } from './stages'

export type FlowAction =
  | {
      kind: 'route'
      title: string
      description: string
      route: string
    }
  | {
      kind: 'distill'
      title: string
      description: string
    }
  | {
      kind: 'export'
      title: string
      description: string
    }

export type JourneyState =
  | 'noProject'
  | 'needsMaterials'
  | 'readyToGenerate'
  | 'readyToReview'
  | 'readyToCorrect'
  | 'readyToValidate'
  | 'readyToRelease'

export type StageAccessMap = Record<JourneyStageKey, { unlocked: boolean; reason: string }>

export function formatDocumentType(type: DocumentType | string) {
  const labels: Record<string, string> = {
    prd: 'PRD',
    proposal: '方案',
    retrospective: '复盘',
    reply_draft: '回复草稿',
    weekly_report: '周报',
    notes: '笔记',
    generic: '通用',
  }
  return labels[type] ?? type
}

export function summarizeTwin(project: ProjectDetail | null) {
  if (!project) {
    return '先创建一个项目，再开始塑造你的分身。'
  }
  if (!project?.profile) {
    return '先上传资料，让系统开始理解你。'
  }

  const summaryParts = [
    project.profile.principles[0],
    project.profile.workflows[0],
    project.profile.boundaries[0],
  ].filter(Boolean)

  if (summaryParts.length === 0) {
    return '系统已经完成初步蒸馏，但还需要更多高质量材料。'
  }

  return summaryParts.join(' / ')
}

export function selectedClaimCount(project: ProjectDetail | null) {
  return (
    project?.claims.filter((claim) => claim.selected && claim.review_status !== 'rejected').length ?? 0
  )
}

export function isPublishReady(project: ProjectDetail | null) {
  return journeySnapshot(project).releaseAvailable
}

export function projectMaturityScore(project: ProjectDetail | null) {
  const snapshot = journeySnapshot(project)
  if (!snapshot.hasProject) return 0

  const documentScore = Math.min(snapshot.documents / 8, 1) * 0.3
  const claimScore = Math.min(snapshot.selectedClaims / 10, 1) * 0.35
  const profileScore = snapshot.hasProfile ? 0.2 : 0
  const exportScore = snapshot.exportedCount > 0 ? 0.15 : 0

  return Math.max(0.08, Math.min(1, documentScore + claimScore + profileScore + exportScore))
}

export function journeySnapshot(project: ProjectDetail | null) {
  const hasProject = Boolean(project)
  const documents = project?.documents.length ?? 0
  const claims = project?.claims.length ?? 0
  const claimItems = project?.claims ?? []
  const selectedClaims = selectedClaimCount(project)
  const hasProfile = Boolean(project?.profile)
  const exportedCount = project?.exported_files.length ?? 0
  const releaseAvailable = hasProfile && selectedClaims >= 8
  const hasTrainingSignals = claimItems.some(
    (claim) =>
      claim.source_document_id === 'user_feedback' ||
      !claim.selected ||
      claim.review_status === 'rejected' ||
      claim.notes.includes('superseded_by_feedback') ||
      claim.notes.includes('source:preview_feedback'),
  )

  let state: JourneyState = 'noProject'
  if (!hasProject) {
    state = 'noProject'
  } else if (documents === 0) {
    state = 'needsMaterials'
  } else if (claims === 0) {
    state = 'readyToGenerate'
  } else if (!hasTrainingSignals && exportedCount === 0) {
    state = 'readyToReview'
  } else if (!releaseAvailable) {
    state = 'readyToCorrect'
  } else if (exportedCount > 0) {
    state = 'readyToRelease'
  } else {
    state = 'readyToValidate'
  }

  return {
    state,
    hasProject,
    documents,
    claims,
    selectedClaims,
    hasProfile,
    exportedCount,
    releaseAvailable,
    hasTrainingSignals,
  }
}

/**
 * 验证阶段（试运行）准入：与旅程标签「待读理解 / 待校正」解耦。
 * 否则在「全选 claim、未产生 hasTrainingSignals」时会一直停在 readyToReview，验证永远无法解锁。
 */
function canAccessValidationRoutes(snapshot: ReturnType<typeof journeySnapshot>): boolean {
  if (!snapshot.hasProject) return false
  if (snapshot.documents === 0) return false
  if (snapshot.claims === 0) return false
  if (!snapshot.hasProfile) return false
  return true
}

export function journeyStateLabel(state: JourneyState) {
  const labels: Record<JourneyState, string> = {
    noProject: '未开始',
    needsMaterials: '待补材料',
    readyToGenerate: '可首次蒸馏',
    readyToReview: '待读理解',
    readyToCorrect: '待校正',
    readyToValidate: '可验证',
    readyToRelease: '已固化',
  }
  return labels[state]
}

export function stageAccessMap(project: ProjectDetail | null): StageAccessMap {
  const snapshot = journeySnapshot(project)
  const hasProject = snapshot.hasProject
  const hasClaims = snapshot.claims > 0
  const validateReady = canAccessValidationRoutes(snapshot)

  return {
    start: {
      unlocked: true,
      reason: '开始阶段始终可用。',
    },
    materials: {
      unlocked: hasProject,
      reason: hasProject ? '材料阶段已可用。' : '需先创建项目，再进入材料准备。',
    },
    summary: {
      unlocked: hasClaims,
      reason: hasProject ? '需先完成首次蒸馏，才能查看「理解概览」。' : '需先创建项目并上传材料。',
    },
    correction: {
      unlocked: hasClaims,
      reason: hasProject ? '需先完成首次蒸馏，才能进入校正。' : '需先创建项目并上传材料。',
    },
    validation: {
      unlocked: validateReady,
      reason: !hasProject
        ? '需先创建项目。'
        : snapshot.documents === 0
          ? '需先上传资料。'
          : !hasClaims
            ? '需先在材料页完成首次蒸馏。'
            : !snapshot.hasProfile
              ? '需等待蒸馏生成 profile（或重新蒸馏）。'
              : '验证阶段暂不可用。',
    },
  }
}

/** 验证未解锁时单次回退目标，避免多级重定向（例如先落 /correction 再被挡回 /summary） */
function fallbackRouteWhenValidationLocked(state: JourneyState): string {
  if (state === 'noProject') {
    return '/start'
  }
  if (state === 'needsMaterials' || state === 'readyToGenerate') {
    return '/materials'
  }
  if (state === 'readyToReview') {
    return '/summary'
  }
  if (state === 'readyToCorrect') {
    return '/correction/profile'
  }
  return '/correction/profile'
}

export function routeAccess(
  project: ProjectDetail | null,
  pathname: string,
  hasPreviewResult = false,
) {
  const access = stageAccessMap(project)
  const snapshot = journeySnapshot(project)

  if (pathname.startsWith('/release') && !snapshot.releaseAvailable) {
    return { allowed: false, fallback: '/validation/manual', reason: '需先形成稳定版本，再进入固化页面。' }
  }

  if (!snapshot.hasProject && pathname !== '/start') {
    return { allowed: false, fallback: '/start', reason: '需先创建项目，才能进入后续流程。' }
  }

  if (pathname.startsWith('/validation/feedback') && !hasPreviewResult) {
    return { allowed: false, fallback: '/validation/manual', reason: '需先完成一次真实任务验证，才能进入反馈页。' }
  }

  if (pathname.startsWith('/materials') && !access.materials.unlocked) {
    return { allowed: false, fallback: '/start', reason: access.materials.reason }
  }

  if (pathname.startsWith('/summary') && !access.summary.unlocked) {
    return { allowed: false, fallback: '/materials', reason: access.summary.reason }
  }

  if (pathname.startsWith('/correction') && !access.correction.unlocked) {
    return { allowed: false, fallback: '/summary', reason: access.correction.reason }
  }

  if ((pathname.startsWith('/validation') || pathname.startsWith('/release') || pathname.startsWith('/experiments')) && !access.validation.unlocked) {
    return {
      allowed: false,
      fallback: fallbackRouteWhenValidationLocked(snapshot.state),
      reason: access.validation.reason,
    }
  }

  return { allowed: true, fallback: pathname, reason: '' }
}

export function projectMaturity(project: ProjectDetail | null) {
  return journeyStateLabel(journeySnapshot(project).state)
}

export function readinessItems(project: ProjectDetail | null) {
  const documents = project?.documents.length ?? 0
  const claims = project?.claims.length ?? 0
  const profile = project?.profile

  return [
    {
      label: '表达一致性',
      status: profile?.voice.length ? '比较稳定' : documents > 0 ? '初步形成' : '还需补充',
    },
    {
      label: '判断一致性',
      status:
        (profile?.decision_rules.length ?? 0) >= 3 ? '比较稳定' : claims > 6 ? '初步形成' : '还需补充',
    },
    {
      label: '工作方式一致性',
      status:
        (profile?.workflows.length ?? 0) >= 3 ? '比较稳定' : claims > 4 ? '初步形成' : '还需补充',
    },
    {
      label: '边界清晰度',
      status:
        (profile?.boundaries.length ?? 0) >= 2 ? '比较稳定' : claims > 3 ? '初步形成' : '还需补充',
    },
  ]
}

export function documentTypeCounts(project: ProjectDetail | null) {
  const counts = new Map<string, number>()
  project?.documents.forEach((document) => {
    counts.set(document.document_type, (counts.get(document.document_type) ?? 0) + 1)
  })
  return Array.from(counts.entries())
}

export function learnedPatternClaims(project: ProjectDetail | null) {
  return (
    project?.claims.filter(
      (claim) =>
        claim.notes === 'learned_from_document_structure' &&
        (claim.type === 'workflow' || claim.type === 'artifact_pattern'),
    ) ?? []
  )
}

export function topProfileEntries(profile: ProfileSections | null, key: keyof ProfileSections, limit = 3) {
  return profile?.[key].slice(0, limit) ?? []
}

export function profileSectionLabel(key: keyof ProfileSections) {
  const mapping: Record<keyof ProfileSections, string> = {
    identity: '身份',
    principles: '原则',
    decision_rules: '决策',
    workflows: '工作流',
    voice: '表达',
    boundaries: '边界',
    output_patterns: '输出模板',
    uncertainty_policy: '不确定性',
  }
  return mapping[key]
}

export function formatRelativeTime(input: string | null | undefined) {
  if (!input) return '暂无记录'
  const time = new Date(input).getTime()
  if (Number.isNaN(time)) return '时间未知'
  const diffMs = Date.now() - time
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays} 天前`
  return new Date(input).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function compareProfileSections(current: ProfileSections | null, previous: ProfileSections | null) {
  if (!current || !previous) return []
  const keys: Array<keyof ProfileSections> = [
    'identity',
    'principles',
    'decision_rules',
    'workflows',
    'voice',
    'boundaries',
    'output_patterns',
    'uncertainty_policy',
  ]
  return keys
    .map((key) => {
      const currentItems = current[key] ?? []
      const previousItems = previous[key] ?? []
      const added = currentItems.filter((item) => !previousItems.includes(item))
      const removed = previousItems.filter((item) => !currentItems.includes(item))
      return {
        key,
        label: profileSectionLabel(key),
        added,
        removed,
      }
    })
    .filter((item) => item.added.length > 0 || item.removed.length > 0)
}

export function nextActions(project: ProjectDetail | null) {
  const actions: Array<{ title: string; description: string; route: string }> = []
  const snapshot = journeySnapshot(project)

  if (snapshot.state === 'noProject') {
    actions.push({
      title: '开始创建分身',
      description: '先创建一个项目，再把你最有代表性的材料交给系统。',
      route: '/start',
    })
  }

  if (snapshot.state === 'needsMaterials') {
    actions.push({
      title: '准备材料',
      description: '先补几份最能代表你的材料，再触发首次蒸馏。',
      route: '/materials',
    })
    actions.push({
      title: '查看资料库',
      description: '先确认系统现在吃到的样本类型，再决定继续补哪类材料。',
      route: '/materials/library',
    })
  }

  if (snapshot.state === 'readyToGenerate') {
    actions.push({
      title: '首次蒸馏',
      description: '材料已够，在材料页触发首次蒸馏生成规则。',
      route: '/materials',
    })
  }

  if (snapshot.state === 'readyToReview') {
    actions.push({
      title: '查看理解诊断',
      description: '先确认系统当前怎么理解你，再决定要把哪些内容写进规则草稿。',
      route: '/summary',
    })
    actions.push({
      title: '去编辑规则草稿',
      description: '一旦知道理想版本应该怎么写，就直接进入规则草稿作为最终生效面。',
      route: '/correction/profile',
    })
  }

  if (snapshot.state === 'readyToCorrect') {
    actions.push({
      title: '编辑规则草稿',
      description: '把这版里不够像你的地方沉淀成稳定规则；保存后才会真正生效。',
      route: '/correction/profile',
    })
    actions.push({
      title: '查看候选判断与证据',
      description: '需要核对依据或批量吸收候选信号时，再进入候选信号页与系统判断页。',
      route: '/correction/signals',
    })
  }

  if (snapshot.state === 'readyToValidate' || snapshot.state === 'readyToRelease') {
    actions.push({
      title: '打开手动验证',
      description: '用已保存的规则草稿跑真实任务，判断这一版是否真的像你。',
      route: '/validation/manual',
    })
    actions.push({
      title: '处理反馈',
      description: '把最近一次试运行的偏差生成为规则草稿候选，再回去确认保存。',
      route: '/validation/feedback',
    })
  }

  if (snapshot.releaseAvailable) {
    actions.push({
      title: '固化当前版本',
      description: '当前版本已具备导出条件，可以进入导出页检查并生成 bundle。',
      route: '/release',
    })
  }

  return actions.slice(0, 3)
}

export function secondaryTopbarAction(project: ProjectDetail | null): FlowAction | null {
  if (!project || project.documents.length === 0) {
    return null
  }

  if (project.claims.length > 0) {
    return {
      kind: 'distill',
      title: '重新蒸馏',
      description: '当你补充了资料或想刷新理解时，再手动触发。',
    }
  }

  return null
}

export function recommendedRoute(project: ProjectDetail | null) {
  const state = journeySnapshot(project).state
  if (state === 'noProject') return '/start'
  if (state === 'needsMaterials' || state === 'readyToGenerate') return '/materials'
  if (state === 'readyToReview') return '/summary'
  if (state === 'readyToCorrect') return '/correction/profile'
  if (state === 'readyToValidate') return '/validation/manual'
  return '/release'
}

export function routeLabel(route: string) {
  const mapping: Record<string, string> = {
    '/start': '开始',
    '/materials': '材料',
    '/materials/library': '资料库',
    '/summary': '理解',
    '/summary/current': '理解',
    '/summary/uncertainty': '理解',
    '/correction': '校正',
    '/correction/signals': '校正',
    '/correction/profile': '校正',
    '/correction/claims': '校正',
    '/validation': '验证',
    '/validation/manual': '验证',
    '/validation/run': '验证',
    '/validation/experiments': '自动实验',
    '/validation/feedback': '验证反馈',
    '/validation/patches': '微调建议池',
    '/validation/leaderboard': '自动实验结果',
    '/experiments': '自动实验',
    '/experiments/patches': '自动实验',
    '/experiments/results': '自动实验',
    '/release': '固化',
    '/release/exports': '导出结果',
  }
  return mapping[route] ?? '下一步'
}

export function hasUnsavedProfileChanges(
  project: ProjectDetail | null,
  editableProfile: ProfileSections | null,
) {
  if (!project?.profile || !editableProfile) return false
  return JSON.stringify(project.profile) !== JSON.stringify(editableProfile)
}

export function changedProfileSectionCount(
  project: ProjectDetail | null,
  editableProfile: ProfileSections | null,
) {
  if (!project?.profile || !editableProfile) return 0
  const keys: Array<keyof ProfileSections> = [
    'identity',
    'principles',
    'decision_rules',
    'workflows',
    'voice',
    'boundaries',
    'uncertainty_policy',
  ]
  return keys.filter((key) => JSON.stringify(project.profile?.[key] ?? []) !== JSON.stringify(editableProfile[key] ?? [])).length
}

export function materialHealth(project: ProjectDetail | null) {
  const counts = documentTypeCounts(project)
  const countByType = Object.fromEntries(counts)
  const workSampleCount = (countByType.prd ?? 0) + (countByType.proposal ?? 0)
  return [
    {
      label: '表达样本',
      status: (countByType.reply_draft ?? 0) >= 2 ? '基本够用' : '不足',
      suggestion: '补充真实回复草稿会更像你的语气和边界。',
    },
    {
      label: '决策样本',
      status: (countByType.retrospective ?? 0) >= 2 ? '基本够用' : '不足',
      suggestion: '补充复盘和取舍记录，能强化你的判断方式。',
    },
    {
      label: '工作样本',
      status: workSampleCount >= 3 ? '丰富' : workSampleCount > 0 ? '基本够用' : '不足',
      suggestion: 'PRD 和方案最能帮助系统学习你的工作流。',
    },
    {
      label: '边界样本',
      status: (countByType.reply_draft ?? 0) >= 3 ? '基本够用' : '不足',
      suggestion: '拒绝、澄清、延期承诺类文本最能体现边界感。',
    },
  ]
}

export function materialGapFocus(project: ProjectDetail | null) {
  const priorities = materialHealth(project).filter((item) => item.status !== '丰富')
  return priorities.slice(0, 3)
}

export function insightCards(project: ProjectDetail | null) {
  const profile = project?.profile
  return [
    { title: '我是谁', items: topProfileEntries(profile ?? null, 'identity') },
    { title: '我坚持什么', items: topProfileEntries(profile ?? null, 'principles') },
    { title: '我怎么做决定', items: topProfileEntries(profile ?? null, 'decision_rules') },
    { title: '我怎么工作', items: topProfileEntries(profile ?? null, 'workflows') },
    { title: '我怎么表达', items: topProfileEntries(profile ?? null, 'voice') },
    { title: '我不会怎么做', items: topProfileEntries(profile ?? null, 'boundaries') },
  ]
}

export function overviewFocusCards(project: ProjectDetail | null) {
  const profile = project?.profile
  return [
    {
      title: '核心原则',
      items: topProfileEntries(profile ?? null, 'principles', 2),
    },
    {
      title: '决策方式',
      items: topProfileEntries(profile ?? null, 'decision_rules', 2),
    },
    {
      title: '边界感',
      items: topProfileEntries(profile ?? null, 'boundaries', 2),
    },
  ]
}

export function llmMetaLines(meta: DistillationMeta | null) {
  if (!meta) return []
  const lines: string[] = []
  if (meta.llm_error) {
    lines.push(`最近一次 LLM 回退原因：${meta.llm_error}`)
  }
  if (meta.invalid_claims_dropped) {
    lines.push(`已自动忽略 ${meta.invalid_claims_dropped} 条不可靠或非法的 claims`)
  }
  return lines
}

export function publishChecklist(project: ProjectDetail | null) {
  const profile = project?.profile
  const selectedClaims =
    project?.claims.filter((claim) => claim.selected && claim.review_status !== 'rejected').length ?? 0

  return [
    {
      label: '核心原则',
      value: profile?.principles.length ?? 0,
      target: 3,
      status: (profile?.principles.length ?? 0) >= 3 ? '已就绪' : '建议补强',
    },
    {
      label: '决策规则',
      value: profile?.decision_rules.length ?? 0,
      target: 3,
      status: (profile?.decision_rules.length ?? 0) >= 3 ? '已就绪' : '建议补强',
    },
    {
      label: '边界规则',
      value: profile?.boundaries.length ?? 0,
      target: 2,
      status: (profile?.boundaries.length ?? 0) >= 2 ? '已就绪' : '建议补强',
    },
    {
      label: '有效 claims',
      value: selectedClaims,
      target: 8,
      status: selectedClaims >= 8 ? '已就绪' : '建议补强',
    },
  ]
}

export function publishPlatforms(project: ProjectDetail | null) {
  const ready = Boolean(project?.profile && (project?.claims.length ?? 0) > 0)
  return [
    {
      title: 'Cursor Skill',
      description: '适合在 Cursor 里作为本地技能包继续迭代优化。',
      readiness: ready ? '可导出' : '待蒸馏完成',
    },
    {
      title: 'Claude Skill',
      description: '适合导出成结构化 skill bundle，用于更稳定的规则注入。',
      readiness: ready ? '可导出' : '待蒸馏完成',
    },
    {
      title: 'Codex Skill',
      description: '适合 OpenAI / Codex 风格的任务试运行和工作流复用。',
      readiness: ready ? '可导出' : '待蒸馏完成',
    },
    {
      title: 'Local Bundle',
      description: '包含 evidence、rules、manifest 和 examples，方便本地归档。',
      readiness: ready ? '可导出' : '待蒸馏完成',
    },
  ]
}

export function exportedFilePreview(content: string, limit = 220) {
  return content.replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function previewResponse(prompt: string, project: ProjectDetail | null) {
  const profile = project?.profile
  if (!prompt.trim() || !profile) {
    return '先输入一个真实任务，系统会按当前分身协议给出试运行结果。'
  }

  const principles = topProfileEntries(profile, 'principles', 2)
  const workflows = topProfileEntries(profile, 'workflows', 2)
  const boundaries = topProfileEntries(profile, 'boundaries', 1)
  const voice = topProfileEntries(profile, 'voice', 1)

  return [
    `针对任务“${prompt.trim()}”，我会先给出判断，再给出拆解。`,
    principles.length ? `判断依据：${principles.join('；')}` : '',
    workflows.length ? `处理方式：${workflows.join('；')}` : '',
    boundaries.length ? `边界提醒：${boundaries.join('；')}` : '',
    voice.length ? `表达风格：${voice.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function understandingGroups(claims: ClaimSummary[]) {
  return [
    { title: '身份定位', key: 'identity', claims: claims.filter((claim) => claim.type === 'identity') },
    { title: '核心原则', key: 'principle', claims: claims.filter((claim) => claim.type === 'principle') },
    {
      title: '决策方式',
      key: 'decision_rule',
      claims: claims.filter((claim) => claim.type === 'decision_rule'),
    },
    { title: '工作方式', key: 'workflow', claims: claims.filter((claim) => claim.type === 'workflow') },
    { title: '表达风格', key: 'voice_pattern', claims: claims.filter((claim) => claim.type === 'voice_pattern') },
    { title: '边界', key: 'boundary', claims: claims.filter((claim) => claim.type === 'boundary') },
  ]
}

/** 仅保留 LLM 蒸馏产出的 claims。hybrid 下启发式条目标注为 heuristic 会被排除；旧数据无标注时仅当 meta 为「曾用纯 LLM 蒸馏」时整批保留。 */
export function claimsFromLlmDistillationOnly(
  claims: ClaimSummary[],
  meta: DistillationMeta | null | undefined,
): ClaimSummary[] {
  return claims.filter((claim) => {
    if (claim.distill_source === 'llm') return true
    if (claim.distill_source === 'heuristic') return false
    if (meta?.llm_used && meta.mode === 'llm') return true
    return false
  })
}
