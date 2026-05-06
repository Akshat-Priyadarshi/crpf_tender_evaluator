"use client";
import Link from "next/link";
import { useState } from "react";

const stats = [
  { label: "Active Tenders",     value: "3",      color: "var(--blue)" },
  { label: "Documents Ingested", value: "247",    color: "var(--green)" },
  { label: "Pending Review",     value: "12",     color: "var(--amber)" },
  { label: "Audit Chain Status", value: "INTACT", color: "var(--green)" },
];

const actions = [
  { href: "/upload",    title: "Ingest Documents",   desc: "Upload tender or bid documents through the secure Layer 1 pipeline. Virus scan, hash, classify and vault." },
  { href: "/evaluate",  title: "Evaluate Bids",      desc: "Review criterion-level verdicts for each bidder. Accept, flag, or override with mandatory reason string." },
  { href: "/committee", title: "Committee Grid",      desc: "Side-by-side matrix of all bidders vs all criteria. Filter by mandatory, financial, technical, compliance." },
];

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "var(--navy-card)",
          border: `1px solid ${hovered ? "var(--amber)" : "var(--navy-border)"}`,
          borderRadius: 8, padding: 24, cursor: "pointer", transition: "border-color 0.15s",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</div>
        <div style={{ marginTop: 16, fontSize: 12, color: "var(--amber)", fontFamily: "'IBM Plex Mono',monospace" }}>OPEN →</div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "var(--amber)", marginBottom: 6, letterSpacing: "0.1em" }}>
          LAYER 1 — SECURE INGESTION · ACTIVE</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Tender Evaluation Platform</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          AI-based eligibility analysis for CRPF government procurement. Every verdict subject to officer sign-off.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "var(--navy-card)", border: "1px solid var(--navy-border)", borderRadius: 8, padding: "20px 24px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "'IBM Plex Mono',monospace" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        {actions.map(a => <ActionCard key={a.href} {...a} />)}
      </div>
      <div style={{ background: "var(--navy-card)", border: "1px solid var(--navy-border)", borderRadius: 8, padding: "16px 20px", display: "flex", gap: 32, flexWrap: "wrap" }}>
        {["L1 Secure Ingestion","L2 Doc Processing","L3 Criterion Extraction","L4 Evidence Graph","L5 Evaluation Engine","L6 Human-in-the-Loop","L7 Audit & Export"].map((l, i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === 0 ? "var(--green)" : "var(--slate)" }} />
            <span style={{ fontSize: 11, color: i === 0 ? "var(--green)" : "var(--text-muted)", fontFamily: "'IBM Plex Mono',monospace" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}