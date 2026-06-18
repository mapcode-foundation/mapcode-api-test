import { useMemo } from "react";
import type { FixturePoint, PointState } from "../../shared/types";

type CoverageView = "map" | "table";

type CoverageMapProps = {
  points: FixturePoint[];
  states: Record<string, PointState>;
  mapKeyAvailable: boolean;
  view: CoverageView;
  onViewChange: (view: CoverageView) => void;
};

const TILE_COORDS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
] as const;
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

export function CoverageMap({ points, states, mapKeyAvailable, view, onViewChange }: CoverageMapProps) {
  const mapPoints = useMemo(() => points.filter((point) => point.source !== "global-raster"), [points]);
  const hiddenRasterCount = points.length - mapPoints.length;
  const queuedCount = useMemo(
    () => mapPoints.filter((point) => stateFor(point, states) === "queued").length,
    [mapPoints, states]
  );

  if (view === "table" || !mapKeyAvailable) {
    return (
      <section className="coverage-preview">
        <div className="coverage-side">
          <span className="eyebrow">Coverage preview</span>
          <h2>Fixture Table</h2>
          <ViewToggle view="table" mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
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
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="coverage-preview">
      <div className="coverage-map" aria-label="Coverage map preview">
        <div className="tile-map" aria-hidden="true">
          {TILE_COORDS.map(([x, y]) => (
            <img key={`${x}-${y}`} alt="" src={`/api/tomtom/tile/1/${x}/${y}.png`} />
          ))}
        </div>
        <div className="coverage-static-layer" aria-hidden="true">
          {mapPoints.map((point) => (
            <span
              key={point.id}
              className={`point ${stateFor(point, states)}`}
              title={point.label}
              style={{
                left: `${longitudeToPercent(point.lon)}%`,
                top: `${latitudeToMercatorPercent(point.lat)}%`
              }}
            />
          ))}
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
        <span className="eyebrow">Coverage preview</span>
        <h2>Fixture Map Preview</h2>
        <ViewToggle view="map" mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
        <p>{queuedCount} queued fixture points are pinned for this profile.</p>
        {hiddenRasterCount > 0 ? <p>{hiddenRasterCount.toLocaleString()} global raster points are hidden on the map.</p> : null}
      </div>
    </section>
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
