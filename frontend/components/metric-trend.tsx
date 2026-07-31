const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

export function MetricTrend({
  title,
  unit,
  items,
  tone = "blue",
}: {
  title: string;
  unit: string;
  items: { date: string; value: number }[];
  tone?: "blue" | "cyan" | "purple" | "amber";
}) {
  if (!items.length) return null;
  const values = items.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const latest = items.at(-1)!;

  return (
    <article className={`metric-trend-card trend-${tone}`}>
      <header>
        <div><span>{title}</span><small>{items.length} mediciones</small></div>
        <strong>{latest.value}<small> {unit}</small></strong>
      </header>
      <div className="metric-trend-bars" aria-label={`Tendencia de ${title.toLowerCase()}`}>
        {items.map((item) => {
          const height = 18 + ((item.value - min) / spread) * 82;
          return <i key={item.date} style={{ height: `${height}%` }} title={`${item.date}: ${item.value} ${unit}`} />;
        })}
      </div>
      <footer>
        <span>{shortDate.format(new Date(`${items[0].date}T12:00:00`))}</span>
        <span>{shortDate.format(new Date(`${latest.date}T12:00:00`))}</span>
      </footer>
    </article>
  );
}
