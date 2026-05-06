"use client";
import { useState } from "react";

const BIDDERS = [
  { id: "B-01", short: "ABC Construct." },
  { id: "B-02", short: "Bharat Infra" },
  { id: "B-03", short: "Capital Builds" },
  { id: "B-04", short: "Deep Engg." },
  { id: "B-05", short: "Everest Proj." },
  { id: "B-06", short: "Federal Con." },
  { id: "B-07", short: "Ganga Infra" },
  { id: "B-08", short: "Himalaya LLP" },
  { id: "B-09", short: "Indraprastha" },
  { id: "B-10", short: "Jai Constr." },
];

const CRITERIA = [
  { id: "C-01", label: "Annual turnover ≥ ₹5 Cr",      mandatory: true,  category: "financial" },
  { id: "C-02", label: "≥ 3 similar projects (5y)",     mandatory: true,  category: "technical" },
  { id: "C-03", label: "Valid GST registration",         mandatory: true,  category: "compliance" },
  { id: "C-04", label: "ISO 9001 (valid on date)",       mandatory: true,  category: "compliance" },
  { id: "C-05", label: "Net worth positive last FY",     mandatory: true,  category: "financial" },
  { id: "C-06", label: "Experience on CAPF work",        mandatory: true,  category: "technical" },
  { id: "C-07", label: "Class-I local supplier",         mandatory: false, category: "compliance" },
  { id: "C-08", label: "EMD ₹10 Lakh enclosed",         mandatory: true,  category: "compliance" },
  { id: "C-09", label: "Valid PF / ESI registered",      mandatory: true,  category: "compliance" },
  { id: "C-10", label: "Auth. signatory + PoA",          mandatory: true,  category: "compliance" },
];

type Verdict = "PASS" | "FAIL" | "REVIEW";

// Matrix data matching the PPT exactly
const MATRIX: Record<string, Record<string, { v: Verdict; c: number }>> = {
  "C-01": { "B-01":{v:"PASS",c:97},"B-02":{v:"PASS",c:96},"B-03":{v:"PASS",c:99},"B-04":{v:"REVIEW",c:68},"B-05":{v:"PASS",c:91},"B-06":{v:"PASS",c:91},"B-07":{v:"PASS",c:89},"B-08":{v:"PASS",c:93},"B-09":{v:"PASS",c:81},"B-10":{v:"FAIL",c:55} },
  "C-02": { "B-01":{v:"PASS",c:94},"B-02":{v:"PASS",c:91},"B-03":{v:"FAIL",c:99},"B-04":{v:"PASS",c:78},"B-05":{v:"PASS",c:93},"B-06":{v:"FAIL",c:35},"B-07":{v:"PASS",c:85},"B-08":{v:"PASS",c:89},"B-09":{v:"REVIEW",c:67},"B-10":{v:"FAIL",c:92} },
  "C-03": { "B-01":{v:"PASS",c:99},"B-02":{v:"PASS",c:98},"B-03":{v:"PASS",c:99},"B-04":{v:"PASS",c:99},"B-05":{v:"PASS",c:99},"B-06":{v:"PASS",c:98},"B-07":{v:"PASS",c:99},"B-08":{v:"PASS",c:99},"B-09":{v:"PASS",c:99},"B-10":{v:"PASS",c:98} },
  "C-04": { "B-01":{v:"PASS",c:92},"B-02":{v:"PASS",c:96},"B-03":{v:"PASS",c:90},"B-04":{v:"PASS",c:88},"B-05":{v:"PASS",c:94},"B-06":{v:"PASS",c:91},"B-07":{v:"PASS",c:85},"B-08":{v:"PASS",c:93},"B-09":{v:"PASS",c:87},"B-10":{v:"PASS",c:90} },
  "C-05": { "B-01":{v:"REVIEW",c:68},"B-02":{v:"PASS",c:93},"B-03":{v:"FAIL",c:97},"B-04":{v:"PASS",c:85},"B-05":{v:"PASS",c:90},"B-06":{v:"FAIL",c:86},"B-07":{v:"PASS",c:88},"B-08":{v:"PASS",c:92},"B-09":{v:"PASS",c:80},"B-10":{v:"PASS",c:89} },
  "C-06": { "B-01":{v:"PASS",c:88},"B-02":{v:"PASS",c:90},"B-03":{v:"FAIL",c:94},"B-04":{v:"PASS",c:82},"B-05":{v:"PASS",c:85},"B-06":{v:"FAIL",c:93},"B-07":{v:"PASS",c:80},"B-08":{v:"PASS",c:91},"B-09":{v:"PASS",c:79},"B-10":{v:"PASS",c:84} },
  "C-07": { "B-01":{v:"PASS",c:95},"B-02":{v:"PASS",c:92},"B-03":{v:"PASS",c:86},"B-04":{v:"PASS",c:94},"B-05":{v:"PASS",c:89},"B-06":{v:"PASS",c:91},"B-07":{v:"PASS",c:95},"B-08":{v:"PASS",c:94},"B-09":{v:"PASS",c:90},"B-10":{v:"PASS",c:92} },
  "C-08": { "B-01":{v:"PASS",c:99},"B-02":{v:"PASS",c:99},"B-03":{v:"PASS",c:99},"B-04":{v:"PASS",c:99},"B-05":{v:"PASS",c:99},"B-06":{v:"PASS",c:99},"B-07":{v:"PASS",c:99},"B-08":{v:"PASS",c:99},"B-09":{v:"PASS",c:99},"B-10":{v:"PASS",c:99} },
  "C-09": { "B-01":{v:"PASS",c:93},"B-02":{v:"PASS",c:95},"B-03":{v:"PASS",c:91},"B-04":{v:"PASS",c:85},"B-05":{v:"PASS",c:92},"B-06":{v:"PASS",c:56},"B-07":{v:"PASS",c:88},"B-08":{v:"PASS",c:94},"B-09":{v:"PASS",c:88},"B-10":{v:"PASS",c:91} },
  "C-10": { "B-01":{v:"PASS",c:96},"B-02":{v:"PASS",c:94},"B-03":{v:"PASS",c:93},"B-04":{v:"PASS",c:91},"B-05":{v:"PASS",c:95},"B-06":{v:"PASS",c:90},"B-07":{v:"PASS",c:89},"B-08":{v:"PASS",c:92},"B-09":{v:"PASS",c:87},"B-10":{v:"PASS",c:88} },
};

