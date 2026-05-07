"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const PARTICLE_CFG = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2.5 + 0.5,
  vx: (Math.random() - 0.5) * 0.015,
  vy: -(Math.random() * 0.025 + 0.005),
  opacity: Math.random() * 0.6 + 0.15,
  color:
    i % 4 === 0
      ? "#d4af37"
      : i % 4 === 1
        ? "#4ecdc4"
        : i % 4 === 2
          ? "#a8e6cf"
          : "#f7f3e9",
}));

const TYPEWRITER_TEXTS = [
  "Tender Evaluation System",
  "Secure OCR Processing",
  "PostgreSQL Integration",
  "AI-Powered Analysis",
];

const UTIL_LINKS = [
  { icon: "🔑", label: "Change Credentials", desc: "Update login details" },
  { icon: "👮", label: "Register Personnel", desc: "Add new CRPF officer" },
  { icon: "🗃️", label: "Tender Archive", desc: "Past evaluations" },
  { icon: "📊", label: "Analytics Dashboard", desc: "Performance metrics" },
  { icon: "🛡️", label: "Audit Logs", desc: "Security access logs" },
  { icon: "📞", label: "IT Helpdesk", desc: "Technical support" },
];

export default function CRPFLogin() {
  const [username, setUsername] = useState("");
  const [passkey, setPasskey] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [shake, setShake] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [typeText, setTypeText] = useState("");
  const [typeIdx, setTypeIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [erasing, setErasing] = useState(false);
  const [particles, setParticles] = useState(PARTICLE_CFG);
  const [blobAngle, setBlobAngle] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [btnHover, setBtnHover] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const lastTime = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setCardVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const target = TYPEWRITER_TEXTS[typeIdx];
    const delay = erasing ? 38 : charIdx === 0 ? 900 : 68;
    const t = setTimeout(() => {
      if (!erasing) {
        if (charIdx < target.length) {
          setTypeText(target.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        } else setTimeout(() => setErasing(true), 1800);
      } else {
        if (charIdx > 0) {
          setTypeText(target.slice(0, charIdx - 1));
          setCharIdx((c) => c - 1);
        } else {
          setErasing(false);
          setTypeIdx((i) => (i + 1) % TYPEWRITER_TEXTS.length);
        }
      }
    }, delay);
    return () => clearTimeout(t);
  }, [charIdx, erasing, typeIdx]);

  useEffect(() => {
    const loop = (now: number) => {
      const dt = lastTime.current
        ? Math.min((now - lastTime.current) / 1000, 0.05)
        : 0;
      lastTime.current = now;
      setBlobAngle((a) => (a + dt * 18) % 360);
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: (p.x + p.vx + 100) % 100,
          y: (p.y + p.vy + 100) % 100,
        })),
      );
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
  }, []);

  const handleBtnMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - rect.left - rect.width / 2) * 0.28;
    const dy = (e.clientY - rect.top - rect.height / 2) * 0.28;
    if (btnRef.current)
      btnRef.current.style.transform = `translate(${dx}px,${dy}px) scale(1.04)`;
  };
  const handleBtnLeave = () => {
    if (btnRef.current)
      btnRef.current.style.transform = "translate(0,0) scale(1)";
    setBtnHover(false);
  };

  const handleLogin = () => {
    if (!username || !passkey) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLoginSuccess(true);
    }, 2400);
  };

  const handleForgot = () => {
    if (!forgotEmail) return;
    setForgotSent(true);
    setTimeout(() => {
      setForgotOpen(false);
      setForgotSent(false);
      setForgotEmail("");
    }, 2800);
  };

  const blobPath = (
    cx: number,
    cy: number,
    r: number,
    angle: number,
    sides = 6,
  ) => {
    const pts = Array.from({ length: sides * 2 }, (_, i) => {
      const a = (i / (sides * 2)) * Math.PI * 2 + (angle * Math.PI) / 180;
      const wave = i % 2 === 0 ? r * 1.18 : r * 0.82;
      return `${cx + Math.cos(a) * wave},${cy + Math.sin(a) * wave}`;
    });
    return (
      `M ${pts[0]} ` +
      pts
        .slice(1)
        .map((p) => `L ${p}`)
        .join(" ") +
      " Z"
    );
  };

  const px = (mousePos.x - 0.5) * 20;
  const py = (mousePos.y - 0.5) * 20;

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #0b1a14 0%, #0d2218 35%, #091a13 65%, #060e0a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Cinzel','Cormorant Garamond',Georgia,serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Share+Tech+Mono&family=Exo+2:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        ::selection{background:#d4af3744;color:#d4af37;}

        @keyframes fadeUp{from{opacity:0;transform:translateY(38px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes dropDown{from{opacity:0;transform:translateY(-14px) scaleY(0.86);}to{opacity:1;transform:translateY(0) scaleY(1);}}
        @keyframes shakeX{0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-9px);}40%,80%{transform:translateX(9px);}}
        @keyframes spinCW{to{transform:rotate(360deg);}}
        @keyframes spinCCW{to{transform:rotate(-360deg);}}
        @keyframes goldFlow{0%{background-position:0% 50%;}100%{background-position:300% 50%;}}
        @keyframes scanDown{0%{top:-2px;opacity:.8;}100%{top:100%;opacity:0;}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes successPop{0%{transform:scale(.85);opacity:0;}60%{transform:scale(1.05);opacity:1;}100%{transform:scale(1);opacity:1;}}
        @keyframes dotPulse{0%,100%{transform:scale(1);opacity:.6;}50%{transform:scale(1.7);opacity:1;}}
        @keyframes staggerIn{from{opacity:0;transform:translateX(-14px);}to{opacity:1;transform:translateX(0);}}
        @keyframes glowRing{0%,100%{box-shadow:0 0 0 2px rgba(212,175,55,.12);}50%{box-shadow:0 0 0 7px rgba(212,175,55,.06),0 0 40px rgba(212,175,55,.12);}}
        @keyframes marchDash{to{stroke-dashoffset:-60;}}
        @keyframes pulseGlow{0%,100%{opacity:.45;}50%{opacity:1;}}
        @keyframes fadeModal{from{opacity:0;transform:translateY(20px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}

        .card-enter{animation:fadeUp .9s cubic-bezier(.22,1,.36,1) both;}
        .shake{animation:shakeX .5s ease both;}
        .ring1{animation:spinCW   9s linear infinite;}
        .ring2{animation:spinCCW 14s linear infinite;}
        .ring3{animation:spinCW  22s linear infinite;}
        .march{animation:marchDash 1.2s linear infinite;}

        .inp{
          width:100%;
          background:rgba(7,22,14,.82);
          border:1px solid rgba(212,175,55,.14);
          border-radius:4px;
          color:#f0ead6;
          font-family:'Exo 2',sans-serif;
          font-size:14px;font-weight:400;
          letter-spacing:.3px;
          padding:13px 16px 13px 44px;
          outline:none;
          transition:border-color .3s,box-shadow .3s,background .3s;
        }
        .inp::placeholder{color:rgba(212,175,55,.22);font-style:italic;}
        .inp:focus{
          border-color:rgba(212,175,55,.55);
          background:rgba(10,28,18,.97);
          box-shadow:0 0 0 3px rgba(212,175,55,.07),inset 0 0 18px rgba(212,175,55,.03);
        }

        .util-row{
          display:flex;align-items:center;gap:12px;
          padding:11px 14px;border-radius:4px;cursor:pointer;
          transition:background .2s,transform .2s,color .2s;
          color:rgba(212,175,55,.42);
          font-family:'Exo 2',sans-serif;font-size:12.5px;font-weight:500;letter-spacing:.3px;
          border-bottom:1px solid rgba(212,175,55,.05);
        }
        .util-row:last-child{border-bottom:none;}
        .util-row:hover{background:rgba(212,175,55,.07);color:#d4af37;transform:translateX(5px);}

        .sec-btn{
          flex:1;padding:10px 6px;
          background:rgba(212,175,55,.025);
          border:1px solid rgba(212,175,55,.09);
          border-radius:4px;cursor:pointer;
          font-family:'Exo 2',sans-serif;font-size:10.5px;font-weight:600;
          color:rgba(212,175,55,.35);letter-spacing:.5px;
          text-align:center;text-transform:uppercase;
          transition:all .25s;
        }
        .sec-btn:hover{background:rgba(212,175,55,.08);border-color:rgba(212,175,55,.32);color:#d4af37;transform:translateY(-2px);}

        .top-link{
          font-family:'Exo 2',sans-serif;font-size:11.5px;font-weight:600;
          color:rgba(212,175,55,.32);letter-spacing:.8px;text-transform:uppercase;
          cursor:pointer;transition:color .2s;position:relative;
        }
        .top-link::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1px;background:#d4af37;transition:width .3s;}
        .top-link:hover{color:#d4af37;}
        .top-link:hover::after{width:100%;}

        .sdot{width:5px;height:5px;border-radius:50%;animation:dotPulse 2s ease-in-out infinite;}

        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(212,175,55,.18);border-radius:2px;}
      `}</style>

      {/* SVG background layer */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <defs>
          <radialGradient id="bg1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a4a2e" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#1a4a2e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bg2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bg3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4ecdc4" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#4ecdc4" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Morphing blobs with mouse parallax */}
        <path
          d={blobPath(20, 25, 18, blobAngle, 7)}
          fill="url(#bg1)"
          style={{
            transform: `translate(${px * -0.4}px,${py * -0.4}px)`,
            transition: "transform .12s",
          }}
        />
        <path
          d={blobPath(80, 70, 22, blobAngle + 60, 8)}
          fill="url(#bg2)"
          style={{
            transform: `translate(${px * 0.3}px,${py * 0.3}px)`,
            transition: "transform .12s",
          }}
        />
        <path
          d={blobPath(65, 15, 12, blobAngle + 120, 6)}
          fill="url(#bg3)"
          style={{
            transform: `translate(${px * -0.2}px,${py * -0.2}px)`,
            transition: "transform .12s",
          }}
        />
        <path
          d={blobPath(10, 80, 10, blobAngle + 200, 5)}
          fill="url(#bg1)"
          style={{
            transform: `translate(${px * 0.5}px,${py * 0.5}px)`,
            transition: "transform .12s",
          }}
        />
        {/* Grid */}
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={`${(i + 1) * 8}%`}
            y1="0"
            x2={`${(i + 1) * 8}%`}
            y2="100%"
            stroke="rgba(212,175,55,.028)"
            strokeWidth=".5"
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={`${(i + 1) * 11}%`}
            x2="100%"
            y2={`${(i + 1) * 11}%`}
            stroke="rgba(212,175,55,.022)"
            strokeWidth=".5"
          />
        ))}
        {/* Marching frame border */}
        <rect
          x="1"
          y="1"
          width="99%"
          height="99%"
          fill="none"
          stroke="rgba(212,175,55,.07)"
          strokeWidth="1"
          strokeDasharray="30 30"
          className="march"
        />
        {/* Particles */}
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={`${p.x}%`}
            cy={`${p.y}%`}
            r={p.size}
            fill={p.color}
            opacity={p.opacity}
          />
        ))}
      </svg>

      {/* Scanlines */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)",
        }}
      />

      {/* Scan beam */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          height: "2px",
          zIndex: 2,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg,transparent,rgba(78,205,196,.14),rgba(212,175,55,.2),rgba(78,205,196,.14),transparent)",
          animation: "scanDown 6s ease-in-out infinite",
        }}
      />

      {/* ── Top nav ── */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(6,14,10,.97)",
          borderBottom: "1px solid rgba(212,175,55,.1)",
          backdropFilter: "blur(24px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 36px",
          height: "50px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Ashoka chakra SVG */}
          <svg width="26" height="26" viewBox="0 0 26 26">
            <circle
              cx="13"
              cy="13"
              r="11"
              fill="none"
              stroke="#d4af37"
              strokeWidth="1.4"
              opacity=".8"
            />
            <circle cx="13" cy="13" r="3" fill="#d4af37" opacity=".9" />
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1="13"
                  y1="13"
                  x2={13 + Math.cos(a) * 8}
                  y2={13 + Math.sin(a) * 8}
                  stroke="#d4af37"
                  strokeWidth=".65"
                  opacity=".5"
                />
              );
            })}
          </svg>
          <div>
            <div
              style={{
                fontFamily: "Cinzel",
                fontSize: "12px",
                fontWeight: 700,
                color: "#d4af37",
                letterSpacing: "3px",
              }}
            >
              CRPF · TES
            </div>
            <div
              style={{
                fontFamily: "Share Tech Mono",
                fontSize: "8px",
                color: "rgba(212,175,55,.3)",
                letterSpacing: "1px",
              }}
            >
              TENDER EVALUATION SYSTEM
            </div>
          </div>
          <div
            style={{
              width: "1px",
              height: "22px",
              background: "rgba(212,175,55,.1)",
              margin: "0 8px",
            }}
          />
          {/* Typewriter */}
          <span
            style={{
              fontFamily: "Share Tech Mono",
              fontSize: "10px",
              color: "rgba(78,205,196,.55)",
              letterSpacing: "1px",
              minWidth: "220px",
            }}
          >
            {typeText}
            <span
              style={{
                borderRight: "1.5px solid rgba(78,205,196,.6)",
                marginLeft: "1px",
                animation: "blink .9s step-end infinite",
              }}
            />
          </span>
        </div>
        <div style={{ display: "flex", gap: "26px", alignItems: "center" }}>
          {["Home", "About", "Contact", "Policy"].map((l) => (
            <span key={l} className="top-link">
              {l}
            </span>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginLeft: "8px",
            }}
          >
            <div
              className="sdot"
              style={{ background: "#4ecdc4", boxShadow: "0 0 6px #4ecdc4" }}
            />
            <span
              style={{
                fontFamily: "Share Tech Mono",
                fontSize: "9px",
                color: "rgba(78,205,196,.4)",
                letterSpacing: "1.5px",
              }}
            >
              SECURE
            </span>
          </div>
        </div>
      </div>

      {/* ── Card ── */}
      <div
        className={`${cardVisible ? "card-enter" : ""} ${shake ? "shake" : ""}`}
        style={{
          position: "relative",
          zIndex: 10,
          width: "470px",
          marginTop: "50px",
          transform: `perspective(1200px) rotateX(${(mousePos.y - 0.5) * -3}deg) rotateY(${(mousePos.x - 0.5) * 3}deg)`,
          transition: "transform .15s ease",
        }}
      >
        {/* Animated gradient border */}
        <div
          style={{
            position: "absolute",
            inset: "-1px",
            borderRadius: "6px",
            zIndex: -1,
            background:
              "linear-gradient(135deg,rgba(212,175,55,.32),rgba(78,205,196,.12),rgba(212,175,55,.06),rgba(78,205,196,.18))",
            backgroundSize: "300% 300%",
            animation: "goldFlow 5s linear infinite",
          }}
        />

        {/* Card body */}
        <div
          style={{
            background: "rgba(7,18,12,.98)",
            backdropFilter: "blur(32px)",
            borderRadius: "5px",
            overflow: "hidden",
            boxShadow:
              "0 50px 100px rgba(0,0,0,.8),0 0 80px rgba(212,175,55,.05)",
          }}
        >
          {/* Gold top bar */}
          <div
            style={{
              height: "2px",
              background:
                "linear-gradient(90deg,transparent,#d4af37,#4ecdc4,#a8e6cf,#d4af37,transparent)",
              backgroundSize: "300% 100%",
              animation: "goldFlow 3s linear infinite",
            }}
          />

          {/* ── Header ── */}
          <div
            style={{
              padding: "40px 44px 30px",
              textAlign: "center",
              borderBottom: "1px solid rgba(212,175,55,.07)",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "inline-block",
                position: "relative",
                marginBottom: "22px",
              }}
            >
              {/* Spinning rings */}
              <div
                className="ring1"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "92px",
                  height: "92px",
                  marginLeft: "-46px",
                  marginTop: "-46px",
                  borderRadius: "50%",
                  border: "1px solid rgba(212,175,55,.18)",
                  borderTopColor: "rgba(212,175,55,.7)",
                  borderRightColor: "rgba(212,175,55,.38)",
                }}
              />
              <div
                className="ring2"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "112px",
                  height: "112px",
                  marginLeft: "-56px",
                  marginTop: "-56px",
                  borderRadius: "50%",
                  border: "1.5px dashed rgba(78,205,196,.1)",
                  borderBottomColor: "rgba(78,205,196,.32)",
                }}
              />
              <div
                className="ring3"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "132px",
                  height: "132px",
                  marginLeft: "-66px",
                  marginTop: "-66px",
                  borderRadius: "50%",
                  border: ".5px solid rgba(212,175,55,.05)",
                  borderLeftColor: "rgba(212,175,55,.18)",
                }}
              />
              {/* Emblem */}
              <div
                style={{
                  width: "74px",
                  height: "74px",
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 35% 35%,#1a3a22,#0b1a10)",
                  border: "1.5px solid rgba(212,175,55,.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: "2px",
                  animation: "glowRing 3.5s ease-in-out infinite",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <span style={{ fontSize: "28px", lineHeight: 1 }}>🦅</span>
                <span
                  style={{
                    fontFamily: "Cinzel",
                    fontSize: "7px",
                    color: "#d4af37",
                    fontWeight: 700,
                    letterSpacing: "2px",
                  }}
                >
                  CRPF
                </span>
              </div>
            </div>

            <div
              style={{
                fontFamily: "Cinzel",
                fontSize: "20px",
                fontWeight: 700,
                color: "#f0ead6",
                letterSpacing: "4px",
                marginBottom: "7px",
                textShadow: "0 0 30px rgba(212,175,55,.3)",
              }}
            >
              SECURE ACCESS
            </div>
            <div
              style={{
                fontFamily: "Cormorant Garamond",
                fontSize: "13px",
                fontWeight: 400,
                color: "rgba(212,175,55,.42)",
                letterSpacing: "3px",
                fontStyle: "italic",
              }}
            >
              Central Reserve Police Force
            </div>
            <div
              style={{
                marginTop: "14px",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "rgba(78,205,196,.05)",
                border: "1px solid rgba(78,205,196,.15)",
                borderRadius: "3px",
                padding: "4px 14px",
              }}
            >
              <div
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: "#4ecdc4",
                  boxShadow: "0 0 6px #4ecdc4",
                  animation: "pulseGlow 1.8s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "Share Tech Mono",
                  fontSize: "9px",
                  color: "rgba(78,205,196,.52)",
                  letterSpacing: "2px",
                }}
              >
                ENCRYPTED · AES-256 · TLS 1.3
              </span>
            </div>
          </div>

          {/* ── Form ── */}
          <div style={{ padding: "32px 44px 24px" }}>
            {/* Username */}
            <div
              style={{
                marginBottom: "20px",
                animation: cardVisible ? "staggerIn .6s .3s both" : "none",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontFamily: "Exo 2,sans-serif",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: "rgba(212,175,55,.38)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                Service ID / Username
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "15px",
                    opacity: focusedField === "user" ? 0.85 : 0.38,
                    transition: "opacity .3s",
                  }}
                >
                  👤
                </span>
                <input
                  className="inp"
                  type="text"
                  placeholder="Enter service ID or username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedField("user")}
                  onBlur={() => setFocusedField(null)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                {username && (
                  <span
                    style={{
                      position: "absolute",
                      right: "13px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#4ecdc4",
                      boxShadow: "0 0 8px #4ecdc4",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Passkey */}
            <div
              style={{
                marginBottom: "22px",
                animation: cardVisible ? "staggerIn .6s .44s both" : "none",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontFamily: "Exo 2,sans-serif",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: "rgba(212,175,55,.38)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                Passkey / PIN
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "15px",
                    opacity: focusedField === "pass" ? 0.85 : 0.38,
                    transition: "opacity .3s",
                  }}
                >
                  🔐
                </span>
                <input
                  className="inp"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  onFocus={() => setFocusedField("pass")}
                  onBlur={() => setFocusedField(null)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  style={{
                    paddingRight: "46px",
                    fontFamily: showPass ? "Share Tech Mono" : undefined,
                    letterSpacing: showPass ? "2px" : "5px",
                  }}
                />
                <button
                  onClick={() => setShowPass((s) => !s)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    opacity: 0.38,
                    transition: "opacity .2s",
                    padding: "4px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = ".38")}
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "26px",
                animation: cardVisible ? "staggerIn .6s .56s both" : "none",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "15px",
                    height: "15px",
                    border: "1px solid rgba(212,175,55,.18)",
                    borderRadius: "3px",
                    background: "rgba(7,18,12,.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "7px",
                      height: "7px",
                      background: "rgba(212,175,55,0)",
                      borderRadius: "1px",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "Exo 2,sans-serif",
                    fontSize: "11.5px",
                    color: "rgba(212,175,55,.28)",
                    fontWeight: 500,
                  }}
                >
                  Remember Device
                </span>
              </label>
              <span
                className="top-link"
                onClick={() => setForgotOpen(true)}
                style={{ color: "rgba(212,175,55,.45)", fontSize: "11px" }}
              >
                Forgot Passkey?
              </span>
            </div>

            {/* Magnetic login button */}
            <div
              style={{
                animation: cardVisible ? "staggerIn .6s .66s both" : "none",
              }}
            >
              <button
                ref={btnRef}
                onClick={handleLogin}
                onMouseMove={handleBtnMouseMove}
                onMouseEnter={() => setBtnHover(true)}
                onMouseLeave={handleBtnLeave}
                disabled={loading || loginSuccess}
                style={{
                  width: "100%",
                  padding: "15px",
                  background: loginSuccess
                    ? "linear-gradient(135deg,#1a5c2a,#0d3d1a)"
                    : loading
                      ? "linear-gradient(135deg,#2a3a1a,#1a2a10)"
                      : "linear-gradient(135deg,#b8921e,#d4af37,#e8c547,#d4af37,#b8921e)",
                  backgroundSize: "300% 100%",
                  border: "none",
                  borderRadius: "4px",
                  fontFamily: "Cinzel",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: loginSuccess
                    ? "#4ecdc4"
                    : loading
                      ? "rgba(212,175,55,.45)"
                      : "#0b1a14",
                  letterSpacing: "4px",
                  cursor: loading || loginSuccess ? "default" : "pointer",
                  transition:
                    "color .4s,background .4s,box-shadow .25s,transform .18s",
                  boxShadow: loginSuccess
                    ? "0 6px 24px rgba(78,205,196,.28)"
                    : btnHover
                      ? "0 14px 44px rgba(212,175,55,.48),0 4px 16px rgba(212,175,55,.3)"
                      : "0 6px 24px rgba(212,175,55,.22)",
                  animation:
                    !loginSuccess && !loading
                      ? "goldFlow 3s linear infinite"
                      : loginSuccess
                        ? "successPop .5s ease both"
                        : undefined,
                }}
              >
                {loading ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      style={{ animation: "spinCW .7s linear infinite" }}
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        stroke="rgba(212,175,55,.28)"
                        strokeWidth="2"
                      />
                      <path
                        d="M 8 2 A 6 6 0 0 1 14 8"
                        fill="none"
                        stroke="#d4af37"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    AUTHENTICATING
                  </span>
                ) : loginSuccess ? (
                  "✦ ACCESS GRANTED"
                ) : (
                  "AUTHENTICATE"
                )}
              </button>
            </div>
          </div>

          {/* ── Utilities ── */}
          <div
            style={{
              padding: "20px 44px 24px",
              borderTop: "1px solid rgba(212,175,55,.06)",
            }}
          >
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setUtilOpen((o) => !o)}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  background: utilOpen
                    ? "rgba(212,175,55,.06)"
                    : "rgba(212,175,55,.02)",
                  border: `1px solid ${utilOpen ? "rgba(212,175,55,.28)" : "rgba(212,175,55,.08)"}`,
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  fontFamily: "Exo 2,sans-serif",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: utilOpen ? "#d4af37" : "rgba(212,175,55,.32)",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  transition: "all .25s",
                }}
              >
                <span>⚙ Utility Options</span>
                <span
                  style={{
                    transition: "transform .3s",
                    transform: utilOpen ? "rotate(180deg)" : "none",
                    fontSize: "10px",
                  }}
                >
                  ▼
                </span>
              </button>

              {utilOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: "rgba(7,18,12,.99)",
                    border: "1px solid rgba(212,175,55,.18)",
                    borderRadius: "4px",
                    boxShadow: "0 24px 48px rgba(0,0,0,.88)",
                    overflow: "hidden",
                    animation: "dropDown .22s cubic-bezier(.22,1,.36,1) both",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  {UTIL_LINKS.map((item, i) => (
                    <div
                      key={i}
                      className="util-row"
                      style={{
                        animationDelay: `${i * 0.045}s`,
                        animation: "staggerIn .3s ease both",
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>{item.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.label}</div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "rgba(212,175,55,.22)",
                            marginTop: "1px",
                            fontWeight: 400,
                          }}
                        >
                          {item.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              {[
                { icon: "🆘", label: "Emergency" },
                { icon: "📱", label: "OTP Login" },
                { icon: "🏛️", label: "SSO Login" },
              ].map((btn) => (
                <button key={btn.label} className="sec-btn">
                  <div style={{ fontSize: "14px", marginBottom: "4px" }}>
                    {btn.icon}
                  </div>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px 44px",
              background: "rgba(0,0,0,.35)",
              borderTop: "1px solid rgba(212,175,55,.04)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "Share Tech Mono",
                fontSize: "9px",
                color: "rgba(212,175,55,.15)",
                letterSpacing: "1px",
              }}
            >
              © 2024 CRPF · MHA · GOVT. OF INDIA
            </span>
            <div style={{ display: "flex", gap: "18px" }}>
              {["Privacy", "Terms", "Help"].map((l) => (
                <span
                  key={l}
                  className="top-link"
                  style={{ color: "rgba(212,175,55,.15)", fontSize: "9.5px" }}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Side accent lines */}
        <div
          style={{
            position: "absolute",
            left: "-18px",
            top: "15%",
            bottom: "15%",
            width: "1px",
            background:
              "linear-gradient(180deg,transparent,rgba(212,175,55,.22),transparent)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-18px",
            top: "25%",
            bottom: "25%",
            width: "1px",
            background:
              "linear-gradient(180deg,transparent,rgba(78,205,196,.18),transparent)",
          }}
        />

        {/* Corner ticks */}
        {[
          {
            top: "-6px",
            left: "-6px",
            borderTop: "1.5px solid #d4af37",
            borderLeft: "1.5px solid #d4af37",
          },
          {
            top: "-6px",
            right: "-6px",
            borderTop: "1.5px solid #d4af37",
            borderRight: "1.5px solid #d4af37",
          },
          {
            bottom: "-6px",
            left: "-6px",
            borderBottom: "1.5px solid rgba(212,175,55,.38)",
            borderLeft: "1.5px solid rgba(212,175,55,.38)",
          },
          {
            bottom: "-6px",
            right: "-6px",
            borderBottom: "1.5px solid rgba(212,175,55,.38)",
            borderRight: "1.5px solid rgba(212,175,55,.38)",
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "14px",
              height: "14px",
              ...s,
            }}
          />
        ))}
      </div>

      {/* ── Forgot Password Modal ── */}
      {forgotOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,.9)",
            backdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => e.target === e.currentTarget && setForgotOpen(false)}
        >
          <div
            style={{
              background: "rgba(7,18,12,.99)",
              border: "1px solid rgba(212,175,55,.24)",
              borderRadius: "5px",
              width: "380px",
              overflow: "hidden",
              boxShadow: "0 50px 100px rgba(0,0,0,.92)",
              animation: "fadeModal .35s cubic-bezier(.22,1,.36,1) both",
            }}
          >
            <div
              style={{
                height: "2px",
                background:
                  "linear-gradient(90deg,transparent,#d4af37,#4ecdc4,transparent)",
                backgroundSize: "300% 100%",
                animation: "goldFlow 2s linear infinite",
              }}
            />
            <div style={{ padding: "30px 34px" }}>
              <div
                style={{
                  fontFamily: "Cinzel",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#f0ead6",
                  letterSpacing: "2px",
                  marginBottom: "7px",
                }}
              >
                PASSKEY RECOVERY
              </div>
              <div
                style={{
                  fontFamily: "Exo 2,sans-serif",
                  fontSize: "12px",
                  color: "rgba(212,175,55,.38)",
                  marginBottom: "24px",
                }}
              >
                Enter your registered service email to receive a one-time
                recovery code.
              </div>
              {forgotSent ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "22px",
                    background: "rgba(78,205,196,.05)",
                    border: "1px solid rgba(78,205,196,.18)",
                    borderRadius: "4px",
                    animation: "successPop .5s ease both",
                  }}
                >
                  <div style={{ fontSize: "34px", marginBottom: "10px" }}>
                    ✅
                  </div>
                  <div
                    style={{
                      fontFamily: "Cinzel",
                      fontSize: "13px",
                      color: "#4ecdc4",
                      letterSpacing: "2px",
                    }}
                  >
                    OTP DISPATCHED
                  </div>
                  <div
                    style={{
                      fontFamily: "Exo 2,sans-serif",
                      fontSize: "11px",
                      color: "rgba(78,205,196,.42)",
                      marginTop: "5px",
                    }}
                  >
                    Check your registered email / mobile
                  </div>
                </div>
              ) : (
                <>
                  <input
                    className="inp"
                    type="email"
                    placeholder="service.id@crpf.gov.in"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    style={{
                      fontFamily: "Share Tech Mono",
                      padding: "12px 14px",
                      marginBottom: "16px",
                    }}
                  />
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleForgot}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "linear-gradient(135deg,#b8921e,#d4af37)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontFamily: "Cinzel",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#0b1a14",
                        letterSpacing: "2px",
                      }}
                    >
                      SEND OTP
                    </button>
                    <button
                      onClick={() => setForgotOpen(false)}
                      style={{
                        padding: "12px 20px",
                        background: "transparent",
                        border: "1px solid rgba(212,175,55,.14)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontFamily: "Exo 2,sans-serif",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "rgba(212,175,55,.32)",
                        letterSpacing: "1px",
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom status bar ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(6,14,10,.97)",
          borderTop: "1px solid rgba(212,175,55,.07)",
          padding: "7px 36px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "28px" }}>
          {[
            { color: "#4ecdc4", label: "DB: PostgreSQL Online" },
            { color: "#a8e6cf", label: "PaddleOCR: Standby" },
            { color: "#d4af37", label: "Eval Engine: Ready" },
          ].map((s, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: "7px" }}
            >
              <div
                className="sdot"
                style={{
                  background: s.color,
                  boxShadow: `0 0 5px ${s.color}`,
                  animationDelay: `${i * 0.35}s`,
                }}
              />
              <span
                style={{
                  fontFamily: "Share Tech Mono",
                  fontSize: "9px",
                  color: "rgba(212,175,55,.18)",
                  letterSpacing: "1px",
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <span
          style={{
            fontFamily: "Share Tech Mono",
            fontSize: "9px",
            color: "rgba(212,175,55,.15)",
            letterSpacing: "1px",
          }}
        >
          SESSION TIMEOUT: 15:00 · v2.4.1
        </span>
      </div>

      {/* Screen corner frames */}
      {[
        {
          top: 0,
          left: 0,
          borderTop: "1px solid rgba(212,175,55,.2)",
          borderLeft: "1px solid rgba(212,175,55,.2)",
        },
        {
          top: 0,
          right: 0,
          borderTop: "1px solid rgba(212,175,55,.2)",
          borderRight: "1px solid rgba(212,175,55,.2)",
        },
        {
          bottom: 0,
          left: 0,
          borderBottom: "1px solid rgba(212,175,55,.1)",
          borderLeft: "1px solid rgba(212,175,55,.1)",
        },
        {
          bottom: 0,
          right: 0,
          borderBottom: "1px solid rgba(212,175,55,.1)",
          borderRight: "1px solid rgba(212,175,55,.1)",
        },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            ...s,
            width: "50px",
            height: "50px",
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
