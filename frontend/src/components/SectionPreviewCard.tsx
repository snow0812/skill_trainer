export function SectionPreviewCard({
  title,
  items,
  cta,
}: {
  title: string
  items: string[]
  cta?: string
}) {
  return (
    <article className="summary-card">
      <div className="panel-title">
        <h3>{title}</h3>
        {cta ? <span className="subtle-link">{cta}</span> : null}
      </div>
      {items.length === 0 ? (
        <p className="muted">系统还需要更多资料来稳定理解这一部分。</p>
      ) : (
        <ul className="summary-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </article>
  )
}