function getOverall(bidderId: string): Verdict {
  for (const c of CRITERIA) {
    if (!c.mandatory) continue;
    const cell = MATRIX[c.id][bidderId];
    if (cell.v === "FAIL") return "FAIL";
    if (cell.v === "REVIEW") return "REVIEW";
  }
  return "PASS";
}

function VerdictCell({ v, c }: { v: Verdict; c: number }) {
  const bg = v === "PASS" ? "rgba(16,185,129,0.15)" : v === "FAIL" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)";
  const color = v === "PASS" ? "var(--green)" : v === "FAIL" ? "var(--red)" : "var(--amber)";
  return (
    <td style={{
      padding: "6px 4px", textAlign: "center",
      borderBottom: "1px solid var(--navy-border)",
      borderRight: "1px solid var(--navy-border)",
      background: bg,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
      <div style={{ fontSize: 10, color, opacity: 0.8 }}>{c}%</div>
    </td>
  );
}

function OverallCell({ v }: { v: Verdict }) {
  const bg = v === "PASS" ? "var(--green-dim)" : v === "FAIL" ? "var(--red-dim)" : "var(--amber-dim)";
  const color = v === "PASS" ? "var(--green)" : v === "FAIL" ? "var(--red)" : "var(--amber)";
  return (
    <td style={{
      padding: "10px 4px", textAlign: "center",
      borderRight: "1px solid var(--navy-border)",
      background: bg,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
    </td>
  );
}

type FilterType = "all" | "mandatory" | "review" | "financial" | "technical" | "compliance";

export default function CommitteePage() {
  const [filter, setFilter] = useState<FilterType>("all");

  const passCount  = BIDDERS.filter(b => getOverall(b.id) === "PASS").length;
  const reviewCount = BIDDERS.filter(b => getOverall(b.id) === "REVIEW").length;
  const failCount  = BIDDERS.filter(b => getOverall(b.id) === "FAIL").length;

  const visibleCriteria = CRITERIA.filter(c => {
    if (filter === "all")       return true;
    if (filter === "mandatory") return c.mandatory;
    if (filter === "review")    return BIDDERS.some(b => MATRIX[c.id][b.id].v === "REVIEW");
    return c.category === filter;
  });

  const tabs: { key: FilterType; label: string }[] = [
    { key: "all",        label: "All Criteria" },
    { key: "mandatory",  label: "Mandatory Only" },
    { key: "review",     label: "Review Only" },
    { key: "financial",  label: "Financial" },
    { key: "technical",  label: "Technical" },
    { key: "compliance", label: "Compliance" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)" }}>

      {/* Sub-header */}
      <div style={{
        background: "var(--navy-mid)", borderBottom: "1px solid var(--navy-border)",
        padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 2 }}>
            COMMITTEE REVIEW MODE
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tender #CRPF/2026/CON/034 · Construction Services · Bhopal HQ Complex
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>
            Committee Evaluation Matrix — all bidders vs all criteria
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Evaluation Committee · 3 members signed in
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>
              Session SID-2024-042 · Started 14:22 IST
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs + summary */}
      <div style={{
        background: "var(--navy-mid)", borderBottom: "1px solid var(--navy-border)",
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              style={{
                padding: "10px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: "none", border: "none",
                color: filter === t.key ? "var(--amber)" : "var(--text-secondary)",
                borderBottom: filter === t.key ? "2px solid var(--amber)" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "'IBM Plex Mono',monospace" }}>
          <span style={{ color: "var(--text-muted)" }}>OF 10 BIDDERS</span>
          <span style={{ color: "var(--green)" }}>PASS {passCount}</span>
          <span style={{ color: "var(--amber)" }}>REVIEW {reviewCount}</span>
          <span style={{ color: "var(--red)" }}>FAIL {failCount}</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr style={{ background: "var(--navy-mid)" }}>
              <th style={{
                padding: "10px 16px", textAlign: "left", minWidth: 220,
                fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace",
                borderBottom: "1px solid var(--navy-border)", borderRight: "1px solid var(--navy-border)",
                position: "sticky", left: 0, background: "var(--navy-mid)",
              }}>
                <div>CRITERION</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>mandatory marked with *</div>
              </th>
              {BIDDERS.map(b => (
                <th key={b.id} style={{
                  padding: "8px 4px", textAlign: "center", minWidth: 88,
                  fontSize: 11, color: "var(--text-primary)", fontFamily: "'IBM Plex Mono',monospace",
                  borderBottom: "1px solid var(--navy-border)", borderRight: "1px solid var(--navy-border)",
                }}>
                  <div style={{ fontWeight: 700 }}>{b.id}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{b.short}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleCriteria.map(c => (
              <tr key={c.id}>
                <td style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--navy-border)", borderRight: "1px solid var(--navy-border)",
                  background: "var(--navy-mid)",
                  position: "sticky", left: 0,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)",
                      fontFamily: "'IBM Plex Mono',monospace" }}>{c.id}</span>
                    {c.mandatory && (
                      <span style={{ fontSize: 10, color: "var(--red)" }}>*</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2 }}>{c.label}</div>
                  {c.mandatory && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace",
                      marginTop: 2 }}>mandatory</div>
                  )}
                </td>
                {BIDDERS.map(b => {
                  const cell = MATRIX[c.id][b.id];
                  return <VerdictCell key={b.id} v={cell.v} c={cell.c} />;
                })}
              </tr>
            ))}

            {/* Overall row */}
            <tr style={{ background: "var(--navy-mid)" }}>
              <td style={{
                padding: "12px 16px",
                borderTop: "2px solid var(--navy-border)", borderRight: "1px solid var(--navy-border)",
                position: "sticky", left: 0, background: "var(--navy-mid)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>OVERALL</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2,
                  fontFamily: "'IBM Plex Mono',monospace" }}>
                  composite verdict · mandatory logic applied
                </div>
              </td>
              {BIDDERS.map(b => (
                <OverallCell key={b.id} v={getOverall(b.id)} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}