import { useState } from "react";

export type ReportDialogData = {
  markdown: string;
  html: string;
  paths: { markdownPath: string; jsonPath: string };
};

export function ReportDialog({
  report,
  onClose,
  onCopy
}: {
  report: ReportDialogData;
  onClose: () => void;
  onCopy: () => Promise<void> | void;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  function saveMarkdown(): void {
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = report.paths.markdownPath.split("/").pop() ?? "mapcode-parity-report.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(): Promise<void> {
    setCopyStatus("Copied to clipboard");
    await Promise.resolve(onCopy()).catch(() => undefined);
  }

  return (
    <div className="modal-backdrop">
      <section className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="modal-head report-head">
          <div>
            <span className="eyebrow">Report preview</span>
            <h2 id="report-title">Saved parity report</h2>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="report-preview" dangerouslySetInnerHTML={{ __html: report.html }} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={saveMarkdown}>
            Save
          </button>
          <button type="button" className="primary" onClick={() => void copyToClipboard()}>
            Copy to Clipboard
          </button>
          {copyStatus ? (
            <span className="copy-status" role="status" aria-live="polite">
              {copyStatus}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
