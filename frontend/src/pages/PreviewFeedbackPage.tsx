import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useStudio } from '../lib/studio-context'
import type { PreviewSuggestion } from '../types'

type FeedbackOption = '像我' | '不太像' | '太保守' | '逻辑不对'

const GUIDANCE: Record<FeedbackOption, string> = {
  像我: '这次试运行可以视为一个有效方向，接下来可以换一个更难的真实任务继续压测。',
  不太像: '优先在规则草稿里修正核心原则和表达风格，再回来重跑相同任务。',
  太保守: '说明边界可能过强或决策规则过于防守，优先检查边界和取舍规则。',
  逻辑不对: '优先修正决策方式和工作流，让它先会怎么判断，再考虑像不像你。',
}

const NOTE_EXAMPLES: Record<FeedbackOption, string[]> = {
  像我: ['这次最像我的地方，是先给结论，再给理由和下一步。', '这版结构和语气都比较像我，可以把这套表达沉淀下来。'],
  不太像: ['我不会这么说，我会更直接一点，先说判断，再解释原因。', '这版太像系统总结，不像我本人在工作里会发出的内容。'],
  太保守: ['这里可以先给一个初步判断，再补充需要确认的边界。', '我不会这么早退回去，我会先推进到可判断的程度。'],
  逻辑不对: ['我通常会先看目标、约束和投入产出，再决定是否推进。', '这里不是语气问题，而是判断顺序错了，应该先澄清再下结论。'],
}

