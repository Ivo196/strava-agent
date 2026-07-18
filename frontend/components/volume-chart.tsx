type WeekPoint = { week: string; distance_km: number; training_load: number; runs: number };

const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function pointsPath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

export function VolumeChart({ data }: { data: WeekPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: shortDate.format(new Date(`${point.week}T12:00:00`)),
  }));

  if (!chartData.length) {
    return (
      <div className="chart-empty">
        <span className="empty-bars" aria-hidden="true" />
        <p>Tu evolución aparecerá cuando importes el historial.</p>
      </div>
    );
  }

  const width = 760;
  const height = 270;
  const top = 34;
  const right = 28;
  const bottom = 46;
  const left = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxDistance = Math.max(...chartData.map((point) => point.distance_km), 1);
  const maxLoad = Math.max(...chartData.map((point) => point.training_load), 1);
  const average = chartData.reduce((total, point) => total + point.distance_km, 0) / chartData.length;
  const step = plotWidth / chartData.length;
  const barWidth = Math.min(44, step * 0.52);
  const loadPoints = chartData.map((point, index) => ({
    x: left + step * index + step / 2,
    y: top + plotHeight - (point.training_load / maxLoad) * plotHeight,
  }));
  const averageY = top + plotHeight - (average / maxDistance) * plotHeight;
  const yTicks = [0, 0.5, 1].map((ratio) => ({
    value: Math.round(maxDistance * ratio),
    y: top + plotHeight - ratio * plotHeight,
  }));

  return (
    <div className="volume-chart-wrap" role="img" aria-label="Volumen semanal en kilómetros, carga de entrenamiento y media semanal">
      <svg className="volume-chart-svg" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id="volume-bar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-series-1)" />
            <stop offset="100%" stopColor="rgba(91, 140, 255, .28)" />
          </linearGradient>
          <filter id="chart-soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <path className="chart-grid-line" d={`M ${left} ${tick.y.toFixed(1)} H ${width - right}`} />
            <text className="chart-axis-label" x="4" y={tick.y + 4}>{tick.value} km</text>
          </g>
        ))}
        <path className="chart-average-line" d={`M ${left} ${averageY.toFixed(1)} H ${width - right}`} />
        {chartData.map((point, index) => {
          const x = left + step * index + (step - barWidth) / 2;
          const barHeight = (point.distance_km / maxDistance) * plotHeight;
          const y = top + plotHeight - barHeight;
          return (
            <g key={point.week}>
              <rect className="chart-bar" x={x} y={y} width={barWidth} height={barHeight} rx="5" />
              <text className="chart-x-label" x={left + step * index + step / 2} y={height - 16}>{point.label}</text>
            </g>
          );
        })}
        <path className="chart-load-line" d={pointsPath(loadPoints)} filter="url(#chart-soft-glow)" />
        {loadPoints.map((point, index) => (
          <circle className="chart-load-dot" cx={point.x} cy={point.y} r="4" key={chartData[index].week} />
        ))}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span><i className="legend-bar" />Distancia</span>
        <span><i className="legend-line" />Carga</span>
        <span><i className="legend-average" />Media {average.toFixed(1)} km</span>
      </div>
    </div>
  );
}
