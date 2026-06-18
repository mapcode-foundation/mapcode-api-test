import { useEffect, useMemo, useState } from "react";
import {
  checkService,
  configureService,
  connectEvents,
  getCases,
  getConfig,
  getFixtures,
  getServices,
  pauseRun,
  resumeRun,
  saveReport,
  startRun,
  startService,
  stopRun,
  type ServicesResponse
} from "./api";
import { CoverageMap } from "./components/CoverageMap";
import { DiscrepancyDetail } from "./components/DiscrepancyDetail";
import { DiscrepancyList } from "./components/DiscrepancyList";
import { ReportDialog, type ReportDialogData } from "./components/ReportDialog";
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
  ServiceKind,
  ServiceResponse
} from "../shared/types";

const profiles: RunProfileName[] = ["Fast", "Deep"];
const profileDescriptions: Record<RunProfileName, string> = {
  Fast: "Curated city, pole, and ocean coverage for quick parity checks.",
  Deep: "City clouds plus a deterministic 10,000-point global raster."
};

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
type CoverageView = "map" | "table";

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
  const [coverageView, setCoverageView] = useState<CoverageView>("table");
  const [runState, setRunState] = useState<RunState>("idle");
  const [report, setReport] = useState<ReportDialogData | undefined>();
  const [services, setServices] = useState<ServicesResponse>(initialServices);
  const [configuringService, setConfiguringService] = useState<ServiceKind | undefined>();
  const [serviceDraftUrl, setServiceDraftUrl] = useState("");
  const [serviceMessage, setServiceMessage] = useState("");
  const [loadMessage, setLoadMessage] = useState("Loading coordinator state");

  useEffect(() => {
    let cancelled = false;

    Promise.all([getConfig(), getFixtures(), getServices()])
      .then(([config, fixtureSet, serviceState]) => {
        if (cancelled) return;
        setHasTomTomApiKey(config.hasTomTomApiKey);
        setCoverageView(config.hasTomTomApiKey ? "map" : "table");
        setFixtures(fixtureSet.points);
        setFixtureStates(queuedFixtureStates(fixtureSet.points));
        setServices(serviceState);
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

    Promise.all([getCases(profile), getFixtures(profile)])
      .then(([nextCases, fixtureSet]) => {
        if (cancelled) return;
        setCases(nextCases);
        setFixtures(fixtureSet.points);
        setDiscrepancies([]);
        setSelectedDiscrepancy(undefined);
        setCurrentRequest(undefined);
        setJavaResponse(undefined);
        setTypeScriptResponse(undefined);
        setFixtureStates(queuedFixtureStates(fixtureSet.points));
        setSummary((current) => ({
          ...current,
          seed: fixtureSet.seed,
          profile,
          totalCases: nextCases.length,
          completedCases: 0,
          failures: 0,
          roundTrips: 0,
          maxDriftMeters: 0
        }));
        setReport(undefined);
        setLoadMessage(`${fixtureSet.points.length} fixtures pinned`);
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
  const mapKeyStatus =
    hasTomTomApiKey === undefined
      ? "checking map key"
      : hasTomTomApiKey
          ? "map key on server"
          : "map key missing";
  const showTomTomModal = isMapModalOpen && !hasTomTomApiKey;

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
      case "service-status":
        setServices(event.services);
        break;
    }
  }

  async function handleStart(): Promise<void> {
    setDiscrepancies([]);
    setSelectedDiscrepancy(undefined);
    setCurrentRequest(undefined);
    setJavaResponse(undefined);
    setTypeScriptResponse(undefined);
    setFixtureStates(queuedFixtureStates(fixtures));
    setReport(undefined);

    try {
      const result = await startRun(profile);
      setRunState(result.state as RunState);
      setLoadMessage(`${result.totalCases} queued requests`);
    } catch (error) {
      setRunState("stopped");
      setLoadMessage(error instanceof Error ? error.message : "Run start failed");
      const serviceState = await getServices().catch(() => undefined);
      if (serviceState) setServices(serviceState);
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
      const saved = await saveReport();
      setReport({
        markdown: saved.markdown,
        html: saved.html,
        paths: { markdownPath: saved.markdownPath, jsonPath: saved.jsonPath }
      });
    } catch {
      setLoadMessage("Report save failed");
    }
  }

  function openServiceConfig(kind: ServiceKind): void {
    setConfiguringService(kind);
    setServiceDraftUrl(services[kind].baseUrl);
    setServiceMessage("");
  }

  async function handleCheckService(kind: ServiceKind): Promise<void> {
    const service = await checkService(kind);
    setServices((current) => ({ ...current, [kind]: service }));
  }

  async function handleManualService(kind: ServiceKind): Promise<void> {
    setServiceMessage("Checking service URL");
    try {
      const service = await configureService(kind, serviceDraftUrl);
      setServices((current) => ({ ...current, [kind]: service }));
      setServiceMessage(`${service.label} available`);
      setConfiguringService(undefined);
    } catch {
      const serviceState = await getServices().catch(() => undefined);
      if (serviceState) setServices(serviceState);
      setServiceMessage("Service did not respond with the Mapcode API help page.");
    }
  }

  async function handleAutoStartService(kind: ServiceKind): Promise<void> {
    setServiceMessage("Starting service");
    try {
      const service = await startService(kind, serviceDraftUrl);
      setServices((current) => ({ ...current, [kind]: service }));
      setServiceMessage(service.availability === "available" ? `${service.label} available` : `${service.label} unavailable`);
      if (service.availability === "available") setConfiguringService(undefined);
    } catch {
      const serviceState = await getServices().catch(() => undefined);
      if (serviceState) setServices(serviceState);
      setServiceMessage("Automatic start failed. Check the service logs below.");
    }
  }

  function handlePreviewMap(): void {
    if (hasTomTomApiKey) {
      setCoverageView("map");
      return;
    }
    setIsMapModalOpen(true);
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
        <div className="service-health" aria-label="Service status">
          {(["java", "typescript"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`status-chip ${services[kind].availability}`}
              onClick={() => openServiceConfig(kind)}
            >
              <span className="status-dot" aria-hidden="true" />
              {services[kind].label} {services[kind].availability}
            </button>
          ))}
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
          <span className="profile-help">{profileDescriptions[profile]}</span>
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
          <button type="button" className="secondary" onClick={handlePreviewMap}>
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
          mapKeyAvailable={Boolean(hasTomTomApiKey)}
          view={coverageView}
          onViewChange={setCoverageView}
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
              <ServicePane title="Java API (leading)" request={currentCase} response={javaResponse} />
              <ServicePane title="TypeScript API (ported)" request={currentCase} response={typescriptResponse} />
            </div>
          </div>

          <aside className="inspector-stack" aria-label="Failure inspector">
            <DiscrepancyList items={discrepancies} selectedId={selectedDiscrepancyId} onSelect={setSelectedDiscrepancy} />
            <DiscrepancyDetail item={selectedDiscrepancy} />
          </aside>
        </section>
      </main>

      {showTomTomModal ? (
        <TomTomKeyDialog
          onSkip={() => setIsMapModalOpen(false)}
          onSaved={() => {
            setHasTomTomApiKey(true);
            setCoverageView("map");
            setIsMapModalOpen(false);
          }}
        />
      ) : null}
      {configuringService ? (
        <ServiceConfigDialog
          service={services[configuringService]}
          draftUrl={serviceDraftUrl}
          message={serviceMessage}
          onDraftUrlChange={setServiceDraftUrl}
          onClose={() => setConfiguringService(undefined)}
          onCheck={() => void handleCheckService(configuringService)}
          onManual={() => void handleManualService(configuringService)}
          onAutoStart={() => void handleAutoStartService(configuringService)}
        />
      ) : null}
      {report ? (
        <ReportDialog
          report={report}
          onClose={() => setReport(undefined)}
          onCopy={() => {
            void navigator.clipboard.writeText(report.markdown);
          }}
        />
      ) : null}
    </div>
  );
}

function isRunnerEvent(event: unknown): event is RunnerEvent {
  return Boolean(event && typeof event === "object" && "type" in event);
}

const initialServices: ServicesResponse = {
  java: {
    kind: "java",
    label: "Java API (leading)",
    mode: "manual",
    baseUrl: "http://127.0.0.1:8081",
    availability: "unknown",
    logs: []
  },
  typescript: {
    kind: "typescript",
    label: "TypeScript API (ported)",
    mode: "manual",
    baseUrl: "http://127.0.0.1:8082",
    availability: "unknown",
    logs: []
  }
};

function ServiceConfigDialog({
  service,
  draftUrl,
  message,
  onDraftUrlChange,
  onClose,
  onCheck,
  onManual,
  onAutoStart
}: {
  service: ServicesResponse[ServiceKind];
  draftUrl: string;
  message: string;
  onDraftUrlChange: (value: string) => void;
  onClose: () => void;
  onCheck: () => void;
  onManual: () => void;
  onAutoStart: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="service-config-title">
        <div className="modal-head report-head">
          <div>
            <span className="eyebrow">Service configuration</span>
            <h2 id="service-config-title">{service.label}</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="service-config-grid">
          <label className="input-label" htmlFor="service-url">
            Specify URL/port
          </label>
          <input id="service-url" value={draftUrl} onChange={(event) => onDraftUrlChange(event.target.value)} />
          <div className="modal-actions service-actions">
            <button type="button" className="secondary" onClick={onCheck}>
              Check
            </button>
            <button type="button" className="secondary" onClick={onManual}>
              Use URL
            </button>
            <button type="button" className="primary" onClick={onAutoStart}>
              Start automatically
            </button>
          </div>
          <p className={service.availability === "available" ? "success" : "error"}>{message || `${service.availability} at ${service.baseUrl}`}</p>
          <pre className="service-log">{service.logs.length > 0 ? service.logs.join("\n") : "No service logs yet."}</pre>
        </div>
      </section>
    </div>
  );
}
