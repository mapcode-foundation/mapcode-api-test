import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { FixturePoint, PointState, RequestCase, RunSummary } from "../../shared/types";

type CoverageView = "map" | "table";

type CoverageMapProps = {
  points: FixturePoint[];
  requests: RequestCase[];
  currentRequest?: RequestCase;
  summary: RunSummary;
  states: Record<string, PointState>;
  mapKeyAvailable: boolean;
  view: CoverageView;
  onViewChange: (view: CoverageView) => void;
};

type MapViewport = {
  zoom: number;
  centerX: number;
  centerY: number;
};

type MapSize = {
  width: number;
  height: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const TRACK_ZOOM = 10;
const WHEEL_ZOOM_FACTOR = 1 / 360;
const DRAG_PAN_FACTOR = 0.65;
const OVERVIEW_VIEWPORT: MapViewport = { zoom: MIN_ZOOM, centerX: 0.5, centerY: 0.5 };
const POINT_LEGEND: { state: PointState; label: string }[] = [
  { state: "queued", label: "Queued" },
  { state: "active", label: "Running" },
  { state: "passed", label: "Passed" },
  { state: "failed", label: "Mismatch" },
  { state: "blocked", label: "Blocked" }
];

function stateFor(point: FixturePoint, states: Record<string, PointState>): PointState {
  return states[point.id] ?? "queued";
}

export function CoverageMap({ points, requests, currentRequest, summary, states, mapKeyAvailable, view, onViewChange }: CoverageMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewport: MapViewport;
  } | null>(null);
  const [viewport, setViewport] = useState<MapViewport>(OVERVIEW_VIEWPORT);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 720, height: 720 });
  const [isDragging, setIsDragging] = useState(false);
  const [isTrackingRequest, setIsTrackingRequest] = useState(true);
  const mapPoints = useMemo(
    () => points.filter((point) => point.source !== "global-raster" || stateFor(point, states) !== "queued"),
    [points, states]
  );
  const nonLocationRequests = useMemo(() => requests.filter((request) => !request.fixtureId), [requests]);
  const currentPoint = useMemo(
    () => mapPoints.find((point) => point.id === currentRequest?.fixtureId),
    [currentRequest?.fixtureId, mapPoints]
  );
  const viewBounds = useMemo(() => boundsForViewport(viewport, mapSize), [mapSize, viewport]);
  const tileZoom = useMemo(() => Math.ceil(viewport.zoom), [viewport.zoom]);
  const visibleTiles = useMemo(() => tilesForBounds(tileZoom, viewBounds), [tileZoom, viewBounds]);
  const hiddenRasterCount = useMemo(
    () => points.filter((point) => point.source === "global-raster" && stateFor(point, states) === "queued").length,
    [points, states]
  );
  const queuedCount = useMemo(
    () => mapPoints.filter((point) => stateFor(point, states) === "queued").length,
    [mapPoints, states]
  );
  const progressPercent = summary.totalCases === 0 ? 0 : Math.round((summary.completedCases / summary.totalCases) * 100);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  const updateViewport = useCallback(
    (next: MapViewport | ((current: MapViewport) => MapViewport)) => {
      setViewport((current) => clampViewport(typeof next === "function" ? next(current) : next, mapSize));
    },
    [mapSize]
  );

  useEffect(() => {
    const element = mapRef.current;
    if (!element || view !== "map" || !mapKeyAvailable) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      updateViewport((current) => {
        const nextZoom = clampZoom(current.zoom - event.deltaY * WHEEL_ZOOM_FACTOR);
        if (nextZoom === current.zoom) return current;

        const rect = element.getBoundingClientRect();
        const pointerX = (event.clientX - rect.left) / Math.max(1, rect.width);
        const pointerY = (event.clientY - rect.top) / Math.max(1, rect.height);
        const currentBounds = boundsForViewport(current, mapSize);
        const worldXAtPointer = currentBounds.left + pointerX * currentBounds.width;
        const worldYAtPointer = currentBounds.top + pointerY * currentBounds.height;
        const nextVisible = visibleWorldSize(nextZoom, mapSize);

        return {
          zoom: nextZoom,
          centerX: worldXAtPointer - pointerX * nextVisible.width + nextVisible.width / 2,
          centerY: worldYAtPointer - pointerY * nextVisible.height + nextVisible.height / 2
        };
      });
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [mapKeyAvailable, mapSize, updateViewport, view]);

  const handleOverview = useCallback(() => {
    updateViewport(OVERVIEW_VIEWPORT);
  }, [updateViewport]);

  const centerPoint = useCallback((point: FixturePoint, zoom?: number) => {
    updateViewport((current) => ({
      zoom: zoom ?? current.zoom,
      centerX: longitudeToWorldX(point.lon),
      centerY: latitudeToWorldY(point.lat)
    }));
  }, [updateViewport]);

  useEffect(() => {
    if (!isTrackingRequest || !currentPoint) return;
    centerPoint(currentPoint);
  }, [centerPoint, currentPoint, isTrackingRequest]);

  const handleTrackCurrentRequest = useCallback(() => {
    setIsTrackingRequest((current) => {
      const next = !current;
      if (next && currentPoint) centerPoint(currentPoint);
      return next;
    });
  }, [centerPoint, currentPoint]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewport
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [viewport]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const startBounds = boundsForViewport(drag.viewport, mapSize);
      const deltaX = ((event.clientX - drag.startX) / Math.max(1, mapSize.width)) * startBounds.width * DRAG_PAN_FACTOR;
      const deltaY = ((event.clientY - drag.startY) / Math.max(1, mapSize.height)) * startBounds.height * DRAG_PAN_FACTOR;
      updateViewport({
        ...drag.viewport,
        centerX: drag.viewport.centerX - deltaX,
        centerY: drag.viewport.centerY - deltaY
      });
    },
    [mapSize, updateViewport]
  );

  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
  }, []);

  if (view === "table" || !mapKeyAvailable) {
    return (
      <section className="coverage-preview">
        <CoverageHeader view="table" mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
        <div className="coverage-side">
          {!mapKeyAvailable ? <p>Map preview is unavailable until a TomTom map key is configured.</p> : null}
          <table className="fixture-table">
            <caption>Generated fixture points</caption>
            <thead>
              <tr>
                <th scope="col">Fixture</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id}>
                  <td>{point.label}</td>
                  <td>
                    <span className={`point-state ${stateFor(point, states)}`}>{stateFor(point, states)}</span>
                  </td>
                </tr>
              ))}
              {nonLocationRequests.length > 0 ? (
                <tr className="non-location-row">
                  <td>
                    <strong>Non-location requests</strong>
                    <span>{nonLocationRequests.map((request) => request.id).join(", ")}</span>
                  </td>
                  <td>
                    <span className="request-count">{nonLocationRequests.length} requests</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="coverage-preview">
      <CoverageHeader view="map" mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
      <div
        ref={mapRef}
        className={`coverage-map ${isDragging ? "dragging" : ""}`}
        aria-label="Coverage map preview"
        data-zoom={viewport.zoom}
        data-tile-zoom={tileZoom}
        data-center-lat={formatCoordinate(worldYToLatitude(viewport.centerY))}
        data-center-lon={formatCoordinate(worldXToLongitude(viewport.centerX))}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="tile-map" aria-hidden="true">
          {visibleTiles.map((tile) => (
            <img
              key={`${tileZoom}-${tile.x}-${tile.y}`}
              alt=""
              src={`/api/tomtom/tile/${tileZoom}/${tile.x}/${tile.y}.png`}
              style={{
                left: `${tile.left}%`,
                top: `${tile.top}%`,
                width: `${tile.size}%`,
                height: `${tile.size}%`
              }}
            />
          ))}
        </div>
        <div className="coverage-static-layer" aria-hidden="true">
          {mapPoints.map((point) => (
            <span
              key={point.id}
              className={`point ${point.source === "global-raster" ? "raster-point " : ""}${stateFor(point, states)}`}
              title={point.label}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.stopPropagation();
                centerPoint(point, TRACK_ZOOM);
              }}
              style={pointStyle(point, viewBounds)}
            />
          ))}
        </div>
        <div className="map-controls" aria-label="Map controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="secondary" onClick={handleOverview}>
            Full overview
          </button>
          <button
            type="button"
            className={`secondary ${isTrackingRequest ? "active" : ""}`}
            aria-pressed={isTrackingRequest}
            onClick={handleTrackCurrentRequest}
          >
            {isTrackingRequest ? "Tracking request" : "Track request"}
          </button>
        </div>
        <div className="map-progress" aria-label="Map progress">
          <div className="map-progress-copy">
            <span>Map progress</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="map-progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="map-progress-meta">
            <span>
              {summary.completedCases}/{summary.totalCases} cases
            </span>
            <span>{summary.failures} failures</span>
          </div>
          <code>{currentRequest?.id ?? "Waiting for current request"}</code>
        </div>
        <div className="map-legend" aria-label="Map point legend">
          {POINT_LEGEND.map((item) => (
            <span key={item.state}>
              <span className={`point legend-point ${item.state}`} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="coverage-side">
        <p>{queuedCount} queued fixture points are pinned for this profile.</p>
        {hiddenRasterCount > 0 ? <p>{hiddenRasterCount.toLocaleString()} queued global raster points are hidden on the map.</p> : null}
      </div>
    </section>
  );
}

function CoverageHeader({
  view,
  mapKeyAvailable,
  onViewChange
}: {
  view: CoverageView;
  mapKeyAvailable: boolean;
  onViewChange: (view: CoverageView) => void;
}) {
  return (
    <div className="coverage-header">
      <div>
        <span className="eyebrow">Coverage preview</span>
        <h2>{view === "map" ? "Fixture Map Preview" : "Fixture Table"}</h2>
      </div>
      <ViewToggle view={view} mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
    </div>
  );
}

function ViewToggle({
  view,
  mapKeyAvailable,
  onViewChange
}: {
  view: CoverageView;
  mapKeyAvailable: boolean;
  onViewChange: (view: CoverageView) => void;
}) {
  return (
    <div className="segmented" aria-label="Coverage view">
      <button type="button" className={view === "map" ? "active" : ""} disabled={!mapKeyAvailable} onClick={() => onViewChange("map")}>
        Map
      </button>
      <button type="button" className={view === "table" ? "active" : ""} onClick={() => onViewChange("table")}>
        Table
      </button>
    </div>
  );
}

function longitudeToPercent(lon: number): number {
  return ((lon + 180) / 360) * 100;
}

function latitudeToMercatorPercent(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = (clamped * Math.PI) / 180;
  const mercator = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
  return mercator * 100;
}

function longitudeToWorldX(lon: number): number {
  return longitudeToPercent(lon) / 100;
}

function latitudeToWorldY(lat: number): number {
  return latitudeToMercatorPercent(lat) / 100;
}

function worldXToLongitude(x: number): number {
  return x * 360 - 180;
}

function worldYToLatitude(y: number): number {
  const mercator = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

function clampZoom(zoom: number): number {
  return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)).toFixed(2));
}

