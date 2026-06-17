import { useState } from "react";

export function TomTomKeyDialog({ onSaved, onSkip }: { onSaved: (key: string) => void; onSkip: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    const trimmedKey = key.trim();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/config/tomtom-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: trimmedKey })
      });
      if (!response.ok) {
        setError("Enter a valid TomTom API key or skip the map preview.");
        return;
      }
      onSaved(trimmedKey);
    } catch {
      setError("Enter a valid TomTom API key or skip the map preview.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal key-modal" role="dialog" aria-modal="true" aria-labelledby="tomtom-key-title">
        <div className="modal-head">
          <span className="eyebrow">Preview map</span>
          <h2 id="tomtom-key-title">TomTom API key required for map preview</h2>
        </div>
        <p>No TOMTOM_API_KEY was found in .env. Enter one to enable the map, or skip to continue with the fixture table.</p>
        <label className="input-label" htmlFor="tomtom-key">
          TomTom API key
        </label>
        <input
          id="tomtom-key"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="Paste API key"
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onSkip}>
            Skip map
          </button>
          <button type="button" className="primary" disabled={isSaving} onClick={save}>
            Save key
          </button>
        </div>
      </section>
    </div>
  );
}
