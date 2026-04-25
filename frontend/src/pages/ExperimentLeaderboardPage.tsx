import { Link } from 'react-router-dom'

import { formatRelativeTime } from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function ExperimentLeaderboardPage() {
  const { patchQueue, evalJobs, loading, handleApplyPatchQueueItem, handleComparePatchQueueItem } = useStudio()

  const rankedItems = [...patchQueue]
    .filter((item) => item.experiment_result)
    .sort(
      (a, b) =>
        (b.experiment_result?.candidate_wins ?? 0) - (a.experiment_result?.candidate_wins ?? 0) ||
        (b.experiment_result?.score_delta ?? 0) - (a.experiment_result?.score_delta ?? 0) ||
        (a.experiment_result?.baseline_wins ?? 0) - (b.experiment_result?.baseline_wins ?? 0),
    )

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">05 / 验证 / 排行榜</div>
          <h1>统一看哪些微调建议真正提升了整体表现</h1>
          <p>这里按自动实验结果排序，优先让你查看胜率更高、整体更稳定的高价值微调建议。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/validation/patches" className="btn ghost">
            回建议池
          </Link>
        </div>
      </div>

      {rankedItems.length > 0 ? (
        <div className="col" style={{ gap: 16 }}>
          {rankedItems.map((item, index) => {
            const job = evalJobs.find(
              (entry) =>
                entry.kind === 'patch_compare' &&
                entry.patch_queue_item_id === item.id &&
                (entry.status === 'queued' || entry.status === 'running'),
            )
            const rerunLabel =
              job?.status === 'queued'
                ? '已排队…'
                : job?.status === 'running'
                  ? `评测中…（${job.completed_steps}/${job.total_steps}）`
                  : '重新评测'

            return (
              <article key={item.id} className="card">
                <div className="card-head">
                  <h3>
                    #{index + 1} {item.suggestion.title}
                  </h3>
                  <span className="card-sub">
                    {item.experiment_result?.candidate_wins} 胜 / {item.experiment_result?.baseline_wins} 负 / {item.experiment_result?.ties} 平
                  </span>
                </div>
                <p className="muted">
                  最近评测：{formatRelativeTime(item.experiment_result?.created_at)} · 总分差 {item.experiment_result?.score_delta}
                </p>
                <div className="twin-response" style={{ marginTop: 10, marginBottom: 12 }}>
                  "{item.suggestion.suggested_text}"
                </div>
                <div className="grid g-2">
                  {item.experiment_result?.task_results.map((task) => (
                    <article key={`${item.id}-${task.task_id}`} className="export-card">
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div className="ec-title">{task.task_title}</div>
                        <span
                          className={`badge-soft ${
                            task.winner === 'candidate' ? 'ok' : task.winner === 'baseline' ? 'danger' : 'warn'
                          }`}
                        >
                          {winnerLabel(task.winner)}
                        </span>
                      </div>
                      <div className="ec-sub">
                        微调后版本 {task.candidate_score} / 当前版本 {task.baseline_score}
                      </div>
                      <div className="muted">{task.rationale}</div>
                    </article>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
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
        <div className="empty">还没有已完成评测的微调建议。先去建议池跑自动实验。</div>
      )}
    </div>
  )
}

function winnerLabel(winner: 'baseline' | 'candidate' | 'tie') {
  if (winner === 'candidate') return '微调后更优'
  if (winner === 'baseline') return '当前版更优'
  return '两版接近'
}
