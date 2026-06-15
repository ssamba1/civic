import type { CSSProperties, ReactNode } from "react";

// Ported VERBATIM from Riven primitives/BrowserFrame.jsx. Mac-style chrome shell
// that wraps the ResearchWorkspace mock. emerald→blue swap not needed here (no
// accent colours live in this file). Typed for the Civic TS app.

export default function BrowserFrame({
  url = "civic.app",
  children,
  theme = "light",
  className = "",
  tilt = true,
  label,
  fill = false,
}: {
  url?: string;
  children?: ReactNode;
  theme?: "light" | "dark";
  className?: string;
  tilt?: boolean;
  label?: string;
  fill?: boolean;
}) {
  const dark = theme === "dark";
  const bg = dark ? "#0A0A0B" : "rgb(252 250 246)";
  const chromeBg = dark ? "#0F0F11" : "rgba(0,0,0,0.025)";
  const border = dark ? "rgba(58,58,64,0.7)" : "rgb(227 223 212)";
  const urlPillBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const urlPillBorder = dark ? "rgba(58,58,64,0.6)" : border;
  const urlTextColor = dark ? "rgba(237,237,238,0.5)" : "rgb(74 74 68)";
  const labelColor = dark ? "rgba(237,237,238,0.45)" : "rgb(74 74 68)";

  const tiltStyle: CSSProperties = tilt
    ? {
        transform: "perspective(2200px) rotateX(var(--wl-snippet-tilt, 6deg))",
        transformOrigin: "center top",
      }
    : {};

  const outerStyle: CSSProperties = fill
    ? {
        ...tiltStyle,
        boxShadow: "var(--wl-shadow-lift)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }
    : { ...tiltStyle, boxShadow: "var(--wl-shadow-lift)" };

  const bodyStyle: CSSProperties = {
    background: bg,
    border: `1px solid ${border}`,
    borderTop: "none",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
  };

  return (
    <div className={className} style={outerStyle}>
      <style>{`
        /* Hide the secondary chrome label on narrow viewports so the URL pill stops
           clipping it. Desktop and tablet still show "EDITOR". */
        @media (max-width: 600px) {
          .wl-browserframe-label { display: none !important; }
        }
      `}</style>
      <div
        style={{
          background: chromeBg,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          border: `1px solid ${border}`,
          borderBottom: "none",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex gap-1.5">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#FF5F57",
              }}
            />
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#FEBC2E",
              }}
            />
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#28C840",
              }}
            />
          </div>
          <div className="flex-1 mx-3">
            <div
              className="text-center text-[11px] tracking-wide"
              style={{
                background: urlPillBg,
                color: urlTextColor,
                border: `1px solid ${urlPillBorder}`,
                borderRadius: 6,
                padding: "3px 10px",
                fontFamily: "var(--wl-font-mono)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {url}
            </div>
          </div>
          {label && (
            <span
              className="wl-browserframe-label text-[10px] uppercase tracking-widest"
              style={{ color: labelColor, fontFamily: "var(--wl-font-mono)" }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
