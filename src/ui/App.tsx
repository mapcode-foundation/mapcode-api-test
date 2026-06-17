import { useEffect, useMemo, useState } from "react";
import { connectEvents, getCases, getConfig, getFixtures, pauseRun, resumeRun, saveReport, startRun, stopRun } from "./api";
import { CoverageMap } from "./components/CoverageMap";
import { DiscrepancyDetail } from "./components/DiscrepancyDetail";
import { DiscrepancyList } from "./components/DiscrepancyList";
import { RunSummary as RunSummaryView } from "./components/RunSummary";
import { ServicePane } from "./components/ServicePane";
import { TomTomKeyDialog } from "./components/TomTomKeyDialog";
import type {
  Discrepancy,
  FixturePoint,
  PointState,
  RequestCase,
  RunnerEvent,
  RunProfileName,
  RunSummary,
  ServiceResponse
} from "../shared/types";

const profiles: RunProfileName[] = ["Fast", "Deep", "Custom"];

const initialSummary: RunSummary = {
  runId: "preview",
  profile: "Fast",
  seed: 20260617,
  totalCases: 0,
  completedCases: 0,
  failures: 0,
  roundTrips: 0,
  maxDriftMeters: 0
};

type RunState = "idle" | "running" | "paused" | "stopped";
type ReportPaths = { markdownPath: string; jsonPath: string };

function queuedFixtureStates(points: FixturePoint[]): Record<string, PointState> {
  return Object.fromEntries(points.map((point) => [point.id, "queued" as PointState]));
}

