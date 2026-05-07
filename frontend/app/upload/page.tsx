"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type UploadMode = "single" | "evaluate";

interface PipelineStep {
  label: string;
  status: "waiting" | "running" | "done" | "error";
}

const SINGLE_STEPS: PipelineStep[] = [
  { label: "Receive", status: "waiting" },
  { label: "Scan", status: "waiting" },
  { label: "Hash", status: "waiting" },
  { label: "Classify", status: "waiting" },
  { label: "Vault", status: "waiting" },
  { label: "Audit", status: "waiting" },
];

const EVAL_STEPS: PipelineStep[] = [
  { label: "Receive", status: "waiting" },
  { label: "Scan ×2", status: "waiting" },
  { label: "Hash ×2", status: "waiting" },
  { label: "Classify", status: "waiting" },
  { label: "Vault ×2", status: "waiting" },
  { label: "Extract", status: "waiting" },
  { label: "Job", status: "waiting" },
];

export default function UploadPage() {
  const [mode, setMode] = useState<UploadMode>("evaluate");

  // Single-file mode
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleDrag, setSingleDrag] = useState(false);
  const singleRef = useRef<HTMLInputElement>(null);

  // Two-file mode
  const [tenderFile, setTenderFile] = useState<File | null>(null);
  const [bidderFile, setBidderFile] = useState<File | null>(null);
  const [tenderDrag, setTenderDrag] = useState(false);
  const [bidderDrag, setBidderDrag] = useState(false);
  const tenderRef = useRef<HTMLInputElement>(null);
  const bidderRef = useRef<HTMLInputElement>(null);

  // Shared form fields
  const [tenderId, setTenderId] = useState("");
  const [bidderId, setBidderId] = useState("");
  const [actorRole, setActorRole] = useState("officer");
  const [thresholdValue, setThresholdValue] = useState("");
  const [thresholdUnit, setThresholdUnit] = useState("INR");

  // Pipeline state
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function advanceSteps(
    stepsCopy: PipelineStep[],
    upTo: number,
  ): PipelineStep[] {
    return stepsCopy.map((s, i) => ({
      ...s,
      status: i < upTo ? "done" : i === upTo ? "running" : "waiting",
    }));
  }

  function animateSteps(initialSteps: PipelineStep[]): Promise<PipelineStep[]> {
    return new Promise((resolve) => {
      // Explicitly type 'current' so TS knows the status will change later
      let current: PipelineStep[] = initialSteps.map((s) => ({
        ...s,
        status: "waiting", // You can also remove 'as const' now
      }));

      setSteps(current);

      let i = 0;
      const interval = setInterval(() => {
        current = advanceSteps([...current], i);
        setSteps([...current]);
        i++;
        if (i >= current.length) {
          clearInterval(interval);
          const done: PipelineStep[] = current.map((s) => ({
            ...s,
            status: "done",
          }));
          setSteps(done);
          resolve(done);
        }
      }, 500);
    });
  }

  function reset() {
    setSingleFile(null);
    setTenderFile(null);
    setBidderFile(null);
    setResult(null);
    setError(null);
    setSteps([]);
  }

  // ── Single file submit ────────────────────────────────────────────────────

  async function submitSingle() {
    if (!singleFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const animation = animateSteps([...SINGLE_STEPS]);

    const fd = new FormData();
    fd.append("file", singleFile);
    fd.append("tender_id", tenderId);
    fd.append("bidder_id", bidderId);
    fd.append("actor_role", actorRole);

    try {
      await animation;
      const res = await axios.post(`${API}/api/v1/ingest`, fd);
      setResult(res.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail
          ? JSON.stringify(err.response.data.detail)
          : err.message,
      );
      setSteps((prev) =>
        prev.map((s, i) =>
          s.status === "running" ? { ...s, status: "error" } : s,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Two-file evaluate submit ──────────────────────────────────────────────

  async function submitEvaluate() {
    if (!tenderFile || !bidderFile || !thresholdValue) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const animation = animateSteps([...EVAL_STEPS]);

    const fd = new FormData();
    fd.append("tender_file", tenderFile);
    fd.append("bidder_file", bidderFile);
    fd.append("threshold_value", thresholdValue);
    fd.append("threshold_unit", thresholdUnit);
    fd.append("tender_id", tenderId);
    fd.append("bidder_id", bidderId);
    fd.append("actor_role", actorRole);

    try {
      await animation;
      const res = await axios.post(`${API}/api/v1/ingest/evaluate`, fd);
      setResult(res.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail
          ? JSON.stringify(err.response.data.detail)
          : err.message,
      );
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error" } : s,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Drop handlers ─────────────────────────────────────────────────────────

  function onDrop(
    e: DragEvent,
    setter: (f: File) => void,
    setDrag: (b: boolean) => void,
  ) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setter(f);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const singleReady = !!singleFile;
  const evalReady = !!tenderFile && !!bidderFile && !!thresholdValue.trim();
  const isReady = mode === "single" ? singleReady : evalReady;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="layer-badge">LAYER 1 — SECURE INGESTION</div>
      <h1 className="page-title">Ingest Documents</h1>
      <p className="page-sub">
        Every document is virus-scanned, SHA-256 fingerprinted, classified, and
        sealed in the evidence vault before any processing begins.
      </p>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => {
            reset();
            setMode("single");
          }}
          style={{
            padding: "0.4rem 1.2rem",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            border: "1px solid",
            background: mode === "single" ? "var(--accent)" : "transparent",
            color: mode === "single" ? "#000" : "var(--text-muted)",
            borderColor: mode === "single" ? "var(--accent)" : "var(--border)",
          }}
        >
          Single File
        </button>
        <button
          onClick={() => {
            reset();
            setMode("evaluate");
          }}
          style={{
            padding: "0.4rem 1.2rem",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            border: "1px solid",
            background: mode === "evaluate" ? "var(--accent)" : "transparent",
            color: mode === "evaluate" ? "#000" : "var(--text-muted)",
            borderColor:
              mode === "evaluate" ? "var(--accent)" : "var(--border)",
          }}
        >
          Tender + Bidder (Evaluate)
        </button>
      </div>

      {/* ── SINGLE FILE MODE ── */}
      {mode === "single" && (
        <div className="upload-grid">
          <div
            className={`dropzone ${singleDrag ? "drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSingleDrag(true);
            }}
            onDragLeave={() => setSingleDrag(false)}
            onDrop={(e) => onDrop(e, setSingleFile, setSingleDrag)}
            onClick={() => singleRef.current?.click()}
          >
            <input
              ref={singleRef}
              type="file"
              style={{ display: "none" }}
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.tiff,.tif"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                if (e.target.files?.[0]) setSingleFile(e.target.files[0]);
              }}
            />
            <div className="dropzone-icon">↑</div>
            {singleFile ? (
              <div
                className="dropzone-label"
                style={{ color: "var(--accent)" }}
              >
                {singleFile.name}
              </div>
            ) : (
              <div className="dropzone-label">
                Drop document here or click to browse
              </div>
            )}
            <div className="dropzone-hint">
              PDF, JPG, PNG, TIFF, XLSX, DOCX · Max 50MB
            </div>
          </div>
          <PipelineStatusBox steps={steps} />
        </div>
      )}

      {/* ── TWO FILE MODE ── */}
      {mode === "evaluate" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Tender drop */}
          <div>
            <div className="form-label" style={{ marginBottom: "0.5rem" }}>
              📄 Tender Document (CRPF)
            </div>
            <div
              className={`dropzone ${tenderDrag ? "drag" : ""}`}
              style={{ padding: "2rem 1rem" }}
              onDragOver={(e) => {
                e.preventDefault();
                setTenderDrag(true);
              }}
              onDragLeave={() => setTenderDrag(false)}
              onDrop={(e) => onDrop(e, setTenderFile, setTenderDrag)}
              onClick={() => tenderRef.current?.click()}
            >
              <input
                ref={tenderRef}
                type="file"
                style={{ display: "none" }}
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.tiff"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files?.[0]) setTenderFile(e.target.files[0]);
                }}
              />
              <div className="dropzone-icon">📋</div>
              {tenderFile ? (
                <div
                  className="dropzone-label"
                  style={{ color: "var(--accent)", fontSize: "12px" }}
                >
                  {tenderFile.name}
                </div>
              ) : (
                <div className="dropzone-label">Drop tender doc or click</div>
              )}
              <div className="dropzone-hint">PDF / DOCX / Image</div>
            </div>
          </div>

          {/* Bidder drop */}
          <div>
            <div className="form-label" style={{ marginBottom: "0.5rem" }}>
              📁 Bidder Submission
            </div>
            <div
              className={`dropzone ${bidderDrag ? "drag" : ""}`}
              style={{ padding: "2rem 1rem" }}
              onDragOver={(e) => {
                e.preventDefault();
                setBidderDrag(true);
              }}
              onDragLeave={() => setBidderDrag(false)}
              onDrop={(e) => onDrop(e, setBidderFile, setBidderDrag)}
              onClick={() => bidderRef.current?.click()}
            >
              <input
                ref={bidderRef}
                type="file"
                style={{ display: "none" }}
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.tiff"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files?.[0]) setBidderFile(e.target.files[0]);
                }}
              />
              <div className="dropzone-icon">🏗️</div>
              {bidderFile ? (
                <div
                  className="dropzone-label"
                  style={{ color: "var(--accent)", fontSize: "12px" }}
                >
                  {bidderFile.name}
                </div>
              ) : (
                <div className="dropzone-label">Drop bidder doc or click</div>
              )}
              <div className="dropzone-hint">PDF / DOCX / Image</div>
            </div>
          </div>

          {/* Pipeline status */}
          <div>
            <div className="form-label" style={{ marginBottom: "0.5rem" }}>
              Pipeline Status
            </div>
            <PipelineStatusBox steps={steps} />
          </div>
        </div>
      )}

      {/* ── Shared form fields ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            mode === "evaluate" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div className="form-group">
          <label className="form-label">Tender ID</label>
          <input
            className="form-input"
            placeholder="e.g. TENDER_CRPF_2026_034"
            value={tenderId}
            onChange={(e) => setTenderId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Bidder ID</label>
          <input
            className="form-input"
            placeholder="e.g. B-01 or leave blank"
            value={bidderId}
            onChange={(e) => setBidderId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Actor Role</label>
          <select
            className="form-select"
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
          >
            <option value="officer">officer</option>
            <option value="evaluator">evaluator</option>
            <option value="admin">admin</option>
          </select>
        </div>

        {mode === "evaluate" && (
          <div className="form-group">
            <label className="form-label">
              Threshold Value
              <select
                value={thresholdUnit}
                onChange={(e) => setThresholdUnit(e.target.value)}
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "11px",
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  padding: "0.1rem 0.3rem",
                }}
              >
                <option value="INR">INR</option>
                <option value="percent">%</option>
                <option value="count">count</option>
                <option value="score">score</option>
              </select>
            </label>
            <input
              className="form-input"
              placeholder="e.g. 50000000"
              type="number"
              min="0"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            />
          </div>
        )}
      </div>

      {/* Submit button */}
      <button
        className={`btn-primary ${isReady && !loading ? "ready" : ""}`}
        disabled={!isReady || loading}
        onClick={mode === "single" ? submitSingle : submitEvaluate}
      >
        {loading
          ? "PROCESSING..."
          : mode === "single"
            ? "INGEST DOCUMENT →"
            : "INGEST & EVALUATE →"}
      </button>

      <div className="footer-hint">
        {mode === "single"
          ? "ClamAV scan · SHA-256 hash · RBAC vault · Hash-chained audit ledger"
          : "ClamAV scan · SHA-256 hash · Text extraction (PDF/DOCX/OCR) · EvaluationJob created"}
      </div>

      {/* Result display */}
      {result && <ResultBox result={result} mode={mode} />}
      {error && (
        <div className="result-box error" style={{ marginTop: "1.5rem" }}>
          <div className="result-title">Error</div>
          <pre
            style={{
              fontSize: "11px",
              color: "var(--red)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {error}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PipelineStatusBox({ steps }: { steps: PipelineStep[] }) {
  if (steps.length === 0) {
    return (
      <div
        className="pipeline-status"
        style={{ height: "100%", minHeight: "140px" }}
      >
        <span style={{ fontSize: "1.5rem" }}>🔒</span>
        <span>Pipeline status will appear here after you submit.</span>
        <span className="steps">
          Virus Scan → Hash → Dedup → Classify → Vault → Audit
        </span>
      </div>
    );
  }

  return (
    <div
      className="pipeline-status"
      style={{
        height: "100%",
        minHeight: "140px",
        gap: "0.4rem",
        justifyContent: "flex-start",
        padding: "1rem",
      }}
    >
      {steps.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "12px",
          }}
        >
          <span>
            {s.status === "done"
              ? "✅"
              : s.status === "running"
                ? "⏳"
                : s.status === "error"
                  ? "❌"
                  : "⬜"}
          </span>
          <span
            style={{
              color:
                s.status === "done"
                  ? "var(--green)"
                  : s.status === "running"
                    ? "var(--accent)"
                    : s.status === "error"
                      ? "var(--red)"
                      : "var(--text-sub)",
            }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResultBox({ result, mode }: { result: any; mode: UploadMode }) {
  const isDupe = result.status === "DUPLICATE";
  const boxClass = isDupe ? "duplicate" : "success";

  if (mode === "evaluate") {
    return (
      <div className={`result-box ${boxClass}`} style={{ marginTop: "1.5rem" }}>
        <div className="result-title">
          {isDupe ? "⚠ Duplicate Detected" : "✅ Evaluation Job Created"}
        </div>
        {[
          ["Job ID", result.job_id],
          ["Status", result.status],
          ["Tender File", result.tender_filename],
          ["Tender Hash", result.tender_hash],
          ["Tender Uploaded At", result.tender_uploaded_at],
          ["Tender Text (chars)", result.tender_chars],
          ["Tender Method", result.tender_method],
          ["Bidder File", result.bidder_filename],
          ["Bidder Hash", result.bidder_hash],
          ["Bidder Uploaded At", result.bidder_uploaded_at],
          ["Bidder Text (chars)", result.bidder_chars],
          ["Bidder Method", result.bidder_method],
          [
            "Threshold",
            `${result.threshold_value} ${result.threshold_unit || ""}`,
          ],
        ].map(
          ([k, v]) =>
            v !== undefined &&
            v !== null && (
              <div key={k} className="result-row">
                <span className="result-key">{k}</span>
                <span className="result-val">{String(v)}</span>
              </div>
            ),
        )}
        <div
          style={{
            marginTop: "0.75rem",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}
        >
          Poll:{" "}
          <code style={{ color: "var(--blue)" }}>
            GET /api/v1/evaluate/jobs/{result.job_id}
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className={`result-box ${boxClass}`} style={{ marginTop: "1.5rem" }}>
      <div className="result-title">
        {isDupe ? "⚠ Duplicate Detected" : "✅ Document Ingested"}
      </div>
      {[
        ["Status", result.status],
        ["Hash", result.document_hash],
        ["Filename", result.filename],
        ["Vault Path", result.vault_path],
        ["Doc Type", result.classification?.doc_type],
        ["Virus Scan", result.virus_scan],
        [
          "File Size",
          result.file_size_bytes
            ? `${result.file_size_bytes} bytes`
            : undefined,
        ],
        ["Layer 2", result.layer2_extraction],
      ].map(
        ([k, v]) =>
          v !== undefined &&
          v !== null && (
            <div key={k} className="result-row">
              <span className="result-key">{k}</span>
              <span className="result-val">{String(v)}</span>
            </div>
          ),
      )}
    </div>
  );
}
