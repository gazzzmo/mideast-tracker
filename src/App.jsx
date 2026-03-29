import { useState, useEffect, useCallback, useRef } from "react";

// In production this hits the Cloudflare Worker proxy.
// In local dev, Vite proxies /api → localhost:8787 (see vite.config.js).
const API_URL = "/api/chat";

const INDICATORS = [
  { id: "brent_crude", label: "Brent Crude",  unit: "USD/bbl", icon: "🛢️", color: "#f97316", description: "International oil benchmark" },
  { id: "wti_crude",   label: "WTI Crude",    unit: "USD/bbl", icon: "⛽", color: "#fb923c", description: "US oil benchmark" },
  { id: "gold",        label: "Gold",          unit: "USD/oz",  icon: "🥇", color: "#eab308", description: "Safe-haven precious metal" },
  { id: "vix",         label: "VIX",           unit: "pts",     icon: "📈", color: "#ef4444", description: "Fear & volatility index" },
  { id: "us10y",       label: "US 10Y Yield",  unit: "%",       icon: "🏦", color: "#8b5cf6", description: "Flight-to-safety indicator" },
  { id: "sp500",       label: "S&P 500",       unit: "pts",     icon: "📊", color: "#06b6d4", description: "US equity benchmark" },
  { id: "asx200",      label: "ASX 200",       unit: "pts",     icon: "🦘", color: "#10b981", description: "Australian equity market" },
  { id: "audusd",      label: "AUD/USD",       unit: "",        icon: "💱", color: "#3b82f6", description: "Risk-sentiment currency" },
  { id: "eu_gas",      label: "EU Gas (TTF)",  unit: "€/MWh",  icon: "🔥", color: "#f43f5e", description: "European energy benchmark" },
];