export function App() {
  const [profile, setProfile] = useState<RunProfileName>("Fast");
  const [summary, setSummary] = useState<RunSummary>(initialSummary);
  const [fixtures, setFixtures] = useState<FixturePoint[]>([]);
  const [cases, setCases] = useState<RequestCase[]>([]);
  const [fixtureStates, setFixtureStates] = useState<Record<string, PointState>>({});
  const [currentRequest, setCurrentRequest] = useState<RequestCase | undefined>();
  const [javaResponse, setJavaResponse] = useState<ServiceResponse | undefined>();
  const [typescriptResponse, setTypeScriptResponse] = useState<ServiceResponse | undefined>();
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<Discrepancy | undefined>();
  const [hasTomTomApiKey, setHasTomTomApiKey] = useState<boolean | undefined>();
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [runtimeTomTomApiKey, setRuntimeTomTomApiKey] = useState<string | undefined>();
  const [runState, setRunState] = useState<RunState>("idle");
  const [reportPaths, setReportPaths] = useState<ReportPaths | undefined>();
  const [loadMessage, setLoadMessage] = useState("Loading coordinator state");

  useEffect(() => {
    let cancelled = false;

    Promise.all([getConfig(), getFixtures()])
      .then(([config, fixtureSet]) => {
        if (cancelled) return;
        setHasTomTomApiKey(config.hasTomTomApiKey);
        setFixtures(fixtureSet.points);
        setFixtureStates(queuedFixtureStates(fixtureSet.points));
        setSummary((current) => ({ ...current, seed: fixtureSet.seed }));
        setLoadMessage(`${fixtureSet.points.length} fixtures pinned`);
        if (!config.hasTomTomApiKey) setIsMapModalOpen(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadMessage("Coordinator data unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getCases(profile)
      .then((nextCases) => {
        if (cancelled) return;
        setCases(nextCases);
        setDiscrepancies([]);
        setSelectedDiscrepancy(undefined);
        setCurrentRequest(undefined);
        setJavaResponse(undefined);
        setTypeScriptResponse(undefined);
        setFixtureStates(queuedFixtureStates(fixtures));
        setSummary((current) => ({
          ...current,
          profile,
          totalCases: nextCases.length,
          completedCases: 0,
          failures: 0,
          roundTrips: 0,
          maxDriftMeters: 0
        }));
        setReportPaths(undefined);
      })
      .catch(() => {
        if (cancelled) return;
        setCases([]);
        setLoadMessage("Request cases unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => connectEvents(handleRunnerEvent), []);

  const currentCase = useMemo(() => currentRequest ?? cases[0], [cases, currentRequest]);
  const progress = useMemo(() => {
    if (summary.totalCases === 0) return 0;
    return Math.round((summary.completedCases / summary.totalCases) * 100);
  }, [summary.completedCases, summary.totalCases]);

  const selectedDiscrepancyId = selectedDiscrepancy?.id;
  const hasBrowserTomTomKey = Boolean(runtimeTomTomApiKey);
  const mapKeyStatus =
    hasTomTomApiKey === undefined
      ? "checking map key"
      : hasBrowserTomTomKey
        ? "map key in browser"
        : hasTomTomApiKey
          ? "map key on server"
          : "map key missing";
  const showTomTomModal = isMapModalOpen && !hasBrowserTomTomKey;

  function handleRunnerEvent(event: unknown): void {
    if (!isRunnerEvent(event)) return;

    switch (event.type) {
      case "run-summary":
        setSummary(event.summary);
        break;
      case "point-state":
        setFixtureStates((current) => ({ ...current, [event.fixtureId]: event.state }));
        break;
      case "current-case":
        setCurrentRequest(event.request);
        setJavaResponse(event.java);
        setTypeScriptResponse(event.typescript);
        break;
      case "discrepancy":
        setDiscrepancies((current) =>
          current.some((item) => item.id === event.discrepancy.id) ? current : [...current, event.discrepancy]
        );
        setSelectedDiscrepancy((current) => current ?? event.discrepancy);
        break;
      case "run-complete":
        setSummary(event.summary);
        setRunState("stopped");
        break;
      case "service-log":
        break;
    }
  }

  async function handleStart(): Promise<void> {
    setRunState("running");
    setDiscrepancies([]);
    setSelectedDiscrepancy(undefined);
    setCurrentRequest(undefined);
    setJavaResponse(undefined);
    setTypeScriptResponse(undefined);
    setFixtureStates(queuedFixtureStates(fixtures));
    setReportPaths(undefined);

    try {
      await startRun(profile);
    } catch {
      setRunState("stopped");
      setLoadMessage("Run start failed");
    }
  }

  async function handlePauseResume(): Promise<void> {
    try {
      if (runState === "paused") {
        setRunState("running");
        await resumeRun();
        return;
      }

      setRunState("paused");
      await pauseRun();
    } catch {
      setRunState("stopped");
      setLoadMessage("Run control failed");
    }
  }

  async function handleStop(): Promise<void> {
    try {
      setRunState("stopped");
      await stopRun();
    } catch {
      setLoadMessage("Run control failed");
    }
  }

  async function handleSaveReport(): Promise<void> {
    try {
      setReportPaths(await saveReport());
    } catch {
      setLoadMessage("Report save failed");
    }
  }

  return (
    <div className="app-shell">
      <header className="dashboard-header">
        <div className="brand-block">
          <span className="eyebrow">Parity dashboard</span>
          <h1>Mapcode REST Parity Runner</h1>
          <p>
            Run {summary.runId} - {summary.profile} profile - {loadMessage}
          </p>
        </div>
        <div className="service-health" aria-label="Managed service status">
          <span className="status-chip ready">
            <span className="status-dot" aria-hidden="true" />
            Java Leading API managed
          </span>
          <span className="status-chip ready">
            <span className="status-dot" aria-hidden="true" />
            TypeScript Port managed
          </span>
          <span className="status-chip muted">{mapKeyStatus}</span>
        </div>
      </header>

      <section className="toolbar" aria-label="Run controls">
        <label className="profile-control" htmlFor="profile-select">
          <span>Profile</span>
          <select
            id="profile-select"
            value={profile}
            onChange={(event) => setProfile(event.target.value as RunProfileName)}
          >
            {profiles.map((profileName) => (
              <option key={profileName} value={profileName}>
                {profileName}
              </option>
            ))}
          </select>
        </label>

        <div className="progress-block">
          <div className="progress-copy">
            <span>{runState}</span>
            <b>
              {summary.completedCases}/{summary.totalCases} cases
            </b>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Run progress"
          >
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="run-controls">
          <button type="button" className="primary" onClick={() => void handleStart()}>
            Start
          </button>
          <button
            type="button"
            className="secondary"
            disabled={runState === "idle" || runState === "stopped"}
            onClick={() => void handlePauseResume()}
          >
            {runState === "paused" ? "Resume" : "Pause"}
          </button>
          <button type="button" className="secondary" onClick={() => setIsMapModalOpen(true)}>
            Preview map
          </button>
          <button type="button" className="secondary" onClick={() => void handleSaveReport()}>
            Save report
          </button>
          <button
            type="button"
            className="danger"
            disabled={runState === "idle" || runState === "stopped"}
            onClick={() => void handleStop()}
          >
            Stop
          </button>
        </div>
      </section>

      <main className="dashboard-main">
        <RunSummaryView summary={summary} />
        <CoverageMap
          points={fixtures}
          states={fixtureStates}
          mapEnabled={hasBrowserTomTomKey}
          apiKey={runtimeTomTomApiKey}
        />

        <section className="workspace" aria-label="Runner workspace">
          <div className="service-stack">
            <div className="workspace-head">
              <div>
                <span className="eyebrow">Current request</span>
                <h2>{currentCase?.id ?? "Waiting for case catalog"}</h2>
              </div>
              <span className="catalog-count">{cases.length} queued requests</span>
            </div>
            <div className="service-grid">
              <ServicePane title="Java Leading API" request={currentCase} response={javaResponse} />
              <ServicePane title="TypeScript Port" request={currentCase} response={typescriptResponse} />
            </div>
          </div>

          <aside className="inspector-stack" aria-label="Failure inspector">
            <DiscrepancyList items={discrepancies} selectedId={selectedDiscrepancyId} onSelect={setSelectedDiscrepancy} />
            <DiscrepancyDetail item={selectedDiscrepancy} />
            {reportPaths ? (
              <div className="save-note">
                Saved {reportPaths.markdownPath} and {reportPaths.jsonPath}
              </div>
            ) : null}
          </aside>
        </section>
      </main>

      {showTomTomModal ? (
        <TomTomKeyDialog
          onSkip={() => setIsMapModalOpen(false)}
          onSaved={(key) => {
            setRuntimeTomTomApiKey(key);
            setHasTomTomApiKey(true);
            setIsMapModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function isRunnerEvent(event: unknown): event is RunnerEvent {
  return Boolean(event && typeof event === "object" && "type" in event);
}
