"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { ActivityRoutePoint } from "@/lib/types";

type ProjectedPoint = {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
  elapsedS: number | null;
  altitudeM: number | null;
  progress: number;
};

type RouteProjection = {
  width: number;
  height: number;
  points: ProjectedPoint[];
};

type RouteSegment = {
  key: string;
  className: string;
  path: string;
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
      return {
        x,
        y,
        latitude: point.latitude,
        longitude: point.longitude,
        distanceKm: point.distance_km ?? 0,
        elapsedS: point.elapsed_s ?? null,
        altitudeM: point.altitude_m ?? null,
        progress: index / Math.max(route.length - 1, 1),
      };
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

function formatElapsed(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const finalSeconds = seconds % 60;
  return `${minutes}:${finalSeconds.toString().padStart(2, "0")}`;
}

function formatPointPace(point: ProjectedPoint) {
  if (!point.elapsedS || !point.distanceKm) return "—";
  return `${formatElapsed(Math.round(point.elapsedS / point.distanceKm))} /km`;
}

function routeSegments(points: ProjectedPoint[]) {
  const groups = new Map<number, ProjectedPoint[]>();
  points.forEach((point) => {
    const km = Math.floor(point.distanceKm);
    const group = groups.get(km);
    if (group) group.push(point);
    else groups.set(km, [point]);
  });
  return Array.from(groups.entries()).map<RouteSegment>(([km, segmentPoints]) => ({
    key: `km-${km}`,
    className: `route-map-segment route-map-segment-${km % 6}`,
    path: routePath(segmentPoints),
  }));
}

function kilometerMarkers(points: ProjectedPoint[], width: number) {
  const maxKm = Math.floor(points[points.length - 1]?.distanceKm ?? 0);
  return Array.from({ length: maxKm }, (_, index) => {
    const km = index + 1;
    const point = points.find((candidate) => candidate.distanceKm >= km) ?? points[points.length - 1];
    const pushLeft = point.x > width * 0.72 ? -1.2 : 1.2;
    const pushVertical = index % 2 === 0 ? -1.2 : 1.2;
    return {
      km,
      point,
      x: pushLeft,
      y: pushVertical,
    };
  });
}

export function ActivityRouteMap({ route }: { route: ActivityRoutePoint[] }) {
  const [hover, setHover] = useState<ProjectedPoint | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastHoverRef = useRef<ProjectedPoint | null>(null);
  const projection = useMemo(() => projectRoute(route), [route]);
  if (route.length < 2) return null;
  const points = projection.points;
  const start = points[0];
  const finish = points[points.length - 1];
  const startCoordinate = route[0];
  const finishCoordinate = route[route.length - 1];
  const path = routePath(points);
  const segments = routeSegments(points);
  const markers = kilometerMarkers(points, projection.width);
  const activePoint = hover ?? finish;

  function updateHover(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * projection.width;
    const y = ((event.clientY - rect.top) / rect.height) * projection.height;
    const nearest = points.reduce((best, point) => {
      const bestDistance = (best.x - x) ** 2 + (best.y - y) ** 2;
      const pointDistance = (point.x - x) ** 2 + (point.y - y) ** 2;
      return pointDistance < bestDistance ? point : best;
    }, points[0]);
    if (lastHoverRef.current === nearest) return;
    lastHoverRef.current = nearest;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      setHover(nearest);
      frameRef.current = null;
    });
  }

  function clearHover() {
    lastHoverRef.current = null;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setHover(null);
  }

  return (
    <section className="activity-route-map panel" aria-label="Mapa de la ruta">
      <div className="route-map-heading">
        <div>
          <span className="eyebrow">Mapa</span>
          <h2>Ruta de la carrera</h2>
        </div>
        <span>{route.length} puntos · {finish.distanceKm.toFixed(2)} km</span>
      </div>
      <div className="route-map-stage">
        <svg
          className="route-map-canvas"
          viewBox={`0 0 ${projection.width} ${projection.height}`}
          role="img"
          aria-label="Trazado de la actividad por kilómetros"
          onMouseMove={updateHover}
          onMouseLeave={clearHover}
        >
          <rect className="route-map-background" x="0" y="0" width={projection.width} height={projection.height} rx="4" />
          <path className="route-map-grid route-map-grid-horizontal" d={`M 0 ${projection.height * 0.25} H ${projection.width} M 0 ${projection.height * 0.5} H ${projection.width} M 0 ${projection.height * 0.75} H ${projection.width}`} />
          <path className="route-map-grid" d={`M ${projection.width * 0.25} 0 V ${projection.height} M ${projection.width * 0.5} 0 V ${projection.height} M ${projection.width * 0.75} 0 V ${projection.height}`} />
          <path className="route-map-shadow" d={path} />
          {segments.map((segment) => (
            <path className={segment.className} d={segment.path} key={segment.key} />
          ))}
          {markers.map(({ km, point, x, y }) => (
            <g className="route-km-marker" key={km} transform={`translate(${point.x + x} ${point.y + y})`}>
              <circle r="3.5" />
              <text textAnchor="middle" x="0" y="1.25">{km}</text>
            </g>
          ))}
          {hover && (
            <g className="route-hover-layer">
              <line className="route-hover-crosshair" x1={hover.x} x2={hover.x} y1="0" y2={projection.height} />
              <line className="route-hover-crosshair" x1="0" x2={projection.width} y1={hover.y} y2={hover.y} />
              <circle className="route-hover-pulse" cx={hover.x} cy={hover.y} r="5.2" />
              <circle className="route-hover-dot" cx={hover.x} cy={hover.y} r="2.4" />
            </g>
          )}
          <rect className="route-hit-area" x="0" y="0" width={projection.width} height={projection.height} />
          <circle className="route-map-marker route-map-start" cx={start.x} cy={start.y} r="2.5" />
          <circle className="route-map-marker route-map-finish" cx={finish.x} cy={finish.y} r="2.5" />
        </svg>
        <div className="route-hover-card" aria-live="polite">
          <span>{hover ? "Punto bajo cursor" : "Llegada"}</span>
          <strong>{activePoint.distanceKm.toFixed(2)} km · {formatElapsed(activePoint.elapsedS)}</strong>
          <small>{formatPointPace(activePoint)} · {activePoint.altitudeM ?? "—"} m</small>
          <small>{formatCoordinate(activePoint.latitude, "lat")}, {formatCoordinate(activePoint.longitude, "lon")}</small>
        </div>
      </div>
      <div className="route-map-legend">
        <span><i className="route-map-dot route-map-dot-start" />Salida · {formatCoordinate(startCoordinate.latitude, "lat")}, {formatCoordinate(startCoordinate.longitude, "lon")}</span>
        <span><i className="route-map-dot route-map-dot-finish" />Llegada · {formatCoordinate(finishCoordinate.latitude, "lat")}, {formatCoordinate(finishCoordinate.longitude, "lon")}</span>
      </div>
    </section>
  );
}
