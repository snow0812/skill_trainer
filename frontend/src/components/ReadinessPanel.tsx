export function ReadinessPanel({
  items,
}: {
  items: Array<{ label: string; status: string }>
}) {
  return (
    <section className="panel stack-md">
      <div className="panel-title">
        <h2>分身成熟度</h2>
        <span>Readiness</span>
      </div>
      <div className="grid grid-2">
        {items.map((item) => (
          <article key={item.label} className="metric-card">
            <div className="panel-title">
              <strong>{item.label}</strong>
              <span className="status-badge">{item.status}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