function visibleWorldSize(zoom: number, mapSize: MapSize): { width: number; height: number } {
  const width = 1 / 2 ** (zoom - 1);
  const aspectHeight = width * (mapSize.height / Math.max(1, mapSize.width));
  return { width: Math.min(1, width), height: Math.min(1, aspectHeight) };
}

function clampViewport(viewport: MapViewport, mapSize: MapSize): MapViewport {
  const zoom = clampZoom(viewport.zoom);
  const visible = visibleWorldSize(zoom, mapSize);
  return {
    zoom,
    centerX: clampCenter(viewport.centerX, visible.width),
    centerY: clampCenter(viewport.centerY, visible.height)
  };
}

function clampCenter(value: number, visibleSize: number): number {
  if (visibleSize >= 1) return 0.5;
  return Math.min(1 - visibleSize / 2, Math.max(visibleSize / 2, value));
}

function boundsForViewport(viewport: MapViewport, mapSize: MapSize) {
  const clamped = clampViewport(viewport, mapSize);
  const visible = visibleWorldSize(clamped.zoom, mapSize);
  return {
    left: clamped.centerX - visible.width / 2,
    top: clamped.centerY - visible.height / 2,
    width: visible.width,
    height: visible.height
  };
}

function tilesForBounds(zoom: number, bounds: ReturnType<typeof boundsForViewport>) {
  const tileCount = 2 ** zoom;
  const startX = Math.max(0, Math.floor(bounds.left * tileCount));
  const endX = Math.min(tileCount - 1, Math.ceil((bounds.left + bounds.width) * tileCount) - 1);
  const startY = Math.max(0, Math.floor(bounds.top * tileCount));
  const endY = Math.min(tileCount - 1, Math.ceil((bounds.top + bounds.height) * tileCount) - 1);
  const tiles: { x: number; y: number; left: number; top: number; size: number }[] = [];

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const tileWorldSize = 1 / tileCount;
      tiles.push({
        x,
        y,
        left: ((x * tileWorldSize - bounds.left) / bounds.width) * 100,
        top: ((y * tileWorldSize - bounds.top) / bounds.height) * 100,
        size: (tileWorldSize / bounds.width) * 100
      });
    }
  }

  return tiles;
}

function pointStyle(point: FixturePoint, bounds: ReturnType<typeof boundsForViewport>): CSSProperties {
  return {
    left: `${((longitudeToWorldX(point.lon) - bounds.left) / bounds.width) * 100}%`,
    top: `${((latitudeToWorldY(point.lat) - bounds.top) / bounds.height) * 100}%`
  };
}
