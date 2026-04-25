import { Link, useLocation } from 'react-router-dom'

import { formatRelativeTime, hasUnsavedProfileChanges } from '../lib/format'
import { useStudio } from '../lib/studio-context'
import type { EvalJobStatus, PatchQueueItem } from '../types'

type ExperimentTab = 'overview' | 'patches' | 'results'

export function AutoExperimentPage() {
  const location = useLocation()
  const {
    activeProject,
    editableProfile,
    loading,
    loadingReason,
    benchmarkRunHistory,
    patchQueue,
    evalJobs,
    benchmarkTasks,
    handleRegenerateBenchmarkTasks,
    handleRunBenchmarkSuite,
    handleGenerateBenchmarkSuggestions,
    handleApplyPatchQueueItem,
    handleDismissPatchQueueItem,
    handleComparePatchQueueItem,
    handleComparePendingPatches,
  } = useStudio()

  const dirty = hasUnsavedProfileChanges(activeProject, editableProfile)
  const pendingPatches = patchQueue.filter((item) => item.status === 'pending').length
  const reviewedPatches = patchQueue.filter((item) => Boolean(item.experiment_result)).length
  const latestBenchmarkBaseRuns = benchmarkRunHistory.filter((item) => item.kind === 'benchmark_base' && !item.source_patch_id)
  const activeBenchmarkJob = evalJobs.find(
    (job) => job.kind === 'benchmark_suite' && (job.status === 'queued' || job.status === 'running'),
  )
  const recentEvalJobs = evalJobs
    .filter((job) => job.kind === 'benchmark_suite' || job.kind === 'patch_compare')
    .slice(0, 8)
  const rankedItems = rankedPatchItems(patchQueue)
  const pendingItems = patchQueue.filter((item) => item.status === 'pending')
  const activePatchJobs = evalJobs.filter(
    (job) => job.kind === 'patch_compare' && (job.status === 'queued' || job.status === 'running'),
  )
  const queueablePendingItems = pendingItems.filter(
    (item) => !activePatchJobs.some((job) => job.patch_queue_item_id === item.id),
  )
  const tab = getExperimentTab(location.pathname)
  const nextAction = primaryActionMeta({
    dirty,
    benchmarkTasksCount: benchmarkTasks.length,
    activeBenchmarkJob,
    latestBenchmarkBaseRunsCount: latestBenchmarkBaseRuns.length,
    pendingPatches,
    reviewedPatches,
    loading,
    loadingReason,
    handleRegenerateBenchmarkTasks,
    handleRunBenchmarkSuite,
    handleGenerateBenchmarkSuggestions,
  })

  function patchJobFor(itemId: string) {
    return evalJobs.find(
      (job) =>
        job.kind === 'patch_compare' &&
        job.patch_queue_item_id === itemId &&
        (job.status === 'queued' || job.status === 'running'),
    )
  }

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">自动实验</div>
          <h1>把这一版放进一组固定任务里看整体表现</h1>
          <p>自动实验从验证里单独拿出来，只负责三件事：准备固定任务集、比较候选改动、汇总值得采纳的结果。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/validation/manual" className="btn ghost">
            回手动验证
          </Link>
        </div>
      </div>

      <div className="substage" style={{ marginBottom: 18 }}>
        <Link to="/experiments" className={`btn sm ghost${tab === 'overview' ? ' on' : ''}`}>
          概览
        </Link>
        <Link to="/experiments/patches" className={`btn sm ghost${tab === 'patches' ? ' on' : ''}`}>
          待比较建议
        </Link>
        <Link to="/experiments/results" className={`btn sm ghost${tab === 'results' ? ' on' : ''}`}>
          实验结果
        </Link>
      </div>

      {dirty ? (
        <section className="card active-card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>你还有未保存的规则修改</h3>
            <span className="card-sub">自动实验仍会使用旧版</span>
          </div>
          <p className="muted">先保存规则草稿，再回来做自动实验，否则这轮比较用的仍然是旧版规则。</p>
          <Link to="/correction/profile" className="btn sm ghost">
            现在去保存规则草稿
          </Link>
        </section>
      ) : null}

      {tab === 'overview' ? (
        <>
          <div className="grid g-2" style={{ marginBottom: 18 }}>
            <section className="card active-card">
              <div className="card-head">
                <h3>下一步</h3>
                <span className="card-sub">只保留一个主动作</span>
              </div>
              <div style={{ fontSize: 16, color: 'var(--fg-0)', fontWeight: 500, lineHeight: 1.35 }}>{nextAction.title}</div>
              <p className="muted" style={{ marginTop: 8 }}>{nextAction.description}</p>
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {nextAction.kind === 'link' ? (
                  <Link to={nextAction.href} className="btn accent">
                    {nextAction.label}
                  </Link>
                ) : (
                  <button type="button" className="btn accent" disabled={nextAction.disabled} onClick={() => void nextAction.onClick?.()}>
                    {nextAction.label}
                  </button>
                )}
                {!dirty && benchmarkTasks.length > 0 ? (
                  <button type="button" className="btn ghost" disabled={loading} onClick={() => void handleRegenerateBenchmarkTasks()}>
                    {loadingReason === 'regenerateBenchmarkTasks' ? '生成中…' : '重建任务集'}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h3>当前状态</h3>
                <span className="card-sub">基线 → 建议 → 结果</span>
              </div>
              <div className="grid g-2" style={{ gap: 10 }}>
                <StatCard label="评测任务集" value={benchmarkTasks.length} sub="固定任务数量" />
                <StatCard label="基线结果" value={latestBenchmarkBaseRuns.length} sub="当前版本已跑完" />
                <StatCard label="待比较建议" value={pendingPatches} sub="等待自动比较" />
                <StatCard label="已出结果" value={reviewedPatches} sub="可进入实验结果" />
              </div>
            </section>
          </div>

          <section className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <h3>这组固定任务会拿来反复跑</h3>
              <span className="card-sub">{benchmarkTasks.length} 题</span>
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              它不会临时乱测，而是反复用这一组任务看当前版本和候选改动的表现差异。
            </p>
            {benchmarkTasks.length > 0 ? (
              <div className="grid g-2">
                {benchmarkTasks.slice(0, 4).map((task) => (
                  <article key={task.id} className="export-card">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="ec-title">{task.title}</div>
                      <span className="badge-soft">{task.scenario}</span>
                    </div>
                    <div className="muted">{truncate(task.prompt, 110)}</div>
                    {task.source_hint ? <div className="ec-sub">检验重点：{task.source_hint}</div> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">还没有任务集。先生成一组固定评测任务，再开始自动实验。</div>
            )}
          </section>

          <div className="grid g-2">
            <section className="card">
              <div className="card-head">
                <h3>最近实验状态</h3>
                <span className="card-sub">{recentEvalJobs.length}</span>
              </div>
              {recentEvalJobs.length > 0 ? (
                <div>
                  {recentEvalJobs.map((job) => (
                    <div key={job.id} className="list-row">
                      <div className="flex1">
                        <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{job.title}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }}>
                          {formatRelativeTime(job.created_at)}
                          {job.total_steps > 0 ? ` · ${job.completed_steps}/${job.total_steps}` : ''}
                        </div>
                      </div>
                      <span className={`badge-soft ${jobBadgeTone(job.status)}`}>{jobStatusLabel(job.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">还没有实验任务。完成一次基线评测后，这里会出现进度和结果。</div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h3>接下来会怎么走</h3>
                <span className="card-sub">先基线，再比较建议</span>
              </div>
              <div className="col" style={{ gap: 10 }}>
                <article className={`card${benchmarkTasks.length > 0 ? ' active-card' : ''}`}>
                  <strong>1. 准备一组固定任务</strong>
                  <p className="muted">没有任务集就没法做稳定比较。先生成，再反复复用。</p>
                </article>
                <article className={`card${latestBenchmarkBaseRuns.length > 0 ? ' active-card' : ''}`}>
                  <strong>2. 跑当前版本基线</strong>
                  <p className="muted">先知道当前版本在这组任务上的表现，后面才有“提升了没有”的参照。</p>
                </article>
                <article className={`card${pendingPatches > 0 || reviewedPatches > 0 ? ' active-card' : ''}`}>
                  <strong>3. 生成并比较少量候选改动</strong>
                  <p className="muted">把重复暴露的问题收敛成少量建议，再看哪些建议真的能提升整体表现。</p>
                </article>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {tab === 'patches' ? (
        <div className="card">
          <div className="card-head">
            <h3>待比较建议</h3>
            <span className="card-sub">{pendingItems.length}</span>
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            这里统一看待比较的微调建议。先批量比较，再决定哪些值得你真正采纳。
          </p>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className="btn"
              disabled={queueablePendingItems.length === 0}
              onClick={() => void handleComparePendingPatches()}
            >
              批量比较待审建议（{queueablePendingItems.length}）
            </button>
            <Link to="/experiments/results" className="btn ghost">
              去看实验结果
            </Link>
          </div>
          {pendingItems.length > 0 ? (
            <div className="grid g-2">
              {pendingItems.map((item) => {
                const job = patchJobFor(item.id)
                const compareLabel =
                  job?.status === 'queued'
                    ? '已排队…'
                    : job?.status === 'running'
                      ? `评测中…（${job.completed_steps}/${job.total_steps}）`
                      : '跑自动比较'
                return (
                  <article key={item.id} className="export-card">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div className="ec-title">{item.suggestion.title}</div>
                        <div className="ec-sub">
                          来源：{item.source_feedback} · {item.source_scenario} · {formatRelativeTime(item.created_at)}
                        </div>
                      </div>
                      <span className="badge-soft accent">{item.suggestion.section}</span>
                    </div>
                    <div className="muted">{item.suggestion.suggested_text}</div>
                    <div className="muted">{item.suggestion.reason}</div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn sm" disabled={Boolean(job)} onClick={() => void handleComparePatchQueueItem(item.id)}>
                        {compareLabel}
                      </button>
                      <button type="button" className="btn sm ghost" disabled={loading} onClick={() => void handleApplyPatchQueueItem(item.id)}>
                        直接采纳
                      </button>
                      <button type="button" className="btn sm ghost" disabled={loading} onClick={() => handleDismissPatchQueueItem(item.id)}>
                        暂不处理
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty">当前没有待比较建议。去跑一次手动验证，或先从实验结果里生成建议。</div>
          )}
        </div>
      ) : null}

      {tab === 'results' ? (
        <div className="card">
          <div className="card-head">
            <h3>实验结果</h3>
            <span className="card-sub">{rankedItems.length}</span>
          </div>
          <p className="muted" style={{ marginBottom: 12 }}>
            这里统一看哪些微调建议真正提升了整体表现，优先看胜率更高、整体更稳定的高价值改动。
          </p>
          {rankedItems.length > 0 ? (
            <div className="col" style={{ gap: 16 }}>
              {rankedItems.map((item, index) => {
                const job = patchJobFor(item.id)
                const rerunLabel =
                  job?.status === 'queued'
                    ? '已排队…'
                    : job?.status === 'running'
                      ? `评测中…（${job.completed_steps}/${job.total_steps}）`
                      : '重新评测'
                return (
                  <article key={item.id} className="export-card">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="ec-title">
                        #{index + 1} {item.suggestion.title}
                      </div>
                      <span className="badge-soft ok">
                        {item.experiment_result?.candidate_wins} 胜 / {item.experiment_result?.baseline_wins} 负 / {item.experiment_result?.ties} 平
                      </span>
                    </div>
                    <div className="ec-sub">
                      最近评测：{formatRelativeTime(item.experiment_result?.created_at)} · 总分差 {item.experiment_result?.score_delta}
                    </div>
                    <div className="twin-response">"{item.suggestion.suggested_text}"</div>
                    <div className="grid g-2">
                      {item.experiment_result?.task_results.slice(0, 4).map((task) => (
                        <article key={`${item.id}-${task.task_id}`} className="card">
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 12.5, color: 'var(--fg-0)', fontWeight: 500 }}>{task.task_title}</div>
                            <span className={`badge-soft ${task.winner === 'candidate' ? 'ok' : task.winner === 'baseline' ? 'danger' : 'warn'}`}>
                              {winnerLabel(task.winner)}
                            </span>
                          </div>
                          <div className="muted" style={{ marginTop: 6 }}>
                            微调后 {task.candidate_score} / 当前版 {task.baseline_score}
                          </div>
                          <div className="muted" style={{ marginTop: 6 }}>{task.rationale}</div>
                        </article>
                      ))}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button type="button" className="btn sm accent" disabled={loading} onClick={() => void handleApplyPatchQueueItem(item.id)}>
                        写入规则草稿
                      </button>
                      <button type="button" className="btn sm ghost" disabled={Boolean(job)} onClick={() => void handleComparePatchQueueItem(item.id)}>
                        {rerunLabel}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty">还没有已完成评测的微调建议。先去待比较建议里跑自动比较。</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function getExperimentTab(pathname: string): ExperimentTab {
  if (pathname.startsWith('/experiments/patches')) return 'patches'
  if (pathname.startsWith('/experiments/results')) return 'results'
  return 'overview'
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="cov-item">
      <div className="cov-label">{label}</div>
      <div className="mono" style={{ fontSize: 22, color: 'var(--fg-0)', fontWeight: 500 }}>
        {value}
      </div>
      <div className="cov-gap">{sub}</div>
    </div>
  )
}

function rankedPatchItems(queue: PatchQueueItem[]) {
  return [...queue]
    .filter((item) => item.experiment_result)
    .sort(
      (a, b) =>
        (b.experiment_result?.candidate_wins ?? 0) - (a.experiment_result?.candidate_wins ?? 0) ||
        (b.experiment_result?.score_delta ?? 0) - (a.experiment_result?.score_delta ?? 0) ||
        (a.experiment_result?.baseline_wins ?? 0) - (b.experiment_result?.baseline_wins ?? 0),
    )
}

function truncate(text: string, max: number) {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function jobStatusLabel(status: EvalJobStatus) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '进行中'
  if (status === 'completed') return '已完成'
  return '失败'
}

function jobBadgeTone(status: EvalJobStatus) {
  if (status === 'completed') return 'ok'
  if (status === 'failed') return 'danger'
  return 'warn'
}

function winnerLabel(winner: 'baseline' | 'candidate' | 'tie') {
  if (winner === 'candidate') return '微调后更优'
  if (winner === 'baseline') return '当前版更优'
  return '两版接近'
}

function primaryActionTitle({
  dirty,
  benchmarkTasksCount,
  activeBenchmarkJob,
  latestBenchmarkBaseRunsCount,
  pendingPatches,
  reviewedPatches,
}: {
  dirty: boolean
  benchmarkTasksCount: number
  activeBenchmarkJob: boolean
  latestBenchmarkBaseRunsCount: number
  pendingPatches: number
  reviewedPatches: number
}) {
  if (dirty) return '先保存这版规则，再跑自动实验'
  if (benchmarkTasksCount === 0) return '先准备评测任务集'
  if (activeBenchmarkJob) return '当前有自动实验任务正在执行'
  if (latestBenchmarkBaseRunsCount === 0) return '先跑一轮当前版本自动实验'
  if (pendingPatches === 0) return '现在可以从实验结果生成微调建议'
  if (reviewedPatches > 0) return '现在去看最值得采纳的实验结果'
  return '现在去看待比较的微调建议'
}

function primaryActionDescription({
  dirty,
  benchmarkTasksCount,
  activeBenchmarkJob,
  latestBenchmarkBaseRunsCount,
  pendingPatches,
  reviewedPatches,
}: {
  dirty: boolean
  benchmarkTasksCount: number
  activeBenchmarkJob: boolean
  latestBenchmarkBaseRunsCount: number
  pendingPatches: number
  reviewedPatches: number
}) {
  if (dirty) return '自动实验只会使用已保存规则；先保存，后面的评测结论才有意义。'
  if (benchmarkTasksCount === 0) return '没有任务集就无法批量评测；先生成任务集，再开始自动实验。'
  if (activeBenchmarkJob) return '这时不需要再点别的主动作，先等系统把这轮评测跑完。'
  if (latestBenchmarkBaseRunsCount === 0) return '先拿到当前版本在评测集上的基线表现，后面才能自动筛建议。'
  if (pendingPatches === 0) return '基线结果已经有了，下一步是把重复暴露的问题收敛成少量高价值微调建议。'
  if (reviewedPatches > 0) return '已经有建议拿到实验结果，优先只看胜率更高、整体更稳的改动。'
  return '建议已经进池，但还没有排出高价值结果；下一步先看待比较建议。'
}

function primaryActionMeta({
  dirty,
  benchmarkTasksCount,
  activeBenchmarkJob,
  latestBenchmarkBaseRunsCount,
  pendingPatches,
  reviewedPatches,
  loading,
  loadingReason,
  handleRegenerateBenchmarkTasks,
  handleRunBenchmarkSuite,
  handleGenerateBenchmarkSuggestions,
}: {
  dirty: boolean
  benchmarkTasksCount: number
  activeBenchmarkJob:
    | {
        status: 'queued' | 'running' | 'completed' | 'failed'
        completed_steps: number
        total_steps: number
      }
    | undefined
  latestBenchmarkBaseRunsCount: number
  pendingPatches: number
  reviewedPatches: number
  loading: boolean
  loadingReason: string | null
  handleRegenerateBenchmarkTasks: () => Promise<void>
  handleRunBenchmarkSuite: () => Promise<void>
  handleGenerateBenchmarkSuggestions: () => Promise<void>
}) {
  const title = primaryActionTitle({
    dirty,
    benchmarkTasksCount,
    activeBenchmarkJob: Boolean(activeBenchmarkJob),
    latestBenchmarkBaseRunsCount,
    pendingPatches,
    reviewedPatches,
  })
  const description = primaryActionDescription({
    dirty,
    benchmarkTasksCount,
    activeBenchmarkJob: Boolean(activeBenchmarkJob),
    latestBenchmarkBaseRunsCount,
    pendingPatches,
    reviewedPatches,
  })

  if (dirty) {
    return { kind: 'link' as const, title, description, label: '先去保存规则草稿', href: '/correction/profile' }
  }
  if (benchmarkTasksCount === 0) {
    return {
      kind: 'button' as const,
      title,
      description,
      label: loadingReason === 'regenerateBenchmarkTasks' ? '生成中…' : '先生成评测任务集',
      disabled: loading,
      onClick: handleRegenerateBenchmarkTasks,
    }
  }
  if (activeBenchmarkJob) {
    return {
      kind: 'button' as const,
      title,
      description,
      label:
        activeBenchmarkJob.status === 'queued'
          ? '评测任务已排队…'
          : `自动实验进行中…（${activeBenchmarkJob.completed_steps}/${activeBenchmarkJob.total_steps}）`,
      disabled: true,
    }
  }
  if (latestBenchmarkBaseRunsCount === 0) {
    return {
      kind: 'button' as const,
      title,
      description,
      label: '跑当前版本自动实验',
      disabled: false,
      onClick: handleRunBenchmarkSuite,
    }
  }
  if (pendingPatches === 0) {
    return {
      kind: 'button' as const,
      title,
      description,
      label: loadingReason === 'benchmarkSuggestions' ? '生成中…' : '从实验结果生成微调建议',
      disabled: loading,
      onClick: handleGenerateBenchmarkSuggestions,
    }
  }
  if (reviewedPatches > 0) {
    return { kind: 'link' as const, title, description, label: '去看实验结果', href: '/experiments/results' }
  }
  return { kind: 'link' as const, title, description, label: '去待比较建议', href: '/experiments/patches' }
}
