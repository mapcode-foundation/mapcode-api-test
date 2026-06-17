import type { Discrepancy } from "../../shared/types";

export function DiscrepancyList({
  items,
  selectedId,
  onSelect
}: {
  items: Discrepancy[];
  selectedId?: string;
  onSelect: (item: Discrepancy) => void;
}) {
  return (
    <section className="list-panel">
      <div className="panel-head">
        <span>Discrepancies</span>
        <span>{items.length}</span>
      </div>
      <div className="failure-list">
        {items.length === 0 ? <div className="empty-list">No discrepancies captured</div> : null}
        {items.map((item) => (
          <button
            key={item.id}
            className={`failure ${selectedId === item.id ? "selected" : ""}`}
            onClick={() => onSelect(item)}
            type="button"
          >
            <strong>{item.endpoint}</strong>
            <span>
              {item.caseId} - {item.format.toUpperCase()}
            </span>
            <span className="kind">{item.summary}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
