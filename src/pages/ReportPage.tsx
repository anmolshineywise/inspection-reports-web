import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getReport, saveReport, fetchVesselByImo } from "../api/client";
import { Report, ImageRef } from "../types";
import Badge from "../components/Badge";
import Lightbox from "../components/Lightbox";

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // subsections open state, stored in localStorage per report
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // lightbox
  const [lightboxImages, setLightboxImages] = useState<ImageRef[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // category open state (must be declared unconditionally to keep hooks order stable)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  // edit mode and editable copy
  const [editMode, setEditMode] = useState(false)
  const [edited, setEdited] = useState<Report | null>(null)
  const [status, setStatus] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [externalResult, setExternalResult] = useState<{ success: boolean; status?: number; body?: any; error?: string; payload?: any } | null>(null)
  const [directAttempted, setDirectAttempted] = useState<boolean | null>(null)

  useEffect(() => {
    if (report) {
      // create a deep copy for editing
      setEdited(JSON.parse(JSON.stringify(report)))
      setStatus((report as any).status || '')
      setDirectAttempted(null)
    } else {
      setEdited(null)
      setStatus('')
      setDirectAttempted(null)
    }
  }, [report])

  const location = useLocation();

  useEffect(() => {
    // If the route provided a Report object in location.state, use it directly
    const stateReport = location && (location.state as Report | undefined);
    if (stateReport && stateReport.reportId) {
      setReport(stateReport);
      try {
        const raw = localStorage.getItem(
          `openSubsections_${stateReport.reportId}`
        );
        if (raw) setOpenMap(JSON.parse(raw));
      } catch (err) {
        /* ignore */
      }
      return;
    }

    if (!reportId) return;
    setLoading(true);
    setError(null);

    // If this looks like a VMS-generated reportId (vms-<imo>-<date>), extract the IMO
    // and fetch by IMO only. This prevents sending the full slug to the server on refresh.
    const vmsMatch = /^vms-(\d+)-/.exec(reportId);
    if (vmsMatch) {
      const imo = vmsMatch[1];
      fetchVesselByImo(imo)
        .then((r) => {
          setReport(r);
          try {
            const raw = localStorage.getItem(`openSubsections_${r.reportId}`);
            if (raw) setOpenMap(JSON.parse(raw));
          } catch (err) {
            /* ignore */
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
      return;
    }

    // Fallback: load a persisted report by its full id
    getReport(reportId)
      .then((r) => {
        setReport(r);
        // load openMap from localStorage
        try {
          const raw = localStorage.getItem(`openSubsections_${r.reportId}`);
          if (raw) setOpenMap(JSON.parse(raw));
        } catch (err) {
          /* ignore */
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reportId, location]);

  function toggleOpen(id: string) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (report)
        localStorage.setItem(
          `openSubsections_${report.reportId}`,
          JSON.stringify(next)
        );
      return next;
    });
  }

  function openLightbox(images: ImageRef[] | undefined, index = 0) {
    if (!images || images.length === 0) return;
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  function closeLightbox() {
    setLightboxOpen(false);
    setLightboxImages([]);
    setLightboxIndex(0);
  }

  if (loading) return <div>Loading report...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!report) return <div>No report found</div>;

  function formatInspectionDate(d?: string) {
    if (!d) return "-";
    // support formats like 24_12_2025 or ISO timestamps
    if (/^\d{1,2}_\d{1,2}_\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split("_").map(Number);
      try {
        const dt = new Date(yyyy, mm - 1, dd);
        return dt.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch {
        return d;
      }
    }
    const parsed = Date.parse(d);
    if (!isNaN(parsed))
      return new Date(parsed).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    return d;
  }

  function toggleCategory(id: string) {
    setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handlePrint() {
    if (!report) return
    // Expand all categories and temporarily disable edit inputs, and show edited values (if any)
    const prevOpen = { ...openCats }
    const prevEdit = editMode
    const prevReport = report
    const next: Record<string, boolean> = {}
    const source = edited || report
    source.categories?.forEach((c) => {
      next[c.categoryId] = true
    })
    setOpenCats(next)
    // when printing, show formatted values (not inputs) and prefer edited values
    if (edited) setReport(edited)
    setEditMode(false)

    const cleanup = () => {
      setOpenCats(prevOpen)
      setEditMode(prevEdit)
      setReport(prevReport)
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  function setSubField(catId: string, subId: string, key: string, value: any) {
    if (!edited) return
    const copy: Report = JSON.parse(JSON.stringify(edited))
    const cat = copy.categories?.find((c) => c.categoryId === catId)
    const sub = cat?.subsections?.find((s) => s.subsectionId === subId)
    if (!sub) return
    ;(sub as any)[key] = value
    setEdited(copy)
  }

  async function handleSave() {
    if (!edited || !report) return
    setSaving(true)
    setSaveMsg(null)
    setDirectAttempted(null)

    // Build payload matching the Cloudhub expected format
    const payload: any = {
      reportId: edited.reportId,
      imo: edited.imo,
      vesselName: edited.vesselName,
      inspectionDate: edited.inspectionDate,
      inspector: edited.inspector,
      overallRating: edited.overallRating,
      categories: edited.categories
    }

    try {
      const res = await saveReport(report.reportId, payload)
      // We attempted a direct forward from the client
      setDirectAttempted(true)

      if (res && res.success) {
        if (res.method === 'direct') {
          setExternalResult({ success: true, status: res.status, body: res.body })
          setSaveMsg('Saved and forwarded to external API')
          // reflect saved changes in the UI and exit edit mode
          setReport(edited)
          setEditMode(false)
        } else if (res.method === 'via-server') {
          // direct forward failed; server received and forwarded (or attempted)
          setExternalResult({ success: false, error: res.originalOutcome?.error || res.originalOutcome?.status || 'External failed', body: res.originalOutcome?.body })
          setSaveMsg('Direct forward failed; saved via server (server forwarded)')
          setReport(edited)
          setEditMode(false)
        } else {
          // method === 'none'
          setExternalResult({ success: false, error: res.error })
          setSaveMsg(`Save failed: ${res.error || 'unknown'}`)
        }
      } else {
        setExternalResult({ success: false, error: res.error || res.localBody || res.localStatus || 'unknown' })
        setSaveMsg(`Save failed: ${res.error || res.localStatus || 'unknown'}`)
      }

      console.debug('Save response', res)
    } catch (err: any) {
      setDirectAttempted(false)
      setSaveMsg(`Failed: ${err?.message || String(err)}`)
      setExternalResult({ success: false, error: err?.message || String(err) })
    } finally {
      setSaving(false)
    }
  }

  function computeDueDate(inspectionDate?: string, weeks?: string | number) {
    if (!inspectionDate || !weeks) return "-";
    const w = typeof weeks === "string" ? Number(weeks) : weeks;
    if (!w || isNaN(w)) return "-";
    // parse inspectionDate (supports dd_mm_yyyy or ISO)
    let base: Date | null = null;
    if (/^\d{1,2}_\d{1,2}_\d{4}$/.test(inspectionDate)) {
      const [dd, mm, yyyy] = inspectionDate.split("_").map(Number);
      base = new Date(yyyy, mm - 1, dd);
    } else {
      const p = Date.parse(inspectionDate);
      if (!isNaN(p)) base = new Date(p);
    }
    if (!base) return "-";
    const due = new Date(base.getTime());
    due.setDate(due.getDate() + w * 7);
    return due.toLocaleDateString();
  }

  return (
    <div className="report-root">
      <div className="report-header">
        <div>
          <h2 className="report-title">{report.vesselName}</h2>
          <div className="report-subtitle">
            IMO: <strong>{report.imo}</strong>
          </div>
          <div className="report-meta">
            <div className="meta-item">
              <div className="meta-label">Inspection Date</div>
              <div className="meta-value">
                {formatInspectionDate(report.inspectionDate)}
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Inspection Done By</div>
              <div className="meta-value">{report.inspector ?? "-"}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Select status</option>
            <option value="Inspection Complete">Inspection Complete</option>
            <option value="Pending">Pending</option>
            <option value="Requires Follow-up">Requires Follow-up</option>
          </select>

          <button onClick={() => handlePrint()} className="ghost-btn">
            Print / Export
          </button>

          <button onClick={() => setEditMode((m) => !m)} className="ghost-btn">
            {editMode ? 'Cancel' : 'Edit'}
          </button>

          <button
            onClick={() => handleSave()}
            className="ghost-btn"
            disabled={saving || !edited}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          {saveMsg && <div style={{ color: 'green' }}>{saveMsg}</div>}

          {/* Direct-forward indicator */}
          {directAttempted !== null && (
            <div style={{ marginLeft: 12, minWidth: 260 }}>
              {directAttempted ? (
                externalResult ? (
                  externalResult.success ? (
                    <div style={{ color: 'green' }}>🔁 Direct forward attempted — Success ({externalResult.status})</div>
                  ) : (
                    <div style={{ color: 'orange' }}>🔁 Direct forward attempted — Failed: {externalResult.error || externalResult.status || (externalResult.body && JSON.stringify(externalResult.body))}</div>
                  )
                ) : (
                  <div style={{ color: 'orange' }}>🔁 Direct forward attempted — Pending</div>
                )
              ) : (
                <div style={{ color: 'gray' }}>Direct forward not attempted</div>
              )}
            </div>
          )}

          {externalResult && (
            <div style={{ marginLeft: 12, minWidth: 260 }}>
              {externalResult.success ? (
                <div style={{ color: 'green' }}>✅ External: {externalResult.status} {externalResult.body?.status ? `- ${externalResult.body.status}` : ''}</div>
              ) : (
                <div style={{ color: 'red' }}>⚠️ External forward failed: {externalResult.error || externalResult.status || (externalResult.body && JSON.stringify(externalResult.body))}</div>
              )}

            </div>
          )}
        </div>
      </div>

      <div className="report-section">
        <h3 className="section-title">Inspection Summary</h3>
        {report.categories?.map((cat) => (
          <div key={cat.categoryId} className="category-card">
            <div className="category-header">
              <div style={{ fontWeight: 700, fontSize: 16 }}>{cat.name}</div>
              <div
                className="category-controls"
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <Badge value={cat.rating} />
                <button
                  className="cat-toggle toggle-btn"
                  onClick={() => toggleCategory(cat.categoryId)}
                  aria-expanded={!!openCats[cat.categoryId]}
                >
                  {openCats[cat.categoryId] ? "Collapse" : "Expand"}
                </button>
              </div>
            </div>

            {openCats[cat.categoryId] && (
              <div className="subsections">
                {cat.subsections?.map((sub) => (
                  <div key={sub.subsectionId} className="subsection-card">
                    <div className="subsection-main">
                      <div>
                        <div className="subsection-title">{sub.name}</div>
                      </div>
                      <div className="subsection-actions">
                        {
                          (() => {
                            const cur = (edited?.categories || []).find(c => c.categoryId === cat.categoryId)?.subsections?.find(s => s.subsectionId === sub.subsectionId) || sub
                            return (
                              <>
                                <div className="action-row">
                                  <div className="label">Rating</div>
                                  <div className="value">
                                    {editMode ? (
                                      <select value={cur.rating ?? ''} onChange={(e) => setSubField(cat.categoryId, sub.subsectionId, 'rating', e.target.value || undefined)}>
                                        <option value="">Select</option>
                                        <option value="1">1</option>
                                        <option value="2">2</option>
                                        <option value="3">3</option>
                                        <option value="N/A">N/A</option>
                                      </select>
                                    ) : (
                                      cur.rating ?? "-"
                                    )}
                                  </div>
                                </div>

                                <div className="action-row">
                                  <div className="label">Status</div>
                                  <div className="value">
                                    {editMode ? (
                                      <select value={(cur as any).status || ''} onChange={(e) => setSubField(cat.categoryId, sub.subsectionId, 'status', e.target.value || undefined)}>
                                        <option value="">Select status</option>
                                        <option value="pending">Pending</option>
                                        <option value="complete">Complete</option>
                                        <option value="requires-follow-up">Requires Follow-up</option>
                                      </select>
                                    ) : (
                                      (cur as any).status || 'pending'
                                    )}
                                  </div>
                                </div>

                                <div className="action-row">
                                  <div className="label">Due date</div>
                                  <div className="value">
                                    {editMode ? (
                                      <input
                                        type="date"
                                        value={(cur as any).dueDate || ''}
                                        onChange={(e) => setSubField(cat.categoryId, sub.subsectionId, 'dueDate', e.target.value)}
                                      />
                                    ) : (
                                      (cur as any).dueDate || computeDueDate(report.inspectionDate, (sub as any).due_after_weeks)
                                    )}
                                  </div>
                                </div> 
                                <div className="action-row">
                                  <div className="label">Required Action</div>
                                  <div className="value">
                                    {editMode ? (
                                      <input
                                        type="text"
                                        value={(cur as any).action ?? ''}
                                        onChange={(e) => setSubField(cat.categoryId, sub.subsectionId, 'action', e.target.value)}
                                      />
                                    ) : (
                                      (cur as any).action ?? "-"
                                    )}
                                  </div>
                                </div>
                              </>
                            )
                          })()
                        }
                      </div>
                    </div>

                    {sub.images && sub.images.length > 0 && (
                      <div className="subsection-images">
                        {sub.images.map((img, i) => (
                          <div key={img.url} className="img-card">
                            <img
                              src={img.url}
                              alt={img.caption ?? ""}
                              onClick={() => openLightbox(sub.images, i)}
                            />
                            {img.caption && (
                              <div className="img-caption">{img.caption}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="subsection-details">
                      <strong> Details:</strong> <br></br>
                      {editMode ? (
                        <textarea
                          value={((edited?.categories || []).find(c => c.categoryId === cat.categoryId)?.subsections?.find(s => s.subsectionId === sub.subsectionId) as any)?.details || sub.details || ''}
                          onChange={(e) => setSubField(cat.categoryId, sub.subsectionId, 'details', e.target.value)}
                          rows={4}
                          style={{ width: '100%' }}
                        />
                      ) : (
                        sub.details
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {report.documents?.length ? (
        <div className="report-section">
          <h3>Documents</h3>
          <ul>
            {report.documents.map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.notes && (
        <div className="report-section">
          <h3>Notes</h3>
          <div>{report.notes}</div>
        </div>
      )}

      {lightboxOpen && (
        <Lightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
