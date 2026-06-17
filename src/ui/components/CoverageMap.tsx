import { useEffect, useMemo, useRef, useState } from "react";
import type { FixturePoint, PointState } from "../../shared/types";

type TomTomMapHandle = {
  mapLibreMap?: {
    remove: () => void;
    resize?: () => void;
  };
};

type CoverageMapProps = {
  points: FixturePoint[];
  states: Record<string, PointState>;
  mapEnabled: boolean;
  apiKey?: string;
};

function stateFor(point: FixturePoint, states: Record<string, PointState>): PointState {
  return states[point.id] ?? "queued";
}

export function CoverageMap({ points, states, mapEnabled, apiKey }: CoverageMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [sdkFailed, setSdkFailed] = useState(false);
  const trimmedApiKey = apiKey?.trim();
  const queuedCount = useMemo(() => points.filter((point) => stateFor(point, states) === "queued").length, [points, states]);

  useEffect(() => {
    if (!mapEnabled || !mapRef.current) return undefined;

    let cancelled = false;
    let map: TomTomMapHandle | undefined;
    setSdkFailed(false);

    async function loadTomTomMap() {
      try {
        const [{ TomTomConfig }, { TomTomMap }] = await Promise.all([
          import("@tomtom-org/maps-sdk/core"),
          import("@tomtom-org/maps-sdk/map")
        ]);

        if (cancelled || !mapRef.current) return;
        if (!trimmedApiKey && !TomTomConfig.instance.get().apiKey) return;
        if (trimmedApiKey) TomTomConfig.instance.put({ apiKey: trimmedApiKey });

        map = new TomTomMap({
          mapLibre: {
            container: mapRef.current,
            center: [0, 20],
            zoom: 1
          }
        });
        map.mapLibreMap?.resize?.();
      } catch {
        if (!cancelled) setSdkFailed(true);
      }
    }

    void loadTomTomMap();

    return () => {
      cancelled = true;
      map?.mapLibreMap?.remove();
    };
  }, [mapEnabled, trimmedApiKey]);

  if (!mapEnabled) {
    return (
      <section className="coverage-preview">
        <div className="coverage-side">
          <span className="eyebrow">Coverage preview</span>
          <h2>Fixture Table</h2>
          <table className="fixture-table">
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
        <div ref={mapRef} className="tomtom-map" aria-hidden="true" />
        <div className="coverage-static-layer" aria-hidden="true">
          {points.map((point) => (
            <span
              key={point.id}
              className={`point ${stateFor(point, states)}`}
              title={point.label}
              style={{
                left: `${((point.lon + 180) / 360) * 100}%`,
                top: `${((90 - point.lat) / 180) * 100}%`
              }}
            />
          ))}
        </div>
      </div>
      <div className="coverage-side">
        <span className="eyebrow">Coverage preview</span>
        <h2>Fixture Map Preview</h2>
        <p>{queuedCount} queued fixture points are pinned for this profile.</p>
        {sdkFailed ? <p className="error">TomTom map SDK did not load, so the static preview is shown.</p> : null}
      </div>
    </section>
  );
}
