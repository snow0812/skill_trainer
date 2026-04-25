import { useNavigate } from 'react-router-dom'

import { journeySnapshot } from '../lib/format'
import type { ProjectDetail } from '../types'
import { getRailStageKey, STAGE_RAIL, type RailStageKey } from '../lib/stages'
import type { StageAccessMap } from '../lib/format'

type Props = {
  pathname: string
  project: ProjectDetail | null
  stageAccess: StageAccessMap
}

function railUnlocked(
  key: RailStageKey,
  access: StageAccessMap,
  snapshot: ReturnType<typeof journeySnapshot>,
): boolean {
  if (key === 'release') return snapshot.releaseAvailable
  return access[key].unlocked
}

function railReason(
  key: RailStageKey,
  access: StageAccessMap,
  snapshot: ReturnType<typeof journeySnapshot>,
): string {
  if (key === 'release') {
    return snapshot.releaseAvailable ? '' : '需先完成校正与验证，形成稳定版本后再固化。'
  }
  return access[key].reason
}

export function StageRail({ pathname, project, stageAccess }: Props) {
  const navigate = useNavigate()
  const current = getRailStageKey(pathname)
  const snapshot = journeySnapshot(project)
  const order = STAGE_RAIL.map((s) => s.key)
  const curIdx = current ? order.indexOf(current) : -1

  return (
    <nav className="stage-rail" aria-label="主流程阶段">
      {STAGE_RAIL.map((step, i) => {
        const unlocked = railUnlocked(step.key, stageAccess, snapshot)
        const active = current === step.key
        const done = unlocked && curIdx >= 0 && i < curIdx
        const reason = railReason(step.key, stageAccess, snapshot)

        const cls = ['sr-item', active ? 'active' : '', done ? 'done' : '', unlocked ? '' : 'locked']
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={step.key}
            type="button"
            className={cls}
            disabled={!unlocked}
            title={unlocked ? step.title : reason}
            onClick={() => {
              if (unlocked) navigate(step.to)
            }}
          >
            <div className="sr-head">
              <span className="sr-num">{done ? '✓' : step.num}</span>
              <span className="sr-title">{step.title}</span>
            </div>
            <p className="sr-sub">{unlocked ? step.sub : reason}</p>
          </button>
        )
      })}
    </nav>
  )
}
