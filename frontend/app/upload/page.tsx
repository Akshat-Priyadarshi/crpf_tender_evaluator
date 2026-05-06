"use client";
import { useState, useRef, DragEvent } from "react";
import axios from "axios";

type IngestionResult = {
  status: string;
  document_hash: string;
  filename: string;
  vault_path: string;
  file_size_bytes: number;
  virus_scan: string;
  classification: {
    doc_type: string;
    classification_status: string;
    confidence_tier: number;
    reason: string;
    bidder_id: string | null;
    tender_id: string | null;
  };
};

type StepStatus = "idle" | "running" | "done" | "error";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const FASTAPI_URL = "http://localhost:8000";

function VerdictBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const cls = v === "PASS" || v === "CLEAN" || v === "INGESTED"
    ? "badge-pass"
    : v === "DUPLICATE" ? "badge-review" : "badge-fail";
  return (
    <span className={cls} style={{
      padding: "2px 10px", borderRadius: 4,
      fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace",
      letterSpacing: "0.05em",
    }}>{v}</span>
  );
}

function StepRow({ step }: { step: Step }) {
  const icon = step.status === "running" ? "⟳"
    : step.status === "done" ? "✓"
    : step.status === "error" ? "✗" : "○";
  const color = step.status === "running" ? "var(--amber)"
    : step.status === "done" ? "var(--green)"
    : step.status === "error" ? "var(--red)" : "var(--text-muted)";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0",
      borderBottom: "1px solid var(--navy-border)" }}>
      <span style={{ color, fontSize: 14, fontFamily: "'IBM Plex Mono',monospace",
        animation: step.status === "running" ? "spin 1s linear infinite" : "none",
        minWidth: 16, textAlign: "center" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, color: color, fontWeight: 500 }}>{step.label}</div>
        {step.detail && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tenderId, setTenderId] = useState("");
  const [bidderId, setBidderId] = useState("");
  const [actorRole, setActorRole] = useState("officer");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));
  };

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setSteps([]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const initialSteps: Step[] = [
      { id: "receive",  label: "File received & size validated",  status: "idle" },
      { id: "scan",     label: "ClamAV virus scan",               status: "idle" },
      { id: "hash",     label: "SHA-256 fingerprint computed",    status: "idle" },
      { id: "dedup",    label: "Deduplication check",             status: "idle" },
      { id: "classify", label: "Three-tier classification",       status: "idle" },
      { id: "vault",    label: "Sealed to evidence vault",        status: "idle" },
      { id: "audit",    label: "Audit ledger entry written",      status: "idle" },
    ];
    setSteps(initialSteps);

    // Animate steps sequentially (real call happens, steps are simulated for UX)
    const animate = async () => {
      updateStep("receive", "running");
      await delay(300);
      updateStep("receive", "done", `${(file.size / 1024).toFixed(1)} KB · ${file.type || "application/octet-stream"}`);
      updateStep("scan", "running");
    };
    animate();

    try {
      const form = new FormData();
      form.append("file", file);
      if (tenderId) form.append("tender_id", tenderId);
      if (bidderId) form.append("bidder_id", bidderId);
      form.append("actor_role", actorRole);

      // Real API call
      const res = await axios.post(`${FASTAPI_URL}/api/v1/ingest`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data: IngestionResult = res.data;

      // Complete the remaining step animations
      updateStep("scan", "done", "ClamAV — CLEAN");
      await delay(200);
      updateStep("hash", "running");
      await delay(300);
      updateStep("hash", "done", `SHA-256: ${data.document_hash.substring(0, 24)}...`);
      updateStep("dedup", "running");
      await delay(200);

      if (data.status === "DUPLICATE") {
        updateStep("dedup", "done", "Duplicate detected — already ingested");
        setSteps(prev => prev.map((s, i) => i > 3 ? { ...s, status: "idle" } : s));
        setResult(data);
        setLoading(false);
        return;
      }

      updateStep("dedup", "done", "New document — proceeding");
      updateStep("classify", "running");
      await delay(300);
      updateStep("classify", "done",
        `Tier ${data.classification.confidence_tier} → ${data.classification.doc_type.toUpperCase()} · ${data.classification.classification_status}`
      );
      updateStep("vault", "running");
      await delay(200);
      updateStep("vault", "done", data.vault_path);
      updateStep("audit", "running");
      await delay(200);
      updateStep("audit", "done", "Hash-chained ledger entry written");

      setResult(data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string | { error?: string; message?: string; threat?: string } }; status?: number } };
      const detail = axiosErr.response?.data?.detail;
      let msg = "Ingestion failed.";
      if (typeof detail === "string") msg = detail;
      else if (detail && typeof detail === "object") {
        msg = detail.message || detail.error || msg;
        if (detail.threat) msg += ` Threat: ${detail.threat}`;
      }

      const status = axiosErr.response?.status;
      if (status === 406) {
        updateStep("scan", "error", msg);
        setSteps(prev => prev.map((s, i) => i > 1 ? { ...s, status: "error" as StepStatus } : s));
      } else {
        setSteps(prev => prev.map(s =>
          s.status === "running" ? { ...s, status: "error" as StepStatus } : s
        ));
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const tierLabel = (t: number) =>
    t === 1 ? "Tier 1 — Portal regex match (confirmed)"
    : t === 2 ? "Tier 2 — Keyword heuristic (pending OCR)"
    : "Tier 3 — Unclassifiable (pending Layer 2 OCR)";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "var(--amber)", marginBottom: 6, letterSpacing: "0.1em" }}>
          LAYER 1 — SECURE INGESTION
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
          Ingest Documents
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Every document is virus-scanned, SHA-256 fingerprinted, classified, and sealed in the evidence vault before any processing begins.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* Left — Upload form */}
        <div>
          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragging ? "var(--amber)" : file ? "var(--green)" : "var(--navy-border)"}`,
              borderRadius: 8,
              padding: "40px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "rgba(245,158,11,0.05)" : "var(--navy-card)",
              transition: "all 0.15s",
              marginBottom: 20,
            }}
          >
            <input ref={inputRef} type="file" hidden
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.xlsx,.xls,.docx"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {file ? "📄" : "⬆"}
            </div>
            {file ? (
              <>
                <div style={{ fontWeight: 600, color: "var(--green)", fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 500, color: "var(--text-secondary)", fontSize: 14 }}>
                  Drop document here or click to browse
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  PDF, JPG, PNG, TIFF, XLSX, DOCX · Max 50MB
                </div>
              </>
            )}
          </div>

          {/* Metadata fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Tender ID", val: tenderId, set: setTenderId, ph: "e.g. TENDER_CRPF_2026_034" },
              { label: "Bidder ID", val: bidderId, set: setBidderId, ph: "e.g. B-01 or leave blank for tenders" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  {f.label}
                </label>
                <input
                  value={f.val}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  style={{
                    width: "100%", padding: "8px 12px",
                    background: "var(--navy-card)", border: "1px solid var(--navy-border)",
                    borderRadius: 4, color: "var(--text-primary)", fontSize: 13,
                    fontFamily: "'IBM Plex Mono',monospace", outline: "none",
                  }}
                />
              </div>
            ))}

            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Actor Role
              </label>
              <select
                value={actorRole}
                onChange={e => setActorRole(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "var(--navy-card)", border: "1px solid var(--navy-border)",
                  borderRadius: 4, color: "var(--text-primary)", fontSize: 13,
                  fontFamily: "'IBM Plex Mono',monospace", outline: "none",
                }}
              >
                <option value="officer">officer</option>
                <option value="evaluator">evaluator</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={onSubmit}
            disabled={!file || loading}
            style={{
              width: "100%", padding: "12px 24px",
              background: !file || loading ? "var(--slate)" : "var(--amber)",
              color: !file || loading ? "var(--text-muted)" : "var(--navy)",
              border: "none", borderRadius: 6,
              fontWeight: 700, fontSize: 14, cursor: !file || loading ? "not-allowed" : "pointer",
              fontFamily: "'IBM Plex Sans',sans-serif",
              transition: "all 0.15s",
            }}
          >
            {loading ? "Processing..." : "INGEST DOCUMENT →"}
          </button>

          {/* Security note */}
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
            ClamAV scan · SHA-256 hash · RBAC vault · Hash-chained audit ledger
          </div>
        </div>

        {/* Right — Pipeline status + result */}
        <div>
          {/* Pipeline steps */}
          {steps.length > 0 && (
            <div style={{
              background: "var(--navy-card)", border: "1px solid var(--navy-border)",
              borderRadius: 8, padding: "16px 20px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 12, letterSpacing: "0.1em" }}>INGESTION PIPELINE</div>
              {steps.map(s => <StepRow key={s.id} step={s} />)}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: "var(--red-dim)", border: "1px solid var(--red)",
              borderRadius: 8, padding: "16px 20px", marginBottom: 20,
            }}>
              <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>Ingestion Rejected</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{error}</div>
            </div>
          )}

          {/* Success result */}
          {result && result.status !== "DUPLICATE" && (
            <div style={{
              background: "var(--navy-card)", border: "1px solid var(--green)",
              borderRadius: 8, padding: "20px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--green)", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em" }}>
                  INGESTION REPORT
                </div>
                <VerdictBadge value={result.status} />
              </div>

              {[
                { label: "Document Hash", val: result.document_hash.substring(0, 32) + "..." },
                { label: "Filename",      val: result.filename },
                { label: "Vault Path",    val: result.vault_path },
                { label: "File Size",     val: `${(result.file_size_bytes / 1024).toFixed(1)} KB` },
                { label: "Virus Scan",    val: result.virus_scan.toUpperCase() },
              ].map(r => (
                <div key={r.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "1px solid var(--navy-border)",
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "'IBM Plex Mono',monospace",
                    maxWidth: 260, textAlign: "right", wordBreak: "break-all" }}>{r.val}</span>
                </div>
              ))}

              {/* Classification */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace",
                  marginBottom: 10, letterSpacing: "0.1em" }}>CLASSIFICATION</div>
                {[
                  { label: "Doc Type",   val: result.classification.doc_type.toUpperCase() },
                  { label: "Status",     val: result.classification.classification_status },
                  { label: "Confidence", val: tierLabel(result.classification.confidence_tier) },
                  { label: "Tender ID",  val: result.classification.tender_id || "—" },
                  { label: "Bidder ID",  val: result.classification.bidder_id || "—" },
                ].map(r => (
                  <div key={r.label} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "5px 0", borderBottom: "1px solid var(--navy-border)",
                  }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text-primary)", fontFamily: "'IBM Plex Mono',monospace",
                      maxWidth: 260, textAlign: "right" }}>{r.val}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  {result.classification.reason}
                </div>
              </div>
            </div>
          )}

          {/* Duplicate result */}
          {result && result.status === "DUPLICATE" && (
            <div style={{
              background: "var(--navy-card)", border: "1px solid var(--amber)",
              borderRadius: 8, padding: "20px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em" }}>
                  DUPLICATE DETECTED
                </div>
                <VerdictBadge value="DUPLICATE" />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                This document has already been ingested. Hash match found in the vault.
              </p>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>
                Hash: {result.document_hash.substring(0, 32)}...
              </div>
            </div>
          )}

          {/* Empty state */}
          {steps.length === 0 && !result && (
            <div style={{
              background: "var(--navy-card)", border: "1px solid var(--navy-border)",
              borderRadius: 8, padding: "40px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                Pipeline status will appear here after you submit a document.
              </div>
              <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>
                Virus Scan → Hash → Dedup → Classify → Vault → Audit
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}