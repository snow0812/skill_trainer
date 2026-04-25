import { NavLink, useLocation } from 'react-router-dom'

type ValidationFlowNavProps = {
  hasPreviewResult: boolean
  pendingSuggestions: number
  reviewedSuggestions: number
}

const PRIMARY_PAGES = [
  {
    to: '/validation/manual',
    label: '手动验证',
    description: '自己写真实任务，先看这一版输出。',
  },
  {
    to: '/experiments',
    label: '自动实验',
    description: '让评测集批量触发，异步返回实验结论。',
  },
]

export function ValidationFlowNav({
  hasPreviewResult,
  pendingSuggestions,
  reviewedSuggestions,
}: ValidationFlowNavProps) {
  const location = useLocation()
  const activePage =
    PRIMARY_PAGES.find((page) => location.pathname === page.to) ??
    (location.pathname.startsWith('/validation/feedback') ? PRIMARY_PAGES[0] : PRIMARY_PAGES[1])
  const helper =
    location.pathname.startsWith('/validation/manual')
      ? hasPreviewResult
        ? '先判断这次输出像不像你；如果不像，再进入处理反馈。'
        : '这里先做一件事：跑一次真实任务，拿到当前版本输出。'
      : location.pathname.startsWith('/validation/feedback')
        ? pendingSuggestions > 0
          ? `反馈已经生成建议；当前有 ${pendingSuggestions} 条待审微调建议。`
          : '这里是手动验证后的上下文页，用来把偏差变成微调建议。'
        : location.pathname.startsWith('/experiments')
          ? reviewedSuggestions > 0
            ? `当前已有 ${reviewedSuggestions} 条建议拿到实验结果，可继续只看高价值改动。`
            : '这里先做一件事：新建评测任务，等待系统异步返回实验结论。'
          : location.pathname.startsWith('/experiments/patches') || location.pathname.startsWith('/experiments/results')
            ? `这里是自动实验链路里的建议池；当前有 ${pendingSuggestions} 条待比较建议。`
            : '这里是自动实验链路里的结果页，只保留值得你人工确认的改动。'

  return (
    <section className="panel validation-flow-card">
      <div className="panel-title">
        <h2>验证导航</h2>
        <span>{activePage.label}</span>
      </div>
      <div className="validation-flow-nav">
        {PRIMARY_PAGES.map((page) => {
          return (
            <NavLink
              key={page.to}
              to={page.to}
              className={({ isActive }) =>
                isActive ? 'validation-flow-step validation-flow-step-active' : 'validation-flow-step'
              }
            >
              <strong>{page.label}</strong>
              <span>{page.description}</span>
            </NavLink>
          )
        })}
      </div>
      <p className="muted validation-flow-helper">{helper}</p>
    </section>
  )
}
