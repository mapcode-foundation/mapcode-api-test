import type { RunSummary as RunSummaryType } from "../../shared/types";

export function RunSummary({ summary }: { summary: RunSummaryType }) {
  return (
    <section className="run-summary" aria-label="Run metrics">
      <Metric label="Requests" value={summary.totalCases} />
      <Metric label="Cases" value={`${summary.completedCases}/${summary.totalCases}`} />
      <Metric label="Failures" value={summary.failures} tone="fail" />
      <Metric label="Round trips" value={summary.roundTrips} />
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
  tone?: "fail";
}) {
  return (
    <div className="summary-item">
      <span className="label">{label}</span>
      <b className={tone ? `metric-${tone}` : undefined}>{value}</b>
    </div>
  );
}
