import type { ActivityRoutePoint } from "@/lib/types";

type ProjectedPoint = {
  x: number;
  y: number;
};

function projectRoute(route: ActivityRoutePoint[]): ProjectedPoint[] {
  const latitudes = route.map((point) => point.latitude);
  const longitudes = route.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = maxLatitude - minLatitude || 0.001;
  const longitudeRange = maxLongitude - minLongitude || 0.001;
  const averageLatitude = ((minLatitude + maxLatitude) / 2) * Math.PI / 180;
  const longitudeScale = Math.max(Math.cos(averageLatitude), 0.2);
  const width = longitudeRange * longitudeScale || 0.001;
  const height = latitudeRange;
  const shouldFitByWidth = width / height > 1.9;
  const paddingX = shouldFitByWidth ? 8 : 18;
  const paddingY = shouldFitByWidth ? 24 : 10;
  const drawableWidth = 100 - paddingX * 2;
  const drawableHeight = 100 - paddingY * 2;

  return route.map((point) => {
    const x = paddingX + ((point.longitude - minLongitude) * longitudeScale / width) * drawableWidth;
    const y = paddingY + (1 - (point.latitude - minLatitude) / height) * drawableHeight;
    return { x, y };
  });
}

function routePath(points: ProjectedPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function formatCoordinate(value: number, axis: "lat" | "lon") {
  const direction = axis === "lat"
    ? value >= 0 ? "N" : "S"
    : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)}° ${direction}`;
}

export function ActivityRouteMap({ route }: { route: ActivityRoutePoint[] }) {
  if (route.length < 2) return null;
  const points = projectRoute(route);
  const start = points[0];
  const finish = points[points.length - 1];
  const startCoordinate = route[0];
  const finishCoordinate = route[route.length - 1];

  return (
    <section className="activity-route-map panel" aria-label="Mapa de la ruta">
      <div className="route-map-heading">
        <div>
          <span className="eyebrow">Mapa</span>
          <h2>Ruta de la carrera</h2>
        </div>
        <span>{route.length} puntos</span>
      </div>
      <svg className="route-map-canvas" viewBox="0 0 100 100" role="img" aria-label="Trazado de la actividad">
        <defs>
          <linearGradient id="route-stroke" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-series-1)" />
            <stop offset="100%" stopColor="var(--viz-series-2)" />
          </linearGradient>
          <linearGradient id="map-terrain" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--soft-accent)" />
            <stop offset="100%" stopColor="var(--soft-orange)" />
          </linearGradient>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path className="route-map-terrain" d="M -5 20 C 18 4 32 18 50 12 S 83 8 106 21 V -5 H -5 Z" />
        <path className="route-map-terrain route-map-terrain-low" d="M -6 84 C 14 74 26 88 42 78 S 72 70 106 80 V 106 H -6 Z" />
        <path className="route-map-contour" d="M 2 36 C 19 28 30 43 45 34 S 70 21 94 34 M 8 64 C 23 56 35 69 51 60 S 78 49 96 58" />
        <path className="route-map-grid route-map-grid-horizontal" d="M 0 25 H 100 M 0 50 H 100 M 0 75 H 100" />
        <path className="route-map-grid" d="M 25 0 V 100 M 50 0 V 100 M 75 0 V 100" />
        <path className="route-map-shadow" d={routePath(points)} />
        <path className="route-map-line" d={routePath(points)} filter="url(#route-glow)" />
        <circle className="route-map-marker route-map-start" cx={start.x} cy={start.y} r="2.3" />
        <circle className="route-map-marker route-map-finish" cx={finish.x} cy={finish.y} r="2.3" />
      </svg>
      <div className="route-map-legend">
        <span><i className="route-map-dot route-map-dot-start" />Salida · {formatCoordinate(startCoordinate.latitude, "lat")}, {formatCoordinate(startCoordinate.longitude, "lon")}</span>
        <span><i className="route-map-dot route-map-dot-finish" />Llegada · {formatCoordinate(finishCoordinate.latitude, "lat")}, {formatCoordinate(finishCoordinate.longitude, "lon")}</span>
      </div>
    </section>
  );
}
