import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { dismissTip, isFlowNavCoachDismissed, TIP_FLOW_NAV_COACH } from '../lib/studio-onboarding'

export type FlowCoachStep = {
  anchorKey: string
  title: string
  body: string
}

/** 与侧栏 `stage.key` 及 `release` 锚点一致 */
export const FLOW_COACH_STEPS: FlowCoachStep[] = [
  {
    anchorKey: 'materials',
    title: '材料',
    body: '上传资料、补齐缺口；无规则时「首次蒸馏」，之后补资料用「重新蒸馏」。侧栏可进资料库。',
  },
  {
    anchorKey: 'summary',
    title: '理解',
    body: '在「理解诊断」里只读查看系统当前怎么描述你，并决定下一步该把什么内容写进规则草稿。',
  },
  {
    anchorKey: 'correction',
    title: '校正',
    body: '优先在规则草稿里写入最终会生效的内容；候选信号页与系统判断页只负责提供辅助输入与依据。',
  },
  {
    anchorKey: 'validation',
    title: '验证',
    body: '在验证工作台里用真实任务试运行，把偏差变成微调建议，先自动试跑比较，再把值得采纳的内容写回规则草稿。',
  },
  {
    anchorKey: 'release',
    title: '固化与导出',
    body: '版本稳定后在此固化并导出可用产物（需完成前置阶段后才会解锁）。',
  },
]

type FlowNavCoachTipsProps = {
  anchorsRef: React.MutableRefObject<Record<string, HTMLElement | null>>
  steps: FlowCoachStep[]
  onActiveAnchorKey: (key: string | null) => void
}

export function FlowNavCoachTips({ anchorsRef, steps, onActiveAnchorKey }: FlowNavCoachTipsProps) {
  const [open, setOpen] = useState(() => !isFlowNavCoachDismissed())
  const [stepIndex, setStepIndex] = useState(0)
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const step = steps[stepIndex]
  const isLast = steps.length > 0 && stepIndex >= steps.length - 1

  const finish = useCallback(() => {
    dismissTip(TIP_FLOW_NAV_COACH)
    onActiveAnchorKey(null)
    setOpen(false)
  }, [onActiveAnchorKey])

  const goNext = useCallback(() => {
    if (isLast) {
      finish()
      return
    }
    setStepIndex((i) => i + 1)
  }, [finish, isLast])

  useEffect(() => {
    if (!open) {
      onActiveAnchorKey(null)
      return
    }
    if (step) {
      onActiveAnchorKey(step.anchorKey)
    }
  }, [open, step, stepIndex, onActiveAnchorKey])

  const updateBubblePosition = useCallback(() => {
    if (!open || !step) return
    const el = anchorsRef.current[step.anchorKey]
    if (!el) {
      setBubbleStyle({ visibility: 'hidden' })
      return
    }
    const rect = el.getBoundingClientRect()
    const gap = 12
    const width = 300
    let left = rect.right + gap
    let top = rect.top
    if (left + width > window.innerWidth - 16) {
      left = Math.max(16, rect.left - width - gap)
    }
    if (top + 200 > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - 220)
    }
    setBubbleStyle({
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 220,
      visibility: 'visible',
    })
  }, [anchorsRef, open, step])

  useLayoutEffect(() => {
    updateBubblePosition()
  }, [updateBubblePosition, stepIndex])

  useEffect(() => {
    if (!open) return
    const onResize = () => updateBubblePosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, updateBubblePosition])

  useEffect(() => {
    if (!open || !steps.length) return
    if (stepIndex >= steps.length) {
      setStepIndex(0)
    }
  }, [open, steps.length, stepIndex])

  if (!open || !steps.length || !step) return null

  return createPortal(
    <div
        className="flow-coach-bubble panel"
        style={bubbleStyle}
        role="dialog"
        aria-labelledby="flow-coach-title"
      >
        <p className="eyebrow">
          引导 {stepIndex + 1}/{steps.length}
        </p>
        <h2 id="flow-coach-title" className="flow-coach-bubble-title">
          {step.title}
        </h2>
        <p className="muted flow-coach-bubble-body">{step.body}</p>
        <div className="flow-coach-bubble-actions">
          <button type="button" className="secondary flow-coach-skip" onClick={finish}>
            跳过
          </button>
          <button type="button" className="flow-coach-next" onClick={goNext}>
            {isLast ? '完成' : '下一步'}
          </button>
        </div>
      </div>,
    document.body,
  )
}
