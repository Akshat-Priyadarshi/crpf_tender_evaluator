"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    setLoading(true);
    setError("");

    // Simulate auth delay
    await new Promise((r) => setTimeout(r, 1200));

    if (username === "CRPF-ADMIN" && password === "admin123") {
      // Set cookie
      document.cookie = "crpf_auth=1; path=/; SameSite=Strict; max-age=86400";
      setSuccess(true);
      // Use router.push for Next.js navigation (respects middleware correctly)
      await new Promise((r) => setTimeout(r, 600));
      router.push("/");
      router.refresh();
    } else {
      setError("Invalid credentials. Try CRPF-ADMIN / admin123");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #0b1a14 0%, #0d2218 35%, #091a13 65%, #060e0a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: 420,
          background: "rgba(7,18,12,.98)",
          border: "1px solid rgba(212,175,55,.24)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 50px 100px rgba(0,0,0,.8)",
        }}
      >
        {/* Gold top bar */}
        <div
          style={{
            height: 3,
            background:
              "linear-gradient(90deg,transparent,#d4af37,#4ecdc4,#d4af37,transparent)",
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "40px 44px 28px",
            textAlign: "center",
            borderBottom: "1px solid rgba(212,175,55,.07)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>🦅</div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: 20,
              fontWeight: 700,
              color: "#d4af37",
              letterSpacing: 4,
              marginBottom: 4,
            }}
          >
            SECURE ACCESS
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(212,175,55,.42)",
              letterSpacing: 3,
            }}
          >
            Central Reserve Police Force
          </div>
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(78,205,196,.05)",
              border: "1px solid rgba(78,205,196,.15)",
              borderRadius: 3,
              padding: "4px 14px",
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#4ecdc4",
                boxShadow: "0 0 6px #4ecdc4",
              }}
            />
            <span
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: 9,
                color: "rgba(78,205,196,.52)",
                letterSpacing: 2,
              }}
            >
              ENCRYPTED · AES-256 · TLS 1.3
            </span>
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: "32px 44px 28px" }}>
          {/* Username */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(212,175,55,.38)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 8,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              Service ID / Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Enter service ID"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(7,22,14,.82)",
                border: "1px solid rgba(212,175,55,.14)",
                borderRadius: 4,
                color: "#f0ead6",
                fontSize: 14,
                outline: "none",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(212,175,55,.38)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 8,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              Passkey / PIN
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(7,22,14,.82)",
                border: "1px solid rgba(212,175,55,.14)",
                borderRadius: 4,
                color: "#f0ead6",
                fontSize: 14,
                outline: "none",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 14px",
                background: "rgba(239,68,68,.1)",
                border: "1px solid rgba(239,68,68,.3)",
                borderRadius: 4,
                fontSize: 12,
                color: "#ef4444",
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              {error}
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleLogin}
            disabled={loading || success}
            style={{
              width: "100%",
              padding: 15,
              background: success
                ? "linear-gradient(135deg,#1a5c2a,#0d3d1a)"
                : "linear-gradient(135deg,#b8921e,#d4af37,#e8c547,#d4af37,#b8921e)",
              border: "none",
              borderRadius: 4,
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: 13,
              fontWeight: 700,
              color: success ? "#4ecdc4" : "#0b1a14",
              letterSpacing: 4,
              cursor: loading || success ? "default" : "pointer",
            }}
          >
            {success
              ? "✦ ACCESS GRANTED"
              : loading
                ? "AUTHENTICATING..."
                : "AUTHENTICATE"}
          </button>

          <div
            style={{
              marginTop: 16,
              textAlign: "center",
              fontSize: 11,
              color: "rgba(212,175,55,.25)",
              fontFamily: "'IBM Plex Mono',monospace",
            }}
          >
            Demo: CRPF-ADMIN / admin123
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 44px",
            background: "rgba(0,0,0,.35)",
            borderTop: "1px solid rgba(212,175,55,.04)",
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: 9,
              color: "rgba(212,175,55,.15)",
              letterSpacing: 1,
            }}
          >
            © 2026 CRPF · MHA · GOVT. OF INDIA
          </span>
        </div>
      </div>
    </div>
  );
}
