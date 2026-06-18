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
  const [actionStatus, setActionStatus] = useState("");

  async function saveMarkdown(): Promise<void> {
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
    const fileName = report.paths.markdownPath.split("/").pop() ?? "mapcode-parity-report.md";

    if (await writeWithSavePicker(fileName, blob)) {
      setActionStatus(`Saved to ${fileName}`);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setActionStatus(`Saved to ${report.paths.markdownPath}`);
  }

  async function copyToClipboard(): Promise<void> {
    setActionStatus("Copied to clipboard");
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
          {actionStatus ? (
            <span className="copy-status" role="status" aria-live="polite">
              {actionStatus}
            </span>
          ) : null}
          <button type="button" className="secondary" onClick={() => void saveMarkdown()}>
            Save
          </button>
          <button type="button" className="primary" onClick={() => void copyToClipboard()}>
            Copy to Clipboard
          </button>
        </div>
      </section>
    </div>
  );
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }> }>;

async function writeWithSavePicker(fileName: string, blob: Blob): Promise<boolean> {
  const picker = (window as typeof window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) return false;

  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: "Markdown report", accept: { "text/markdown": [".md"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
