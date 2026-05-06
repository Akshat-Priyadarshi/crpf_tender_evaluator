"use client";
import { useState } from "react";

// ── Mock data matching the PPT mockup exactly ────────────────────────────────

const BIDDERS = [
  { id: "B-01", name: "ABC Constructions Pvt Ltd", overall: "PASS",   score: 97 },
  { id: "B-02", name: "Bharat Infra Ltd",           overall: "PASS",   score: 94 },
  { id: "B-03", name: "Capital Builders Pvt Ltd",   overall: "FAIL",   score: 99 },
  { id: "B-04", name: "Deep Engineering Co.",        overall: "REVIEW", score: 68 },
  { id: "B-05", name: "Everest Projects Ltd",        overall: "PASS",   score: 91 },
  { id: "B-06", name: "Federal Constructions",       overall: "FAIL",   score: 96 },
  { id: "B-07", name: "Ganga Infraworks",            overall: "PASS",   score: 89 },
  { id: "B-08", name: "Himalaya Engineers LLP",      overall: "PASS",   score: 93 },
  { id: "B-09", name: "Indraprastha Builders",       overall: "REVIEW", score: 71 },
  { id: "B-10", name: "Jai Construction Group",      overall: "FAIL",   score: 88 },
];

const CRITERIA = [
  { id: "C-01", label: "Annual turnover ≥ ₹5 Cr",          mandatory: true },
  { id: "C-02", label: "≥ 3 similar projects in 5y",       mandatory: true },
  { id: "C-03", label: "Valid GST registration",            mandatory: true },
  { id: "C-04", label: "ISO 9001 (valid on open date)",     mandatory: true },
  { id: "C-05", label: "Net worth positive in last FY",     mandatory: true },
  { id: "C-06", label: "Experience on CAPF contracts",      mandatory: true },
  { id: "C-07", label: "Class-I local supplier",            mandatory: false },
  { id: "C-08", label: "EMD ₹10 Lakh enclosed",            mandatory: true },
  { id: "C-09", label: "Valid PF / ESI registrations",      mandatory: true },
  { id: "C-10", label: "Authorised signatory + PoA",        mandatory: true },
];

type Verdict = "PASS" | "FAIL" | "REVIEW";

const VERDICTS: Record<string, Record<string, { verdict: Verdict; conf: number; evidence: string }>> = {
  "B-01": {
    "C-01": { verdict: "PASS",   conf: 97, evidence: "CA-BS" },
    "C-02": { verdict: "PASS",   conf: 94, evidence: "4 CCs" },
    "C-03": { verdict: "PASS",   conf: 99, evidence: "Live ✓" },
    "C-04": { verdict: "PASS",   conf: 92, evidence: "QR ✓" },
    "C-05": { verdict: "REVIEW", conf: 68, evidence: "Ambiguous" },
    "C-06": { verdict: "PASS",   conf: 88, evidence: "Sanctions" },
    "C-07": { verdict: "PASS",   conf: 95, evidence: "MSME+" },
    "C-08": { verdict: "PASS",   conf: 99, evidence: "DD" },
    "C-09": { verdict: "PASS",   conf: 93, evidence: "2 certs" },
    "C-10": { verdict: "PASS",   conf: 96, evidence: "PoA" },
  },
};
// Fill remaining bidders with random-ish data
for (const b of BIDDERS.slice(1)) {
  VERDICTS[b.id] = {};
  for (const c of CRITERIA) {
    const v: Verdict = b.overall === "FAIL" && ["C-02","C-05","C-06"].includes(c.id)
      ? "FAIL"
      : b.overall === "REVIEW" && c.id === "C-05" ? "REVIEW"
      : "PASS";
    VERDICTS[b.id][c.id] = { verdict: v, conf: Math.floor(Math.random() * 15) + 84, evidence: "—" };
  }
}

const EVIDENCE = {
  source: "ABCCo_BalanceSheet_FY2324.pdf",
  page: 6,
  bbox: "[122, 410, 478, 452]",
  hash: "9f2a7c...",
  extractedValue: "Annual Turnover FY 2023-24: ₹7,25,00,000",
  threshold: "₹5,00,00,000 · Margin above threshold: +45%",
  confidence: 97,
  udin: "PASSED",
  itr: "MATCH",
};

function VerdictBadge({ v, size = "sm" }: { v: string; size?: "sm" | "xs" }) {
  const color = v === "PASS" ? "var(--green)"
    : v === "FAIL" ? "var(--red)" : "var(--amber)";
  const bg = v === "PASS" ? "var(--green-dim)"
    : v === "FAIL" ? "var(--red-dim)" : "var(--amber-dim)";
  return (
    <span style={{
      background: bg, color, border: `1px solid ${color}`,
      padding: size === "xs" ? "1px 6px" : "2px 8px",
      borderRadius: 3, fontSize: size === "xs" ? 10 : 11,
      fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace",
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>{v}</span>
  );
}

function ConfBar({ pct }: { pct: number }) {
  const color = pct >= 85 ? "var(--green)" : pct >= 70 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--navy-border)", flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontFamily: "'IBM Plex Mono',monospace" }}>{pct}%</span>
    </div>
  );
}

