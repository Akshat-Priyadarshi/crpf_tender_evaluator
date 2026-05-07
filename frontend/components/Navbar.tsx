"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function Navbar() {
  const path = usePathname();
  const [dark, setDark] = useState(true); // default: dark

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
  }, [dark]);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/upload", label: "Ingest Documents" },
    { href: "/evaluate", label: "Evaluate" },
    { href: "/committee", label: "Committee View" },
  ];

  return (
    <nav
      style={{
        background: "var(--navy-mid)",
        borderBottom: "1px solid var(--navy-border)",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "var(--amber)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--navy)",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          T
        </div>
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            CRPF Tender Evaluation Platform
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            Decision-Support for Government Procurement
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 4 }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              color: path === l.href ? "var(--amber)" : "var(--text-secondary)",
              background:
                path === l.href ? "rgba(245,158,11,0.1)" : "transparent",
              border:
                path === l.href
                  ? "1px solid rgba(245,158,11,0.3)"
                  : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Dark mode toggle */}
      <button
        onClick={() => setDark((d) => !d)}
        title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px",
          borderRadius: 20,
          border: "1px solid var(--navy-border)",
          background: "var(--navy-card)",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 14 }}>{dark ? "☀️" : "🌙"}</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {dark ? "LIGHT" : "DARK"}
        </span>
      </button>
    </nav>
  );
}