async function fetchIndicatorData(indicatorId, label, unit) {
  const userPrompt = `You are a financial data assistant with knowledge of global markets in early 2026, including the US-Israel war on Iran that began around late February 2026 causing Strait of Hormuz disruption and a major energy shock.

Provide plausible historical daily data for: ${label} (unit: ${unit})

YOUR ENTIRE RESPONSE MUST BE ONLY A JSON OBJECT. No markdown. No code fences. No explanation text before or after. Start your response with { and end with }.

Required JSON schema:
{"indicator":"${indicatorId}","label":"${label}","unit":"${unit}","data":[{"date":"2026-02-01","value":75.5,"note":""},{"date":"2026-02-07","value":76.2,"note":"Pre-crisis baseline"}],"summary":"2-3 sentences about key movements and crisis impact.","currentValue":107.0,"crisisImpact":"negative","changeFromPreCrisis":"+35.2% since crisis began"}

Requirements:
- data: 25 entries, dates from 2026-02-01 to 2026-03-28, spaced every few days
- values: realistic numbers for ${label} in ${unit}
- note: empty string "" for normal days; brief text on key crisis dates (Feb 28, Mar 2-3, Mar 20, Mar 26)
- crisisImpact: "negative" if bad for households/economy, "positive" if it benefits (e.g. gold), "neutral" otherwise
- currentValue: the last data point value as a number
- changeFromPreCrisis: string like "+35.2% since crisis began"
- The crisis caused oil to surge from ~$75 to $107+ Brent; VIX from ~16 to 28+; gold rose; AUD/USD fell; ASX fell; S&P fell; EU gas nearly doubled`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: "You are a financial data assistant. Your entire response must be ONLY a valid JSON object with no markdown, no code fences, no preamble, no explanation. Begin your response with { and end with }.",
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 100)}`);
  }

  const apiResponse = await response.json();

  if (!apiResponse.content || apiResponse.content.length === 0) {
    throw new Error("Empty API response");
  }

  const rawText = apiResponse.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No text in response");
  }

  // Strip any accidental markdown fences
  const stripped = rawText
    .replace(/^[\s\S]*?```json\s*/i, "")
    .replace(/^[\s\S]*?```\s*/i, "")
    .replace(/\s*```[\s\S]*$/i, "")
    .trim();

  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON found. Got: "${stripped.slice(0, 80)}"`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}`);
  }

  if (!parsed.data || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    throw new Error("Response missing data array");
  }

  return parsed;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 260, height = 55 }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d.value);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  const toY = v => height - ((v - min) / range) * (height - 6) - 3;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * width},${toY(d.value)}`).join(" ");

  const crisisIdx = data.findIndex(d => d.date >= "2026-02-28");
  const crisisX   = crisisIdx >= 0 ? (crisisIdx / (data.length - 1)) * width : null;
  const lastX     = width;
  const lastY     = toY(values[values.length - 1]);

  return (
    <svg width={width} height={height} style={{ overflow: "visible", display: "block" }}>
      {crisisX !== null && (
        <line x1={crisisX} y1={0} x2={crisisX} y2={height}
          stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
      )}
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={3.5} fill={color} />
    </svg>
  );
}

// ─── IndicatorCard ────────────────────────────────────────────────────────────

function IndicatorCard({ indicator, autoFetch, onFetch }) {
  const [state,    setState]    = useState("idle");
  const [result,   setResult]   = useState(null);
  const [errMsg,   setErrMsg]   = useState("");
  const [expanded, setExpanded] = useState(false);
  const triggered = useRef(false);

  const load = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    setErrMsg("");
    try {
      const d = await fetchIndicatorData(indicator.id, indicator.label, indicator.unit);
      setResult(d);
      setState("done");
      onFetch?.(indicator.id, "done");
    } catch (e) {
      setErrMsg(e.message);
      setState("error");
      onFetch?.(indicator.id, "error");
    }
  }, [indicator, state, onFetch]);

  useEffect(() => {
    if (autoFetch && !triggered.current && state === "idle") {
      triggered.current = true;
      const delay = INDICATORS.findIndex(i => i.id === indicator.id) * 600;
      const t = setTimeout(load, delay);
      return () => clearTimeout(t);
    }
  }, [autoFetch, load, state, indicator.id]);

  const impactColor =
    result?.crisisImpact === "negative" ? "#ef4444" :
    result?.crisisImpact === "positive" ? "#10b981" : "#6b7280";

  const cardStyle = {
    background: "rgba(15,20,35,0.85)",
    border: `1px solid ${state === "done" ? indicator.color + "35" : "rgba(255,255,255,0.07)"}`,
    borderRadius: "12px",
    padding: "18px",
    cursor: state === "done" ? "pointer" : "default",
    boxShadow: state === "done" ? `0 0 18px ${indicator.color}12` : "none",
    transition: "border-color 0.4s, box-shadow 0.4s",
  };

  return (
    <div style={cardStyle} onClick={() => state === "done" && setExpanded(e => !e)}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "20px", marginBottom: "3px" }}>{indicator.icon}</div>
          <div style={{ color: "#e2e8f0", fontFamily: "'DM Mono', monospace", fontSize: "12px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {indicator.label}
          </div>
          <div style={{ color: "#475569", fontSize: "10px", marginTop: "2px" }}>{indicator.description}</div>
        </div>
        {state === "done" && result && (
          <div style={{ textAlign: "right" }}>
            <div style={{ color: indicator.color, fontFamily: "'DM Mono', monospace", fontSize: "18px", fontWeight: 700 }}>
              {typeof result.currentValue === "number"
                ? result.currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : "—"}
              {result.unit === "%" ? "%" : ""}
            </div>
            <div style={{ color: impactColor, fontSize: "10px", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>
              {result.changeFromPreCrisis}
            </div>
          </div>
        )}
      </div>

      {/* States */}
      {state === "idle" && (
        <button
          onClick={e => { e.stopPropagation(); load(); }}
          style={{
            background: `${indicator.color}18`, border: `1px solid ${indicator.color}50`,
            color: indicator.color, borderRadius: "6px", padding: "6px 0",
            fontSize: "11px", fontFamily: "'DM Mono', monospace", cursor: "pointer",
            width: "100%", letterSpacing: "0.08em", fontWeight: 600,
          }}
        >FETCH DATA</button>
      )}

      {state === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{
            width: "11px", height: "11px", borderRadius: "50%",
            border: `2px solid ${indicator.color}`, borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite", flexShrink: 0,
          }} />
          <span style={{ color: "#475569", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>Generating data…</span>
        </div>
      )}

      {state === "error" && (
        <div>
          <div style={{ color: "#f87171", fontSize: "10px", lineHeight: "1.5", marginBottom: "6px", wordBreak: "break-word" }}>
            {errMsg}
          </div>
          <button
            onClick={e => { e.stopPropagation(); triggered.current = false; setState("idle"); setTimeout(load, 0); }}
            style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171", borderRadius: "5px", padding: "4px 10px",
              fontSize: "10px", fontFamily: "'DM Mono', monospace", cursor: "pointer",
            }}
          >↺ Retry</button>
        </div>
      )}

      {state === "done" && result && (
        <>
          <div style={{ marginTop: "8px" }}>
            <Sparkline data={result.data} color={indicator.color} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
              <span style={{ color: "#1e293b", fontSize: "9px", fontFamily: "'DM Mono', monospace" }}>1 Feb</span>
              <span style={{ color: "rgba(239,68,68,0.5)", fontSize: "9px", fontFamily: "'DM Mono', monospace" }}>↑ Crisis onset</span>
              <span style={{ color: "#1e293b", fontSize: "9px", fontFamily: "'DM Mono', monospace" }}>28 Mar</span>
            </div>
          </div>

          {expanded && (
            <div style={{ marginTop: "14px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
              <p style={{ color: "#94a3b8", fontSize: "11px", lineHeight: "1.6", margin: "0 0 10px" }}>
                {result.summary}
              </p>
              <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["DATE", "VALUE", "NOTE"].map(h => (
                        <th key={h} style={{
                          color: "#334155", fontSize: "9px",
                          textAlign: h === "VALUE" ? "right" : "left",
                          padding: "3px 4px", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.data].reverse().map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.025)" }}>
                        <td style={{
                          color: row.date >= "2026-02-28" ? "#fca5a5" : "#475569",
                          fontSize: "10px", padding: "2px 4px", fontFamily: "'DM Mono', monospace",
                        }}>{row.date}</td>
                        <td style={{
                          color: indicator.color, fontSize: "10px", padding: "2px 4px",
                          textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 600,
                        }}>
                          {typeof row.value === "number"
                            ? row.value.toLocaleString(undefined, { maximumFractionDigits: 3 })
                            : row.value}
                        </td>
                        <td style={{ color: "#334155", fontSize: "9px", padding: "2px 4px" }}>
                          {row.note || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ marginTop: "8px", color: "#1e293b", fontSize: "9px", textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
            {expanded ? "▲ collapse" : "▼ expand daily data"}
          </div>
        </>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [autoFetch, setAutoFetch] = useState(false);
  const [counts,    setCounts]    = useState({ done: 0, error: 0 });

  const handleFetch = useCallback((id, status) => {
    setCounts(c => ({ ...c, [status]: (c[status] || 0) + 1 }));
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060d1a",
      backgroundImage:
        "radial-gradient(ellipse at 15% 15%, rgba(249,115,22,0.07) 0%, transparent 55%)," +
        "radial-gradient(ellipse at 85% 85%, rgba(139,92,246,0.07) 0%, transparent 55%)",
      padding: "32px 20px",
      fontFamily: "Georgia, serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Playfair+Display:wght@700;900&display=swap');
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        button:hover       { opacity: 0.85; }
      `}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "36px", animation: "fadeIn 0.5s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
            <div style={{ width: "3px", height: "48px", background: "linear-gradient(to bottom, #f97316, #ef4444)", borderRadius: "2px" }} />
            <div>
              <div style={{ color: "#ef4444", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "4px" }}>
                ● LIVE INTELLIGENCE REPORT
              </div>
              <h1 style={{ color: "#f1f5f9", fontFamily: "'Playfair Display', serif", fontSize: "26px", fontWeight: 900, margin: 0 }}>
                Middle East Crisis
              </h1>
              <h2 style={{ color: "#94a3b8", fontFamily: "'Playfair Display', serif", fontSize: "16px", fontWeight: 400, margin: "3px 0 0", fontStyle: "italic" }}>
                Global Financial Impact Monitor
              </h2>
            </div>
          </div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", paddingLeft: "17px" }}>
            {[
              ["◆", "#f97316", "Coverage: 1 Feb – 28 Mar 2026"],
              ["◆", "#ef4444", "Crisis onset: ~28 Feb 2026"],
              ["◆", "#8b5cf6", `${counts.done}/${INDICATORS.length} loaded`],
            ].map(([sym, col, text], i) => (
              <div key={i} style={{ color: "#475569", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>
                <span style={{ color: col }}>{sym}</span> {text}
              </div>
            ))}
          </div>
        </div>

        {/* ── Alert banner ── */}
        <div style={{
          background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: "8px", padding: "12px 16px", marginBottom: "24px",
          display: "flex", gap: "10px",
        }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <div style={{ color: "#94a3b8", fontSize: "11px", lineHeight: "1.6" }}>
            US-Israel military action on Iran began late February 2026, disrupting the Strait of Hormuz and
            triggering a global energy shock. Data is AI-generated based on known market events from this
            period. The dashed red line on each chart marks crisis onset (~28 Feb). Click any loaded card
            to expand the full daily data table.
          </div>
        </div>

        {/* ── Fetch all button ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
          <button
            onClick={() => setAutoFetch(true)}
            disabled={autoFetch}
            style={{
              background: autoFetch ? "rgba(100,116,139,0.15)" : "linear-gradient(135deg, #f97316, #ef4444)",
              border: "none", color: autoFetch ? "#475569" : "white",
              borderRadius: "8px", padding: "10px 22px",
              fontSize: "11px", fontFamily: "'DM Mono', monospace",
              cursor: autoFetch ? "not-allowed" : "pointer",
              letterSpacing: "0.1em", fontWeight: 600,
            }}
          >
            {autoFetch ? "⟳ LOADING ALL…" : "⚡ FETCH ALL INDICATORS"}
          </button>
        </div>

        {/* ── Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {INDICATORS.map((ind, i) => (
            <div key={ind.id} style={{ animation: `fadeIn 0.4s ease ${i * 0.05}s both` }}>
              <IndicatorCard indicator={ind} autoFetch={autoFetch} onFetch={handleFetch} />
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: "40px", textAlign: "center", color: "#1e293b", fontSize: "10px", fontFamily: "'DM Mono', monospace" }}>
          AI-generated data based on known 2026 market events · Not financial advice · For situational awareness only
        </div>

      </div>
    </div>
  );
}
