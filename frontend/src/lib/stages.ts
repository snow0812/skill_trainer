export type JourneyStageKey = 'start' | 'materials' | 'summary' | 'correction' | 'validation'

export type StageTask = { to: string; label: string }

export const STAGES: Array<{ key: JourneyStageKey; to: string; label: string }> = [
  { key: 'start', to: '/start', label: '开始' },
  { key: 'materials', to: '/materials', label: '材料' },
  { key: 'summary', to: '/summary', label: '理解' },
  { key: 'correction', to: '/correction/profile', label: '校正' },
  { key: 'validation', to: '/validation/manual', label: '验证' },
]

export const WORK_STAGES = STAGES.filter((stage) => stage.key !== 'start')

/** 侧栏当前阶段默认展开：主路径，减少并列入口 */
const STAGE_TASKS_PRIMARY: Record<JourneyStageKey, StageTask[]> = {
  start: [{ to: '/start', label: '开始页' }],
  materials: [
    { to: '/materials', label: '材料首页' },
    { to: '/materials/library', label: '资料库' },
  ],
  summary: [{ to: '/summary', label: '理解概览' }],
  correction: [{ to: '/correction/profile', label: '规则草稿' }],
  validation: [{ to: '/validation/manual', label: '手动验证' }],
}

/** 收进「本阶段更多」的补充步骤 */
const STAGE_TASKS_MORE: Record<JourneyStageKey, StageTask[]> = {
  start: [],
  materials: [],
  summary: [],
  correction: [
    { to: '/correction/signals', label: '候选信号' },
    { to: '/correction/claims', label: '校正系统判断' },
  ],
  validation: [],
}

/** 与「验证」分开展示，避免验证阶段列表过长 */
export const RELEASE_NAV_TASKS: StageTask[] = [
  { to: '/release', label: '固化当前版本' },
  { to: '/release/exports', label: '导出结果' },
]

export function getStagePrimaryTasks(stageKey: JourneyStageKey): StageTask[] {
  return STAGE_TASKS_PRIMARY[stageKey] ?? []
}

export function getStageMoreTasks(stageKey: JourneyStageKey): StageTask[] {
  return STAGE_TASKS_MORE[stageKey] ?? []
}

export function getStageKey(pathname: string): JourneyStageKey | null {
  if (pathname.startsWith('/start')) return 'start'
  if (pathname.startsWith('/materials')) return 'materials'
  if (pathname.startsWith('/summary')) return 'summary'
  if (pathname.startsWith('/correction')) return 'correction'
  if (pathname.startsWith('/validation')) return 'validation'
  return null
}

/** 顶栏阶段条：固化单独高亮 */
export type RailStageKey = JourneyStageKey | 'release'

export function getRailStageKey(pathname: string): RailStageKey | null {
  if (pathname.startsWith('/release')) return 'release'
  return getStageKey(pathname)
}

export const STAGE_RAIL: Array<{
  key: RailStageKey
  to: string
  title: string
  sub: string
  num: string
}> = [
  { key: 'start', to: '/start', title: '开始', sub: '项目与入口', num: '01' },
  { key: 'materials', to: '/materials', title: '材料', sub: '上传与蒸馏', num: '02' },
  { key: 'summary', to: '/summary', title: '理解', sub: '诊断概览', num: '03' },
  { key: 'correction', to: '/correction/profile', title: '校正', sub: '规则与判断', num: '04' },
  { key: 'validation', to: '/validation/manual', title: '验证', sub: '试运行与反馈', num: '05' },
  { key: 'release', to: '/release', title: '固化', sub: '导出与版本', num: '06' },
]

/** 兼容旧逻辑：主 + 更多合并为完整列表（不含固化区） */
export function getStageTasks(pathname: string): StageTask[] {
  const key = getStageKey(pathname)
  if (!key) return []
  return [...getStagePrimaryTasks(key), ...getStageMoreTasks(key)]
}
