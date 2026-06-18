import { useEffect, useMemo, useRef, useState } from "react";
import type { FixturePoint, PointState } from "../../shared/types";

type CoverageView = "map" | "table";

type TomTomMap = {
  remove: () => void;
  resize?: () => void;
  on: (event: "load" | "error", handler: (event?: unknown) => void) => void;
};

type CoverageMapProps = {
  points: FixturePoint[];
  states: Record<string, PointState>;
  mapKeyAvailable: boolean;
  view: CoverageView;
  onViewChange: (view: CoverageView) => void;
  apiKey?: string;
};

declare global {
  interface Window {
    tt?: {
      map: (options: { key: string; container: HTMLElement; center: [number, number]; zoom: number }) => TomTomMap;
    };
  }
}

const TT_SDK_VERSION = "6.25.1";

function stateFor(point: FixturePoint, states: Record<string, PointState>): PointState {
  return states[point.id] ?? "queued";
}

export function CoverageMap({ points, states, mapKeyAvailable, view, onViewChange, apiKey }: CoverageMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [sdkStatus, setSdkStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [serverApiKey, setServerApiKey] = useState<string | undefined>();
  const trimmedApiKey = apiKey?.trim() || serverApiKey;
  const queuedCount = useMemo(() => points.filter((point) => stateFor(point, states) === "queued").length, [points, states]);

  useEffect(() => {
    if (view !== "map" || !mapKeyAvailable || trimmedApiKey) return undefined;

    let cancelled = false;
    fetch("/api/config/tomtom-map-key")
      .then((response) => {
        if (!response.ok) throw new Error("Map key unavailable");
        return response.json() as Promise<{ key: string }>;
      })
      .then(({ key }) => {
        if (!cancelled) setServerApiKey(key);
      })
      .catch(() => {
        if (!cancelled) setSdkStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [mapKeyAvailable, trimmedApiKey, view]);

  useEffect(() => {
    if (view !== "map" || !mapRef.current || !trimmedApiKey) return undefined;

    let cancelled = false;
    let map: TomTomMap | undefined;
    setSdkStatus("loading");

    async function loadTomTomMap() {
      try {
        loadStyle(`https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/${TT_SDK_VERSION}/maps/maps.css`);
        await loadScript(`https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/${TT_SDK_VERSION}/maps/maps-web.min.js`);

        const key = trimmedApiKey;
        if (cancelled || !mapRef.current || !window.tt || !key) return;

        map = window.tt.map({
          key,
          container: mapRef.current,
          center: [0, 20],
          zoom: 1
        });
        map.on("load", () => {
          if (!cancelled) setSdkStatus("ready");
        });
        map.on("error", () => {
          if (!cancelled) setSdkStatus("failed");
        });
        map.resize?.();
      } catch {
        if (!cancelled) setSdkStatus("failed");
      }
    }

    void loadTomTomMap();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [trimmedApiKey, view]);

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
        <ViewToggle view="map" mapKeyAvailable={mapKeyAvailable} onViewChange={onViewChange} />
        <p>{queuedCount} queued fixture points are pinned for this profile.</p>
        {sdkStatus === "loading" ? <p>Loading TomTom map tiles.</p> : null}
        {sdkStatus === "failed" ? <p className="error">TomTom map tiles did not load, so the static preview is shown.</p> : null}
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

function loadStyle(href: string): void {
  const id = `tt-style-${TT_SDK_VERSION}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  const id = `tt-script-${TT_SDK_VERSION}`;
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("TomTom SDK failed to load")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("TomTom SDK failed to load"));
    document.head.appendChild(script);
  });
}