export default function EvaluatePage() {
  const [selectedBidder, setSelectedBidder] = useState(BIDDERS[0]);
  const [selectedCriterion, setSelectedCriterion] = useState(CRITERIA[4]); // C-05
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const bv = VERDICTS[selectedBidder.id];
  const ev = bv[selectedCriterion.id];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)" }}>

      {/* Sub-header */}
      <div style={{
        background: "var(--navy-mid)", borderBottom: "1px solid var(--navy-border)",
        padding: "10px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <span style={{ fontSize: 11, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" }}>
            ACTIVE · CORRIGENDUM V2 · CRITERIA APPROVED 14-APR-2026 ·
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginLeft: 12 }}>
            Tender #CRPF/2026/CON/034 · Construction Services · Bhopal HQ Complex
          </span>
        </div>
        <button style={{
          padding: "6px 14px", background: "var(--amber)", color: "var(--navy)",
          border: "none", borderRadius: 4, fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
        }}>⬇ Export RTI-Ready PDF</button>
      </div>

      {/* Three-panel layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Panel 1 — Bidder list */}
        <div style={{
          width: 220, borderRight: "1px solid var(--navy-border)",
          overflowY: "auto", background: "var(--navy-mid)",
          flexShrink: 0,
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--navy-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Bidders (10)
            </span>
            <button style={{
              fontSize: 11, padding: "2px 8px", background: "var(--navy-card)",
              border: "1px solid var(--navy-border)", borderRadius: 3,
              color: "var(--text-secondary)", cursor: "pointer",
            }}>Filter ▾</button>
          </div>

          {BIDDERS.map((b, i) => (
            <div
              key={b.id}
              onClick={() => setSelectedBidder(b)}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--navy-border)",
                cursor: "pointer",
                background: selectedBidder.id === b.id ? "var(--navy-card)" : "transparent",
                borderLeft: selectedBidder.id === b.id ? "3px solid var(--amber)" : "3px solid transparent",
                transition: "all 0.1s",
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>
                B-0{i + 1}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", marginBottom: 5, lineHeight: 1.3 }}>
                {b.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <VerdictBadge v={b.overall} size="xs" />
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>
                  {b.score}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Panel 2 — Criterion table */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--navy)" }}>
          {/* Bidder header */}
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid var(--navy-border)",
            background: "var(--navy-mid)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
                {selectedBidder.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>
                PAN: AABCA1234N · GST: 22AAACA1234N1Z5 · CIN: U45200MH2009PTC194587
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>OVERALL:</span>
              <VerdictBadge v={selectedBidder.overall} />
            </div>
          </div>

          {/* Criteria table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--navy-mid)" }}>
                {["ID", "CRITERION", "VERDICT", "CONFIDENCE", "EVIDENCE"].map(h => (
                  <th key={h} style={{
                    padding: "8px 16px", textAlign: "left",
                    fontSize: 10, color: "var(--text-muted)",
                    fontFamily: "'IBM Plex Mono',monospace",
                    letterSpacing: "0.08em",
                    borderBottom: "1px solid var(--navy-border)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map(c => {
                const cell = bv[c.id];
                const isSelected = selectedCriterion.id === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCriterion(c)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "rgba(245,158,11,0.07)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--amber)" : "3px solid transparent",
                      transition: "all 0.1s",
                    }}
                  >
                    <td style={{ padding: "10px 16px", fontSize: 12,
                      fontFamily: "'IBM Plex Mono',monospace", color: "var(--amber)",
                      borderBottom: "1px solid var(--navy-border)" }}>{c.id}</td>
                    <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--navy-border)" }}>
                      <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.label}</div>
                      {c.mandatory && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2,
                          fontFamily: "'IBM Plex Mono',monospace" }}>mandatory</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--navy-border)" }}>
                      <VerdictBadge v={cell.verdict} size="xs" />
                    </td>
                    <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--navy-border)" }}>
                      <ConfBar pct={cell.conf} />
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 11,
                      color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace",
                      borderBottom: "1px solid var(--navy-border)" }}>{cell.evidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div style={{
            padding: "12px 20px", borderTop: "1px solid var(--navy-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "var(--navy-mid)",
          }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Verdicts subject to officer sign-off.
            </span>
            <button style={{
              padding: "8px 18px", background: "var(--green-dim)",
              border: "1px solid var(--green)", borderRadius: 4,
              color: "var(--green)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            }}>Accept All Verdicts</button>
          </div>
        </div>

        {/* Panel 3 — Evidence drill-down */}
        <div style={{
          width: 340, borderLeft: "1px solid var(--navy-border)",
          overflowY: "auto", background: "var(--navy-mid)", flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--navy-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--amber)",
              fontFamily: "'IBM Plex Mono',monospace" }}>
              Evidence Drill-Down — {selectedCriterion.id}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ fontSize: 11, color: "var(--text-muted)", background: "none",
                border: "none", cursor: "pointer" }}>← Prev</button>
              <button style={{ fontSize: 11, color: "var(--text-muted)", background: "none",
                border: "none", cursor: "pointer" }}>Next →</button>
            </div>
          </div>

          <div style={{ padding: "16px" }}>
            {/* Source document */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 4, letterSpacing: "0.08em" }}>SOURCE DOCUMENT</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>{EVIDENCE.source}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>
                Page {EVIDENCE.page} · BBox {EVIDENCE.bbox} · Hash {EVIDENCE.hash}
              </div>
            </div>

            {/* Extracted text snippet */}
            <div style={{
              background: "var(--navy-card)", border: "1px solid var(--navy-border)",
              borderRadius: 6, padding: "12px", marginBottom: 12, fontSize: 12,
              color: "var(--text-secondary)", lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 8 }}>
                ABC CONSTRUCTIONS PVT LTD
              </div>
              <div>Balance Sheet as at 31 March 2024 — Statement of P&L</div>
              <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0",
                  background: "rgba(245,158,11,0.08)", borderRadius: 3, paddingInline: 6 }}>
                  <span>I REVENUE FROM OPERATIONS</span>
                  <span style={{ color: "var(--green)" }}>7,25,00,000</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px" }}>
                  <span>II Other Income</span><span>18,45,288</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px" }}>
                  <span>III Total Income</span><span>7,43,45,288</span>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--green)", fontFamily: "'IBM Plex Mono',monospace" }}>
                ✓ Attested by CA · UDIN: 24000XXXXX5B4V3K<br />
                ✓ Verified at ICAI on 18-Apr-2026 · Signatory PAN on file
              </div>
            </div>

            {/* Extracted value */}
            <div style={{
              background: "rgba(16,185,129,0.08)", border: "1px solid var(--green)",
              borderRadius: 6, padding: "12px", marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 4, letterSpacing: "0.08em" }}>EXTRACTED VALUE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green)" }}>
                {EVIDENCE.extractedValue}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Threshold {EVIDENCE.threshold}
              </div>
            </div>

            {/* Verification badges */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { label: "UDIN VERIFIED",    ok: true },
                { label: "ITR CROSS-CHECK",  ok: true },
                { label: "BBOX CITED",       ok: true },
                { label: `CONFIDENCE ${EVIDENCE.confidence}%`, ok: EVIDENCE.confidence >= 85 },
              ].map(b => (
                <span key={b.label} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3,
                  background: b.ok ? "var(--green-dim)" : "var(--red-dim)",
                  color: b.ok ? "var(--green)" : "var(--red)",
                  border: `1px solid ${b.ok ? "var(--green)" : "var(--red)"}`,
                  fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600,
                }}>{b.label} {b.ok ? "✓" : "✗"}</span>
              ))}
            </div>

            {/* Action buttons */}
            {!overrideMode ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{
                  flex: 1, padding: "8px", background: "var(--green-dim)",
                  border: "1px solid var(--green)", borderRadius: 4,
                  color: "var(--green)", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
                }}>✓ Accept</button>
                <button style={{
                  flex: 1, padding: "8px", background: "var(--amber-dim)",
                  border: "1px solid var(--amber)", borderRadius: 4,
                  color: "var(--amber)", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
                }}>⚑ Flag for Review</button>
                <button
                  onClick={() => setOverrideMode(true)}
                  style={{
                    flex: 1, padding: "8px", background: "var(--red-dim)",
                    border: "1px solid var(--red)", borderRadius: 4,
                    color: "var(--red)", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
                  }}>✗ Override</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 6,
                  fontFamily: "'IBM Plex Mono',monospace" }}>
                  OVERRIDE REASON (mandatory)
                </div>
                <textarea
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="State reason for override. This will be logged in the audit trail."
                  rows={3}
                  style={{
                    width: "100%", padding: "8px", background: "var(--navy-card)",
                    border: "1px solid var(--red)", borderRadius: 4,
                    color: "var(--text-primary)", fontSize: 12, resize: "none",
                    fontFamily: "'IBM Plex Sans',sans-serif", outline: "none", marginBottom: 8,
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setOverrideMode(false)}
                    style={{
                      flex: 1, padding: "8px", background: "var(--navy-card)",
                      border: "1px solid var(--navy-border)", borderRadius: 4,
                      color: "var(--text-secondary)", fontSize: 12, cursor: "pointer",
                    }}>Cancel</button>
                  <button style={{
                    flex: 1, padding: "8px", background: "var(--red-dim)",
                    border: "1px solid var(--red)", borderRadius: 4,
                    color: "var(--red)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>Confirm Override</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}