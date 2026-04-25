import { Link } from 'react-router-dom'

import {
  compareProfileSections,
  formatRelativeTime,
  hasUnsavedProfileChanges,
  isPublishReady,
  topProfileEntries,
} from '../lib/format'
import { PersonaGlyph } from '../components/PersonaGlyph'
import { useStudio } from '../lib/studio-context'

const SCENARIOS = [
  {
    title: '写回复',
    prompt: '帮我回这条合作邀请，要求像我一样先判断合作价值，再控制承诺边界。',
  },
  {
    title: '做判断',
    prompt: '你现在看到一个新机会，请先判断是不是值得投入，再说明依据和边界。',
  },
  {
    title: '写方案',
    prompt: '把这个模糊想法整理成一页可执行方案，保持我的表达风格和决策逻辑。',
  },
  {
    title: '拆任务',
    prompt: '请把这个目标拆成可执行步骤，体现我通常的推进节奏与优先级判断。',
  },
]

export function PreviewRunPage() {
  const {
    activeProject,
    editableProfile,
    loading,
    loadingReason,
    previewPrompt,
    previewScenario,
    manualPreviewResult,
    patchQueue,
    savedProfileVersionMeta,
    previousSavedProfileSnapshot,
    setPreviewPrompt,
    setPreviewScenario,
    handleRunPreview,
    handleGeneratePreviewFeedback,
  } = useStudio()
  const dirty = hasUnsavedProfileChanges(activeProject, editableProfile)
  const hasPreviewResult = Boolean(manualPreviewResult?.response)
  const publishReady = isPublishReady(activeProject)
  const profileDiff = compareProfileSections(activeProject?.profile ?? null, previousSavedProfileSnapshot?.profile ?? null)
  const pendingPatches = patchQueue.filter((item) => item.status === 'pending').length
  const reviewedPatches = patchQueue.filter((item) => Boolean(item.experiment_result)).length

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">05 / 验证</div>
          <h1>让它接一个真任务</h1>
          <p>不像的地方点一下「不太像 / 太保守 / 逻辑不对」，会自动回流到反馈与微调建议。校正和验证之间反复几次，它就会稳下来。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/correction/profile" className="btn ghost">
            回校正
          </Link>
          <Link to="/release" className="btn primary">
            这版够稳了，去固化 →
          </Link>
        </div>
      </div>

      {dirty ? (
        <div className="card active-card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <h3>你还有未保存的规则修改</h3>
            <span className="card-sub">当前验证仍在用旧版</span>
          </div>
          <p className="muted">先去规则草稿保存，再回来跑验证，否则这次试运行不会反映你刚改的内容。</p>
        </div>
      ) : null}

      <div className="val-stage">
        <div className="val-card panel">
          <div className="vc-head">
            <h3>
              <span style={{ color: 'var(--fg-3)' }}>▸</span> 你
            </h3>
            <span className="badge-soft">当前规则本</span>
          </div>
          <div className="vc-body">
            <div className="eyebrow">选一个真实场景</div>
            <div className="scenario-pills">
              {SCENARIOS.map((scenario) => (
                <span
                  key={scenario.title}
                  className={`pill${previewScenario === scenario.title ? ' on' : ''}`}
                  onClick={() => {
                    setPreviewScenario(scenario.title)
                    setPreviewPrompt(scenario.prompt)
                  }}
                >
                  {scenario.title}
                </span>
              ))}
            </div>
            <div className="eyebrow" style={{ marginTop: 6 }}>
              具体输入
            </div>
            <textarea
              value={previewPrompt}
              onChange={(event) => setPreviewPrompt(event.target.value)}
              rows={7}
              placeholder="写一个你最在意的真实任务。"
            />
            <div className="row" style={{ marginTop: 'auto', gap: 8 }}>
              <button
                className="btn accent"
                type="button"
                onClick={() => void handleRunPreview()}
                disabled={loading || !activeProject?.profile || !previewPrompt.trim() || dirty}
              >
                {dirty
                  ? '先保存规则草稿'
                  : loadingReason === 'runPreview'
                    ? '它在想…'
                    : '让它回一下 ⏎'}
              </button>
              <span className="muted" style={{ fontSize: 11 }}>
                也可以对比上一版
              </span>
              <Link to="/experiments" className="btn sm ghost" style={{ marginLeft: 'auto' }}>
                改看自动实验
              </Link>
            </div>
          </div>
        </div>

        <div className="val-card panel">
          <div className="vc-head">
            <h3>
              <PersonaGlyph maturity={0.62} size={18} />
              它（你的分身）
            </h3>
            {hasPreviewResult ? <span className="badge-soft ok">响应生成</span> : null}
          </div>
          <div className="vc-body">
            {loadingReason === 'runPreview' ? (
              <div className="empty">正在按你的规则本起草回复…</div>
            ) : !hasPreviewResult ? (
              <div className="empty">选一个场景，让它试一下。</div>
            ) : (
              <>
                <div className="twin-response">"{manualPreviewResult?.response}"</div>
                <div className="reason-trace">
                  <div className="rt-label">它为什么这样回（按规则本）</div>
                  {(Object.entries(manualPreviewResult?.reason_trace ?? {}) as Array<[string, string[]]>).flatMap(([key, items]) =>
                    items.map((item: string, index: number) => (
                      <div key={`${key}-${index}`} className="rt-item">
                        <span className="mono" style={{ color: 'var(--fg-3)' }}>
                          {key}
                        </span>{' '}
                        · {item}
                      </div>
                    )),
                  )}
                </div>

                <div className="feedback-bar">
                  <span className="fb-label">像不像你？</span>
                  <button className="feedback-btn ok" type="button" onClick={() => void handleGeneratePreviewFeedback('像我')}>
                    ✓ 像我
                  </button>
                  <button className="feedback-btn bad" type="button" onClick={() => void handleGeneratePreviewFeedback('不太像')}>
                    ✗ 不太像
                  </button>
                  <button className="feedback-btn bad" type="button" onClick={() => void handleGeneratePreviewFeedback('太保守')}>
                    太保守
                  </button>
                  <button className="feedback-btn bad" type="button" onClick={() => void handleGeneratePreviewFeedback('逻辑不对')}>
                    逻辑不对
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>这轮验证统计</h3>
            <span className="card-sub">当前版</span>
          </div>
          <div className="grid g-4" style={{ gap: 8 }}>
            {[
              { k: '待审建议', v: pendingPatches },
              { k: '已有实验结果', v: reviewedPatches },
              { k: '命中原则', v: topProfileEntries(activeProject?.profile ?? null, 'principles', 3).length },
              { k: '可固化', v: publishReady ? 1 : 0 },
            ].map((item) => (
              <div key={item.k} className="cov-item">
                <div className="cov-label">{item.k}</div>
                <div className="mono" style={{ fontSize: 22, color: 'var(--fg-0)', fontWeight: 500 }}>
                  {item.v}
                </div>
                <div className="cov-gap">本版累计</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>自动跑一组基准任务</h3>
            <span className="card-sub">共 {activeProject?.benchmark_tasks.length ?? 0} 题</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.55 }}>
            先用手动验证找到方向，再去自动实验让系统批量比较这版规则和候选微调建议。
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/experiments" className="btn">
              打开自动实验
            </Link>
            <Link to="/experiments/results" className="btn ghost">
              查看排行榜
            </Link>
          </div>
        </div>
      </div>

      {!dirty && activeProject?.profile ? (
        <div className="grid g-2" style={{ marginTop: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>上一版 / 这一版规则对比</h3>
              <span className="card-sub">{profileDiff.length > 0 ? `${profileDiff.length} 个分区有变化` : '暂无差异'}</span>
            </div>
            <div className="grid g-2">
              <div className="card">
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>
                  {savedProfileVersionMeta?.title ?? '当前生效版本'}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {savedProfileVersionMeta
                    ? `${savedProfileVersionMeta.detail} · ${formatRelativeTime(savedProfileVersionMeta.updated_at)}`
                    : '当前验证正在使用这版已保存规则草稿。'}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>
                  {previousSavedProfileSnapshot ? `上一版保存于 ${formatRelativeTime(previousSavedProfileSnapshot.saved_at)}` : '还没有可对比的上一版'}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {previousSavedProfileSnapshot ? '下面列出这版相对上一版的主要变化。' : '当你再次保存后，这里会自动出现版本差异摘要。'}
                </div>
              </div>
            </div>
            {profileDiff.length > 0 ? (
              <div className="grid g-2" style={{ marginTop: 12 }}>
                {profileDiff.map((section) => (
                  <div key={section.key} className="card">
                    <div className="card-head">
                      <h3>{section.label}</h3>
                      <span className="card-sub">
                        +{section.added.length} / -{section.removed.length}
                      </span>
                    </div>
                    {section.added.slice(0, 3).map((item) => (
                      <div key={`${section.key}-add-${item}`} className="rt-item">
                        + {item}
                      </div>
                    ))}
                    {section.removed.slice(0, 3).map((item) => (
                      <div key={`${section.key}-remove-${item}`} className="rt-item">
                        - {item}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>当前验证判断</h3>
              <span className="card-sub">是否接近可固化</span>
            </div>
            <div className="col" style={{ gap: 10 }}>
              <div className="card">
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>
                  核心原则参与：{topProfileEntries(activeProject?.profile ?? null, 'principles', 3).length}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  用于判断这一版分身的决策骨架是否足够稳定。
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>
                  固化状态：{publishReady ? '可进入导出' : '仍需继续验证'}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {publishReady ? '当前版本已经达到导出门槛。' : '还有明显偏差时，优先继续反馈并跑自动实验。'}
                </div>
              </div>
              {publishReady ? (
                <Link to="/release" className="btn sm accent">
                  进入固化当前版本
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
