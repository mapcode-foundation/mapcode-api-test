import { useEffect, useMemo, useRef, useState } from "react";
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
  updateRunDelay,
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
  ServiceAvailability,
  ServiceKind,
  ServiceResponse
} from "../shared/types";

const profiles: RunProfileName[] = ["Fast", "Deep"];
const profileDescriptions: Record<RunProfileName, string> = {
  Fast: "Curated city, pole, and ocean coverage for quick parity checks.",
  Deep: "City clouds plus a deterministic 10,000-point global raster."
};
const serviceProgressLabels: Record<ServiceAvailability, string> = {
  unknown: "not started",
  starting: "starting",
  available: "operational",
  unavailable: "failed"
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
  const runStateRef = useRef<RunState>("idle");
  const pendingStartRef = useRef<Promise<void> | undefined>(undefined);
  const [requestDelaySeconds, setRequestDelaySeconds] = useState(0);
  const [report, setReport] = useState<ReportDialogData | undefined>();
  const [services, setServices] = useState<ServicesResponse>(initialServices);
  const [configuringService, setConfiguringService] = useState<ServiceKind | undefined>();
  const [serviceDraftUrl, setServiceDraftUrl] = useState("");
  const [serviceDraftSourcePath, setServiceDraftSourcePath] = useState("");
  const [serviceMessage, setServiceMessage] = useState("");
  const [isAutoStartingServices, setIsAutoStartingServices] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    const pollServices = async () => {
      const nextServices = await Promise.all([
        checkService("java").catch(() => undefined),
        checkService("typescript").catch(() => undefined)
      ]);
      if (cancelled) return;
      setServices((current) => ({
        java: nextServices[0] ?? current.java,
        typescript: nextServices[1] ?? current.typescript
      }));
    };
    const interval = window.setInterval(() => void pollServices(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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
  const canStartRun = services.java.availability === "available" && services.typescript.availability === "available";

  function setRunStateValue(nextState: RunState): void {
    runStateRef.current = nextState;
    setRunState(nextState);
  }

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
        setRunStateValue("stopped");
        break;
      case "service-log":
        setServices((current) => ({
          ...current,
          [event.service]: {
            ...current[event.service],
            logs: [...current[event.service].logs, event.line].slice(-40)
          }
        }));
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

    const startTask = (async () => {
      try {
        const result = await startRun(profile, requestDelaySeconds);
        setRunStateValue(result.state as RunState);
        setLoadMessage(`${result.totalCases} queued requests`);
      } catch (error) {
        setRunStateValue("stopped");
        setLoadMessage(error instanceof Error ? error.message : "Run start failed");
        const serviceState = await getServices().catch(() => undefined);
        if (serviceState) setServices(serviceState);
      } finally {
        pendingStartRef.current = undefined;
      }
    })();
    pendingStartRef.current = startTask;
    await startTask;
  }

  async function handlePauseResume(): Promise<void> {
    try {
      if (runStateRef.current === "paused") {
        setRunStateValue("running");
        await resumeRun();
        return;
      }

      setRunStateValue("paused");
      await pauseRun();
    } catch {
      setRunStateValue("stopped");
      setLoadMessage("Run control failed");
    }
  }

  async function handleStop(): Promise<void> {
    try {
      setRunStateValue("stopped");
      await stopRun();
    } catch {
      setLoadMessage("Run control failed");
    }
  }

  function handleRequestDelayChange(nextDelaySeconds: number): void {
    setRequestDelaySeconds(nextDelaySeconds);
    void applyRequestDelay(nextDelaySeconds);
  }

  async function applyRequestDelay(nextDelaySeconds: number): Promise<void> {
    try {
      await pendingStartRef.current;
      if (runStateRef.current === "running") {
        setRunStateValue("paused");
        await pauseRun();
        await updateRunDelay(nextDelaySeconds);
        await resumeRun();
        setRunStateValue("running");
        return;
      }

      if (runStateRef.current === "paused") {
        await updateRunDelay(nextDelaySeconds);
      }
    } catch {
      setRunStateValue("stopped");
      setLoadMessage("Run speed update failed");
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
    setServiceDraftSourcePath(services[kind].sourcePath);
    setServiceMessage("");
  }

  async function handleCheckService(kind: ServiceKind): Promise<void> {
    const service = await checkService(kind);
    setServices((current) => ({ ...current, [kind]: service }));
  }

  async function handleManualService(kind: ServiceKind): Promise<void> {
    setServiceMessage("Saving service settings");
    try {
      const service = await configureService(kind, serviceDraftUrl, serviceDraftSourcePath);
      setServices((current) => ({ ...current, [kind]: service }));
      setServiceMessage(`${service.label} settings saved; ${serviceProgressLabels[service.availability]}`);
    } catch {
      const serviceState = await getServices().catch(() => undefined);
      if (serviceState) setServices(serviceState);
      setServiceMessage("Service settings could not be saved.");
    }
  }

  async function handleAutoStartService(kind: ServiceKind): Promise<void> {
    setServiceMessage("Starting service");
    try {
      setServices((current) => ({
        ...current,
        [kind]: {
          ...current[kind],
          mode: "auto",
          baseUrl: serviceDraftUrl,
          sourcePath: serviceDraftSourcePath,
          availability: "starting"
        }
      }));
      const service = await startService(kind, serviceDraftUrl, serviceDraftSourcePath);
      setServices((current) => ({ ...current, [kind]: service }));
      setServiceMessage(`${service.label} ${serviceProgressLabels[service.availability]}`);
    } catch {
      const serviceState = await getServices().catch(() => undefined);
      if (serviceState) setServices(serviceState);
      setServiceMessage("Start failed. Check the service logs below.");
    }
  }

  async function handleAutoStartServices(): Promise<void> {
    setIsAutoStartingServices(true);
    setLoadMessage("Starting APIs");
    const startInputs = {
      java: { baseUrl: services.java.baseUrl, sourcePath: services.java.sourcePath },
      typescript: { baseUrl: services.typescript.baseUrl, sourcePath: services.typescript.sourcePath }
    };

    setServices((current) => ({
      java: { ...current.java, mode: "auto", availability: "starting" },
      typescript: { ...current.typescript, mode: "auto", availability: "starting" }
    }));

    try {
      const results = await Promise.allSettled([
        startService("java", startInputs.java.baseUrl, startInputs.java.sourcePath),
        startService("typescript", startInputs.typescript.baseUrl, startInputs.typescript.sourcePath)
      ]);
      const nextServices = await getServices().catch(() => undefined);
      setServices((current) => ({
        java: results[0].status === "fulfilled" ? results[0].value : nextServices?.java ?? current.java,
        typescript: results[1].status === "fulfilled" ? results[1].value : nextServices?.typescript ?? current.typescript
      }));

      const failed = results.filter((result) => result.status === "rejected").length;
      setLoadMessage(failed === 0 ? "APIs started" : `${failed} API start failed`);
    } finally {
      setIsAutoStartingServices(false);
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
        <div className="service-health" aria-label="Service status">
          <button
            type="button"
            className="auto-start-button"
            disabled={isAutoStartingServices}
            onClick={() => void handleAutoStartServices()}
          >
            {isAutoStartingServices ? "Starting APIs" : "Auto-start APIs"}
          </button>
          {(["java", "typescript"] as const).map((kind) => (
            <ServiceStatusButton key={kind} service={services[kind]} onClick={() => openServiceConfig(kind)} />
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
          <button
            type="button"
            className="primary"
            disabled={!canStartRun}
            title={canStartRun ? undefined : "Both APIs must be operational before starting a run."}
            onClick={() => void handleStart()}
          >
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
          <button
            type="button"
            className="danger"
            disabled={runState === "idle" || runState === "stopped"}
            onClick={() => void handleStop()}
          >
            Stop
          </button>
          <label className="speed-control" htmlFor="request-delay">
            <span>Delay</span>
            <input
              id="request-delay"
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={requestDelaySeconds}
              onChange={(event) => handleRequestDelayChange(Number(event.target.value))}
            />
            <b>{requestDelaySeconds === 0 ? "full speed" : `${requestDelaySeconds}s`}</b>
          </label>
          <button type="button" className="secondary" onClick={() => void handleSaveReport()}>
            Save report
          </button>
        </div>
      </section>

      <main className="dashboard-main">
        <RunSummaryView summary={summary} />

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

        <CoverageMap
          points={fixtures}
          requests={cases}
          currentRequest={currentCase}
          summary={summary}
          states={fixtureStates}
          mapKeyAvailable={Boolean(hasTomTomApiKey)}
          view={coverageView}
          onViewChange={setCoverageView}
        />
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
          draftSourcePath={serviceDraftSourcePath}
          message={serviceMessage}
          onDraftUrlChange={setServiceDraftUrl}
          onDraftSourcePathChange={setServiceDraftSourcePath}
          onClose={() => setConfiguringService(undefined)}
          onCheck={() => void handleCheckService(configuringService)}
          onSave={() => void handleManualService(configuringService)}
          onStart={() => void handleAutoStartService(configuringService)}
        />
      ) : null}
      {report ? (
        <ReportDialog
          report={report}
          onClose={() => setReport(undefined)}
          onCopy={() => copyTextToClipboard(report.markdown)}
        />
      ) : null}
    </div>
  );
}

async function copyTextToClipboard(value: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy failed");
  }
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
    sourcePath: "../mapcode-rest-service",
    availability: "unknown",
    logs: []
  },
  typescript: {
    kind: "typescript",
    label: "TypeScript API (ported)",
    mode: "manual",
    baseUrl: "http://127.0.0.1:8082",
    sourcePath: "../mapcode-rest-service-ts",
    availability: "unknown",
    logs: []
  }
};

function ServiceStatusButton({ service, onClick }: { service: ServicesResponse[ServiceKind]; onClick: () => void }) {
  return (
    <button type="button" className={`status-chip ${service.availability}`} onClick={onClick}>
      <span className="status-dot" aria-hidden="true" />
      {service.label} {serviceProgressLabels[service.availability]}
    </button>
  );
}

function ServiceConfigDialog({
  service,
  draftUrl,
  draftSourcePath,
  message,
  onDraftUrlChange,
  onDraftSourcePathChange,
  onClose,
  onCheck,
  onSave,
  onStart
}: {
  service: ServicesResponse[ServiceKind];
  draftUrl: string;
  draftSourcePath: string;
  message: string;
  onDraftUrlChange: (value: string) => void;
  onDraftSourcePathChange: (value: string) => void;
  onClose: () => void;
  onCheck: () => void;
  onSave: () => void;
  onStart: () => void;
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
          <label className="input-label" htmlFor="service-source-path">
            Source repository path
          </label>
          <input
            id="service-source-path"
            value={draftSourcePath}
            onChange={(event) => onDraftSourcePathChange(event.target.value)}
          />
          <div className="modal-actions service-actions">
            <button type="button" className="secondary" onClick={onCheck}>
              Check
            </button>
            <button type="button" className="secondary" onClick={onSave}>
              Save settings
            </button>
            <button type="button" className="primary" onClick={onStart}>
              Start
            </button>
          </div>
          <div className={`service-progress ${service.availability}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span>{serviceProgressLabels[service.availability]}</span>
          </div>
          <p className={service.availability === "available" ? "success" : "error"}>
            {message || `${serviceProgressLabels[service.availability]} at ${service.baseUrl}`}
          </p>
          <pre className="service-log">{service.logs.length > 0 ? service.logs.join("\n") : "No service logs yet."}</pre>
        </div>
      </section>
    </div>
  );
}
