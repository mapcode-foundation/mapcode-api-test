import type { Discrepancy } from "../../shared/types";

export function DiscrepancyDetail({ item }: { item?: Discrepancy }) {
  return (
    <section className="detail-panel">
      <div className="panel-head">Selected Failure</div>
      <div className="detail-body">
        <span className="label">Canonical diff</span>
        <code>
          {item
            ? item.diffs
                .map((diff) => `${diff.path}: ${JSON.stringify(diff.expected)} -> ${JSON.stringify(diff.actual)}`)
                .join("\n")
            : "No discrepancy selected"}
        </code>
        <span className="label">Reproduce</span>
        <code>{item?.replay ?? "Start a run to capture replay data."}</code>
      </div>
    </section>
  );
}
