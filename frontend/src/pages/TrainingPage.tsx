import { Link } from 'react-router-dom'

import {
  claimsFromLlmDistillationOnly,
  hasUnsavedProfileChanges,
  topProfileEntries,
  understandingGroups,
} from '../lib/format'
import { useStudio } from '../lib/studio-context'

export function TrainingPage() {
  const { activeProject, editableProfile, previewFeedback, handleOpenDocument } = useStudio()
  const meta = activeProject?.distillation_meta
  const llmClaims = claimsFromLlmDistillationOnly(activeProject?.claims ?? [], meta)
  const uncertaintyGroups = understandingGroups(llmClaims).filter((group) => group.claims.length > 0)
  const showLlmProfileSlice = Boolean(meta?.llm_used)
  const dirty = hasUnsavedProfileChanges(activeProject, editableProfile)

  return (
    <div className="page-inner fadein">
      <div className="page-head">
        <div>
          <div className="eyebrow">04 / 校正 / 候选信号</div>
          <h1>查看候选信号与依据</h1>
          <p>
            这里展示的是待吸收的候选信号与引用依据，不是最终生效面；真正会进入验证与导出的仍是已保存的规则草稿。
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/correction/profile" className="btn ghost">
            去规则草稿
          </Link>
          <Link to="/correction/claims" className="btn">
            去核对系统判断
          </Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <h2>系统还不确定的地方</h2>
          <span>候选信号</span>
        </div>
        {!showLlmProfileSlice ? (
          <div className="stack-sm">
            <p className="muted">当前这版资料里还没有额外的“系统不确定点”可供展示；如果你需要更细的候选信号，可以重新蒸馏后再回来查看。</p>
            <Link to="/materials" className="subtle-link">
              先去补材料或重新蒸馏
            </Link>
          </div>
        ) : (
          <>
            <ul className="summary-list">
              {topProfileEntries(activeProject?.profile ?? null, 'uncertainty_policy', 6).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {topProfileEntries(activeProject?.profile ?? null, 'uncertainty_policy', 6).length === 0 ? (
              <p className="muted">LLM 未写入「不确定时怎么做」条目；若你认可某种处理方式，请直接补进规则草稿。</p>
            ) : null}
          </>
        )}
      </section>

      <section className="grid g-2">
        {uncertaintyGroups.map((group) => (
          <section key={group.title} className="card">
            <div className="panel-title">
              <h2>{group.title}</h2>
              <span>{group.claims.length}</span>
            </div>
            <p className="muted">以下是待吸收的候选信号；若你认可它，请把它整理进规则草稿，而不是把这里当作最终生效内容。</p>
            {group.claims.slice(0, 4).map((claim) => (
              <article key={claim.id} className="understanding-row">
                <div>
                  <strong>{claim.statement}</strong>
                  <p className="muted">{claim.evidence_text}</p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={!claim.source_document_id}
                  onClick={() => void handleOpenDocument(claim.source_document_id, claim.evidence_text)}
                >
                  查看依据
                </button>
              </article>
            ))}
            <Link to="/correction/claims" className="subtle-link">
              去系统判断页继续核对这一类候选
            </Link>
          </section>
        ))}
        {uncertaintyGroups.length === 0 ? (
          <section className="card">
            <div className="panel-title">
              <h2>候选信号</h2>
              <span>当前为空</span>
            </div>
            <p className="muted">当前没有可展示的 LLM 候选信号；你可以直接去规则草稿手动整理这版分身协议。</p>
            <Link to="/correction/profile" className="subtle-link">
              先去规则草稿
            </Link>
          </section>
        ) : null}
      </section>

      <section className="grid g-2">
        <article className="card">
          <div className="panel-title">
            <h2>使用这一页时要记住</h2>
            <span>辅助输入层</span>
          </div>
          <p className="muted">这页只负责给你候选信号与依据，真正会在下一轮验证里生效的是已保存的规则草稿。</p>
          <div className="stack-sm">
            <article className="card">
              <strong>规则草稿是唯一生效源</strong>
              <p className="muted">无论来自理解、claims 还是处理反馈，最终都要回到规则草稿确认并保存。</p>
            </article>
            <article className="card">
              <strong>候选判断只是输入层</strong>
              <p className="muted">候选判断与 evidence 用来帮助你判断写什么，不直接代表最终分身行为定义。</p>
            </article>
          </div>
        </article>

        <article className="card">
          <div className="panel-title">
            <h2>进入验证前</h2>
            <span>{dirty ? '先保存' : '可继续验证'}</span>
          </div>
          <p className="muted">
            {dirty
              ? '未保存的改动不会进入试运行；请先保存规则草稿。'
              : '确认已保存后，用下方链接进入验证工作台。'}
          </p>
          <Link to={dirty ? '/correction/profile' : '/validation/manual'} className="subtle-link">
            {dirty ? '先去保存规则草稿' : '去验证工作台'}
          </Link>
        </article>
      </section>

      {previewFeedback?.suggestions.length ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="panel-title">
            <h2>来自最近一次验证的规则候选</h2>
            <span>{previewFeedback.suggestions.length}</span>
          </div>
          <p className="muted">{previewFeedback.summary}</p>
          <p className="muted">这些内容仍只是规则草稿候选；跳到规则草稿后，请确认并保存，才会影响下一轮验证与导出。</p>
          <div className="grid g-2">
            <article className="card">
              <strong>先吸收反馈</strong>
              <p className="muted">先去规则草稿，把建议整理成你认可的稳定规则。</p>
              <Link to="/correction/profile" className="subtle-link">
                去编辑规则草稿
              </Link>
            </article>
            <article className="card">
              <strong>回看原始反馈</strong>
              <p className="muted">想看建议为什么生成，就回反馈页。</p>
              <Link to="/validation/feedback" className="subtle-link">
                回到处理反馈
              </Link>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  )
}