export function PreviewFeedbackPage() {
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackOption | null>(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const {
    activeProject,
    loading,
    loadingReason,
    patchQueue,
    manualPreviewResult,
    previewFeedback,
    handleGeneratePreviewFeedback,
    handleApplyPreviewSuggestion,
  } = useStudio()

  const canSubmit =
    Boolean(selectedFeedback) && (selectedFeedback === '像我' || feedbackNote.trim().length > 0)
  const pendingSuggestions = patchQueue.filter((item) => item.status === 'pending').length
  const reviewedSuggestions = patchQueue.filter((item) => Boolean(item.experiment_result)).length

  async function submitFeedback() {
    if (!selectedFeedback || !canSubmit) return
    await handleGeneratePreviewFeedback(selectedFeedback, feedbackNote.trim())
  }

  if (!manualPreviewResult?.response) {
    return (
      <div className="page-inner fadein">
        <div className="page-head">
          <div>
            <div className="eyebrow">05 / 验证 / 反馈</div>
            <h1>还没有可反馈的试运行结果</h1>
            <p>先在验证工作台跑一遍真实任务，这里才会生成针对性的微调建议。</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/validation/manual" className="btn primary">
              先去跑一次试运行
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">05 / 验证 / 反馈</div>
          <h1>把这轮偏差说具体</h1>
          <p>先选偏差类型，再补一句你真正会怎么说或怎么判断。系统会把它转成微调建议，送去建议池和自动实验。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/validation/manual" className="btn ghost">
            回手动验证
          </Link>
          <Link to="/experiments/patches" className="btn">
            建议池 {pendingSuggestions}
          </Link>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="val-card panel">
          <div className="vc-head">
            <h3>这次输出</h3>
            <span className="badge-soft">{manualPreviewResult.llm_used ? '真实模型结果' : '本地演示结果'}</span>
          </div>
          <div className="vc-body">
            <div className="twin-response">"{manualPreviewResult.response}"</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>先判断偏差类型</h3>
            <span className="card-sub">{selectedFeedback ?? '未选择'}</span>
          </div>
          <div className="scenario-pills" style={{ marginBottom: 10 }}>
            {(Object.keys(GUIDANCE) as FeedbackOption[]).map((item) => (
              <span key={item} className={`pill${selectedFeedback === item ? ' on' : ''}`} onClick={() => setSelectedFeedback(item)}>
                {item}
              </span>
            ))}
          </div>
          <p className="muted">{selectedFeedback ? GUIDANCE[selectedFeedback] : '先选一个反馈标签，再补一句真实原因。'}</p>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>告诉系统哪里不对</h3>
            <span className="card-sub">补一句真实原因</span>
          </div>
          <p className="muted">负向反馈最好补一句你真正会怎么说、怎么判断或该补什么边界。</p>
          <textarea
            rows={5}
            value={feedbackNote}
            onChange={(event) => setFeedbackNote(event.target.value)}
            placeholder={selectedFeedback ? NOTE_EXAMPLES[selectedFeedback][0] : '先选择反馈标签，然后补一句真实原因。'}
            disabled={!selectedFeedback || loading}
          />
          {selectedFeedback ? (
            <div className="feedback-example-row">
              {NOTE_EXAMPLES[selectedFeedback].map((example) => (
                <button
                  key={example}
                  type="button"
                  className="secondary-chip feedback-example-chip"
                  onClick={() => setFeedbackNote(example)}
                  disabled={loading}
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>生成微调建议</h3>
            <span className="card-sub">送入自动实验前的入口</span>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <div className="cov-item">
              <div className="cov-label">待审建议</div>
              <div className="mono" style={{ fontSize: 22, color: 'var(--fg-0)', fontWeight: 500 }}>
                {pendingSuggestions}
              </div>
              <div className="cov-gap">当前池中数量</div>
            </div>
            <div className="cov-item">
              <div className="cov-label">已有实验结果</div>
              <div className="mono" style={{ fontSize: 22, color: 'var(--fg-0)', fontWeight: 500 }}>
                {reviewedSuggestions}
              </div>
              <div className="cov-gap">已完成自动比较</div>
            </div>
            <button type="button" className="btn accent" onClick={() => void submitFeedback()} disabled={loading || !canSubmit}>
              {loadingReason === 'previewFeedback' ? '生成中…' : '生成微调建议'}
            </button>
            {!canSubmit && selectedFeedback && selectedFeedback !== '像我' ? (
              <p className="muted">负向反馈至少补一句原因，否则建议会太泛。</p>
            ) : null}
          </div>
        </div>
      </div>

      {previewFeedback ? (
        <section className="card">
          <div className="card-head">
            <h3>{previewFeedback.llm_used ? 'LLM 微调建议' : '本地微调建议'}</h3>
            <span className="card-sub">{previewFeedback.suggestions.length}</span>
          </div>
          <p className="muted">{previewFeedback.summary}</p>
          <div className="grid g-2" style={{ marginTop: 12 }}>
            {previewFeedback.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                targetStatements={
                  activeProject?.claims
                    .filter((claim) => suggestion.target_claim_ids.includes(claim.id))
                    .map((claim) => claim.statement) ?? []
                }
                loading={loading}
                onApply={() => handleApplyPreviewSuggestion(suggestion)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SuggestionCard({
  suggestion,
  targetStatements,
  loading,
  onApply,
}: {
  suggestion: PreviewSuggestion
  targetStatements: string[]
  loading: boolean
  onApply: () => void
}) {
  return (
    <article className="export-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="ec-title">{suggestion.title}</div>
          <div className="ec-sub">写入分区：{sectionLabel(suggestion.section)}</div>
        </div>
        <span className="badge-soft accent">{sectionLabel(suggestion.section)}</span>
      </div>
      <div className="muted">{suggestion.reason}</div>
      {targetStatements.length > 0 ? (
        <div className="col gap-sm">
          {targetStatements.map((statement) => (
            <div key={`${suggestion.id}-${statement}`} className="patch-line patch-line-remove">
              <span className="patch-sign">-</span>
              <span>{statement}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">这条建议会新增到规则草稿候选，不会替换旧规则。</div>
      )}
      <div className="patch-line patch-line-add">
        <span className="patch-sign">+</span>
        <span>{suggestion.suggested_text}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm ghost" disabled={loading} onClick={() => void onApply()}>
          直接写入规则草稿
        </button>
        <Link to="/experiments/patches" className="btn sm">
          去建议池
        </Link>
      </div>
    </article>
  )
}

function sectionLabel(section: PreviewSuggestion['section']) {
  const mapping: Record<PreviewSuggestion['section'], string> = {
    principles: '原则',
    decision_rules: '决策',
    workflows: '工作流',
    voice: '表达',
    boundaries: '边界',
  }
  return mapping[section]
}
