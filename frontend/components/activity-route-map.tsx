"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { ActivityRoutePoint } from "@/lib/types";

type ProjectedPoint = {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  progress: number;
};

type RouteProjection = {
  width: number;
  height: number;
  points: ProjectedPoint[];
};

function projectRoute(route: ActivityRoutePoint[]): RouteProjection {
  if (route.length < 2) return { width: 120, height: 80, points: [] };
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
  const projectedWidth = longitudeRange * longitudeScale || 0.001;
  const projectedHeight = latitudeRange;
  const aspect = Math.min(Math.max(projectedWidth / projectedHeight, 0.65), 1.8);
  const width = 120;
  const height = width / aspect;
  const padding = 9;
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;

  return {
    width,
    height,
    points: route.map((point, index) => {
      const x = padding + ((point.longitude - minLongitude) * longitudeScale / projectedWidth) * drawableWidth;
      const y = padding + (1 - (point.latitude - minLatitude) / projectedHeight) * drawableHeight;
      return { x, y, latitude: point.latitude, longitude: point.longitude, progress: index / Math.max(route.length - 1, 1) };
    }),
  };
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
  const [hover, setHover] = useState<ProjectedPoint | null>(null);
  const projection = useMemo(() => projectRoute(route), [route]);
  if (route.length < 2) return null;
  const points = projection.points;
  const start = points[0];
  const finish = points[points.length - 1];
  const startCoordinate = route[0];
  const finishCoordinate = route[route.length - 1];
  const path = routePath(points);

  function updateHover(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * projection.width;
    const y = ((event.clientY - rect.top) / rect.height) * projection.height;
    const nearest = points.reduce((best, point) => {
      const bestDistance = (best.x - x) ** 2 + (best.y - y) ** 2;
      const pointDistance = (point.x - x) ** 2 + (point.y - y) ** 2;
      return pointDistance < bestDistance ? point : best;
    }, points[0]);
    setHover(nearest);
  }

  return (
    <section className="activity-route-map panel" aria-label="Mapa de la ruta">
      <div className="route-map-heading">
        <div>
          <span className="eyebrow">Mapa</span>
          <h2>Ruta de la carrera</h2>
        </div>
        <span>{route.length} puntos</span>
      </div>
      <svg
        className="route-map-canvas"
        viewBox={`0 0 ${projection.width} ${projection.height}`}
        role="img"
        aria-label="Trazado de la actividad"
        onMouseMove={updateHover}
        onMouseLeave={() => setHover(null)}
      >
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
        <rect className="route-map-background" x="0" y="0" width={projection.width} height={projection.height} rx="4" />
        <path className="route-map-terrain" d={`M -5 ${projection.height * 0.22} C ${projection.width * 0.18} ${projection.height * 0.04} ${projection.width * 0.34} ${projection.height * 0.18} ${projection.width * 0.5} ${projection.height * 0.12} S ${projection.width * 0.83} ${projection.height * 0.08} ${projection.width + 6} ${projection.height * 0.22} V -5 H -5 Z`} />
        <path className="route-map-terrain route-map-terrain-low" d={`M -6 ${projection.height * 0.84} C ${projection.width * 0.14} ${projection.height * 0.74} ${projection.width * 0.26} ${projection.height * 0.88} ${projection.width * 0.42} ${projection.height * 0.78} S ${projection.width * 0.72} ${projection.height * 0.7} ${projection.width + 6} ${projection.height * 0.8} V ${projection.height + 6} H -6 Z`} />
        <path className="route-map-grid route-map-grid-horizontal" d={`M 0 ${projection.height * 0.25} H ${projection.width} M 0 ${projection.height * 0.5} H ${projection.width} M 0 ${projection.height * 0.75} H ${projection.width}`} />
        <path className="route-map-grid" d={`M ${projection.width * 0.25} 0 V ${projection.height} M ${projection.width * 0.5} 0 V ${projection.height} M ${projection.width * 0.75} 0 V ${projection.height}`} />
        <path className="route-map-shadow" d={path} />
        <path className="route-map-line" d={path} filter="url(#route-glow)" />
        {hover && (
          <g className="route-hover-layer">
            <circle className="route-hover-pulse" cx={hover.x} cy={hover.y} r="5.2" />
            <circle className="route-hover-dot" cx={hover.x} cy={hover.y} r="2.4" />
            <g transform={`translate(${Math.min(Math.max(hover.x + 4, 6), projection.width - 42)} ${hover.y < 20 ? hover.y + 6 : hover.y - 18})`}>
              <rect className="chart-tooltip-bg" width="38" height="14" rx="3" />
              <text className="chart-tooltip-title route-tooltip-text" x="4" y="9">{Math.round(hover.progress * 100)}%</text>
            </g>
          </g>
        )}
        <rect className="route-hit-area" x="0" y="0" width={projection.width} height={projection.height} />
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
