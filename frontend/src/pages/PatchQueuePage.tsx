import { Link } from 'react-router-dom'

import { formatRelativeTime } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function PatchQueuePage() {
  const {
    patchQueue,
    evalJobs,
    loading,
    handleApplyPatchQueueItem,
    handleDismissPatchQueueItem,
    handleComparePatchQueueItem,
    handleComparePendingPatches,
  } = useStudio()

  const pendingItems = patchQueue.filter((item) => item.status === 'pending')
  const activePatchJobs = evalJobs.filter(
    (job) => job.kind === 'patch_compare' && (job.status === 'queued' || job.status === 'running'),
  )
  const queueablePendingItems = pendingItems.filter(
    (item) => !activePatchJobs.some((job) => job.patch_queue_item_id === item.id),
  )

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
          <div className="eyebrow">05 / 验证 / 建议池</div>
          <h1>先把微调建议排队，再决定哪些值得你看</h1>
          <p>这里集中看来自手动反馈和自动实验的微调建议；建议先批量比较，再只看真正提升整体表现的改动。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={queueablePendingItems.length === 0}
            onClick={() => void handleComparePendingPatches()}
          >
            批量比较待审建议（{queueablePendingItems.length}）
          </button>
          <Link to="/validation/leaderboard" className="btn ghost">
            查看排行榜
          </Link>
        </div>
      </div>

      {pendingItems.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>建议池</h3>
            <span className="card-sub">{pendingItems.length}</span>
          </div>
          <div className="grid g-2">
            {pendingItems.map((item) => {
              const job = patchJobFor(item.id)
              const compareLabel =
                job?.status === 'queued'
                  ? '已排队…'
                  : job?.status === 'running'
                    ? `评测中…（${job.completed_steps}/${job.total_steps}）`
                    : '跑自动实验'
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
                  <div className="muted">来源任务：{item.source_prompt}</div>
                  {item.source_feedback_note ? <div className="muted">补充说明：{item.source_feedback_note}</div> : null}
                  {item.experiment_result ? (
                    <div className="muted">
                      最近比较结果：微调后 {item.experiment_result.candidate_wins} 胜 / 当前版 {item.experiment_result.baseline_wins} 胜
                    </div>
                  ) : null}
                  <div className="row" style={{ gap: 8 }}>
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
        </div>
      ) : (
        <div className="empty">当前没有待审微调建议。去跑一次手动验证，或先做一轮自动实验，都可以把新建议送进这里。</div>
      )}
    </div>
  )
}
