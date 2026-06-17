import type { RunSummary as RunSummaryType } from "../../shared/types";

export function RunSummary({ summary }: { summary: RunSummaryType }) {
  return (
    <section className="run-summary" aria-label="Run summary">
      <div className="summary-title">
        <strong>Run Summary</strong>
        <span>
          Seed {summary.seed} - pinned fixture set
        </span>
      </div>
      <Metric label="Requests" value={summary.totalCases} />
      <Metric label="Cases" value={`${summary.completedCases}/${summary.totalCases}`} />
      <Metric label="Failures" value={summary.failures} tone="fail" />
      <Metric label="Round trips" value={summary.roundTrips} />
      <Metric label="Max drift" value={`${summary.maxDriftMeters.toFixed(1)} m`} tone="warn" />
    </section>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone?: "fail" | "warn";
}) {
  return (
    <div className="summary-item">
      <span className="label">{label}</span>
      <b className={tone ? `metric-${tone}` : undefined}>{value}</b>
    </div>
  );
}
