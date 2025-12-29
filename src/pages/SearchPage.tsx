import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchVesselByImo } from "../api/client";

export default function SearchPage() {
  const [imo, setImo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = imo.trim();
    if (!q) return;

    // When user explicitly clicks Search, call the external VMS vessel endpoint
    setLoading(true);
    setError(null);
    try {
      const report = await fetchVesselByImo(q);
      // navigate to report page and pass report in location state to avoid needing to persist it server-side
      navigate(`/reports/${report.reportId}`, { state: report });
    } catch (err: any) {
      // Handle not-found sentinel thrown by client
      const msg = err?.message || "";
      if (msg.startsWith("NO_DATA") || msg.includes("No inspection found")) {
        setError("No data found for the given IMO");
      } else {
        setError(err.message || "Failed to fetch");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSearch} style={{ marginBottom: 16 }}>
        <label>IMO number</label>
        <div>
          <input
            value={imo}
            onChange={(e) => setImo(e.target.value)}
            placeholder="e.g., 1234567"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !imo.trim()}
            style={{ marginLeft: 8 }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {error && <div style={{ color: "red" }}>{error}</div>}

      {loading && <div>Searching...</div>}
    </div>
  );
}
