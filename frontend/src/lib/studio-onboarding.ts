const STORAGE_KEY = 'studio-onboarding-v1'

/** 旧版 localStorage tip id，读取时迁移到 {@link TIP_SHELL_PRIMARY_CTA_INTRO} */
const LEGACY_TIP_TOPBAR_NEXT = 'topbar_next'

/** 旧版：主按钮说明 tip（已无独立 UI，保留 id 兼容已 dismiss 的本地数据） */
export const TIP_SHELL_PRIMARY_CTA_INTRO = 'shell_primary_cta_intro'

/** 旧版：居中弹层阶段说明（已由分步 coach 替代，保留 id 表示已看过引导） */
export const TIP_SHELL_STAGES_INTRO = 'shell_stages_intro'

/** 侧栏流程分步 coach，完成后不再展示 */
export const TIP_FLOW_NAV_COACH = 'flow_nav_coach_v1'

type StoredState = {
  version: 1
  dismissedTips: string[]
}

function save(state: StoredState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function migrateLegacyTips(state: StoredState): StoredState {
  if (!state.dismissedTips.includes(LEGACY_TIP_TOPBAR_NEXT)) return state
  const migrated: StoredState = {
    version: 1,
    dismissedTips: [
      ...state.dismissedTips.filter((id) => id !== LEGACY_TIP_TOPBAR_NEXT),
      TIP_SHELL_PRIMARY_CTA_INTRO,
    ],
  }
  save(migrated)
  return migrated
}

function load(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, dismissedTips: [] }
    const parsed = JSON.parse(raw) as StoredState
    if (parsed?.version !== 1 || !Array.isArray(parsed.dismissedTips)) {
      return { version: 1, dismissedTips: [] }
    }
    return migrateLegacyTips(parsed)
  } catch {
    return { version: 1, dismissedTips: [] }
  }
}

export function isTipDismissed(tipId: string): boolean {
  return load().dismissedTips.includes(tipId)
}

export function dismissTip(tipId: string): void {
  const s = load()
  if (s.dismissedTips.includes(tipId)) return
  s.dismissedTips.push(tipId)
  save(s)
}

/** 是否已完成/跳过流程分步引导（含旧版居中弹层） */
export function isFlowNavCoachDismissed(): boolean {
  if (isTipDismissed(TIP_FLOW_NAV_COACH)) return true
  if (isTipDismissed(TIP_SHELL_STAGES_INTRO)) return true
  return false
}
