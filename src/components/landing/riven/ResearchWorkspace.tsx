import type { ComponentType, ReactNode } from "react";
import BrowserFrame from "./BrowserFrame";

// Ported VERBATIM from Riven snippets/ResearchWorkspace.jsx. Box/pane/row/badge
// layout, dimensions, and choreography are unchanged. Only VISIBLE strings are
// reworded to Civic (AI-native 311). Accent colours resolve through the CSS var
// swap (--wl-emerald-rgb = Civic blue) already in riven-landing.css.
//
// fill: Riven's fill branch swapped this hand-built mock for a flat editor
// screenshot (/waitlist/screenshots/editor-dark.png). Civic ships no editor
// screenshots, so the fill branch renders the same box layout in fill mode —
// keeping the showcase asset-free and on-brand.

function FileTextIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

function BriefIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 7h4v4H7zM7 11c0 3 2 4 4 4" />
      <path d="M15 7h4v4h-4zM15 11c0 3 2 4 4 4" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

function EvidenceIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 4 7v6c0 4.5 3.5 7.5 8 8 4.5-.5 8-3.5 8-8V7z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function RubricIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 7" />
    </svg>
  );
}

function PilcrowIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 4v16M17 4v16M9 4h8M9 4a5 5 0 0 0 0 10h4" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: "rgb(var(--wl-emerald-rgb) / 0.18)",
        color: "rgb(var(--wl-emerald-rgb))",
        padding: "1px 6px",
        borderRadius: 6,
        fontSize: "0.88em",
        fontWeight: 500,
      }}
      className="wl-citation"
    >
      {children}
    </span>
  );
}

type NavEntry = {
  name: string;
  icon: ComponentType;
  active?: boolean;
  badge?: string;
};

const NAV: NavEntry[] = [
  { name: "Report", icon: FileTextIcon, active: true },
  { name: "Photo evidence", icon: BriefIcon },
  { name: "Duplicates", icon: BookIcon, badge: "5" },
  { name: "Work order", icon: QuoteIcon, badge: "12" },
  { name: "Notes", icon: NoteIcon },
  { name: "Open311 export", icon: EvidenceIcon, badge: "3" },
  { name: "Routing rules", icon: RubricIcon },
];

type TabEntry = { name: string; depth: number; active?: boolean };

const TABS: TabEntry[] = [
  { name: "Pothole · Main St", depth: 0, active: true },
  { name: "Streetlight out", depth: 0 },
  { name: "Open queue", depth: 0 },
  { name: "Sidewalk crack draft", depth: 1 },
  { name: "Drainage notes", depth: 1 },
];

function NavRow({
  name,
  Icon,
  active,
  badge,
}: {
  name: string;
  Icon: ComponentType;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        background: active ? "rgba(237,237,238,0.08)" : "transparent",
        color: active ? "#EDEDEE" : "rgba(237,237,238,0.5)",
        fontFamily: "var(--wl-font-body)",
        fontSize: 13,
        fontWeight: 300,
      }}
    >
      <Icon />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {badge && (
        <span
          style={{
            fontFamily: "var(--wl-font-mono)",
            fontSize: 10,
            color: "rgba(237,237,238,0.4)",
            letterSpacing: "0.04em",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

const CHAT_CHIPS = ["Suggest routing", "Find duplicates"];

function WorkspaceBody({ height }: { height: number | string }) {
  return (
    <div
      style={{
        height,
        display: "flex",
        background: "#0A0A0B",
        color: "#EDEDEE",
        fontFamily: "var(--wl-font-body)",
        minHeight: 0,
      }}
    >
      {/* LEFT sidebar */}
      <div
        style={{
          width: "16%",
          minWidth: 168,
          background: "#0A0A0B",
          borderRight: "1px solid rgba(58,58,64,0.5)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 12px",
            borderBottom: "1px solid rgba(58,58,64,0.5)",
          }}
        >
          <span
            style={{ color: "rgba(237,237,238,0.4)", display: "inline-flex" }}
          >
            <CollapseIcon />
          </span>
        </div>

        <div
          style={{
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {NAV.map((n) => (
            <NavRow
              key={n.name}
              name={n.name}
              Icon={n.icon}
              active={n.active}
              badge={n.badge}
            />
          ))}
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(58,58,64,0.5)",
            margin: "4px 12px",
          }}
        />

        <div
          style={{
            padding: "8px 14px 4px 14px",
            fontFamily: "var(--wl-font-mono)",
            fontSize: 10,
            color: "rgba(237,237,238,0.4)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Queue
        </div>
        <div
          style={{
            padding: "0 8px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            overflow: "hidden",
          }}
        >
          {TABS.map((t) => (
            <div
              key={t.name}
              style={{
                padding: `4px 8px 4px ${10 + t.depth * 12}px`,
                borderRadius: 6,
                background: t.active ? "rgba(237,237,238,0.06)" : "transparent",
                color: t.active ? "#EDEDEE" : "rgba(237,237,238,0.5)",
                fontSize: 12,
                fontWeight: 300,
                fontFamily: "var(--wl-font-body)",
                borderBottom: t.active
                  ? "1px solid rgb(var(--wl-emerald-rgb) / 0.4)"
                  : "1px solid transparent",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.name}
            </div>
          ))}
        </div>
      </div>

      {/* CENTER editor */}
      <div
        style={{
          width: "54%",
          display: "flex",
          flexDirection: "column",
          background: "#0A0A0B",
          minWidth: 0,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid rgba(58,58,64,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: "rgba(237,237,238,0.4)",
                display: "inline-flex",
              }}
            >
              <ChevronLeftIcon />
            </span>
            <span
              style={{
                fontFamily: "var(--wl-font-body)",
                fontSize: 15,
                color: "#EDEDEE",
                fontWeight: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Pothole &mdash; Main St &amp; 3rd
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "rgb(var(--wl-emerald-rgb))",
                fontSize: 12,
                fontFamily: "var(--wl-font-body)",
              }}
            >
              <CheckIcon />
              <span style={{ color: "rgba(237,237,238,0.5)" }}>Routed</span>
            </span>
            <span
              style={{
                fontFamily: "var(--wl-font-mono)",
                fontSize: 11,
                color: "rgba(237,237,238,0.45)",
                letterSpacing: "0.02em",
              }}
            >
              triaged 1.4s
            </span>
            <span
              style={{
                color: "rgba(237,237,238,0.4)",
                display: "inline-flex",
              }}
            >
              <PilcrowIcon />
            </span>
            <span
              style={{
                fontFamily: "var(--wl-font-mono)",
                fontSize: 11,
                color: "rgba(237,237,238,0.45)",
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(237,237,238,0.04)",
                border: "1px solid rgba(58,58,64,0.5)",
                letterSpacing: "0.04em",
              }}
            >
              WO-a4f9b2
            </span>
          </div>
        </div>

        {/* Canvas */}
        <div
          style={{
            flex: 1,
            padding: "36px 0",
            overflow: "hidden",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: 580, padding: "0 36px" }}>
            <h1
              style={{
                fontFamily: "var(--wl-font-body)",
                fontSize: 28,
                fontWeight: 500,
                color: "#EDEDEE",
                margin: "0 0 18px 0",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              Pothole report
            </h1>

            <p
              style={{
                fontFamily: "var(--wl-font-body)",
                fontSize: 13,
                fontWeight: 300,
                color: "#EDEDEE",
                lineHeight: 1.75,
                margin: "0 0 14px 0",
              }}
            >
              A resident photographed a road defect at{" "}
              <Pill>Main St &amp; 3rd</Pill> in Cumming, GA. Civic vision
              classified it as a pothole with high severity and attached the GPS
              fix and capture time automatically <Pill>conf. 0.94</Pill>.
            </p>
            <p
              style={{
                fontFamily: "var(--wl-font-body)",
                fontSize: 13,
                fontWeight: 300,
                color: "#EDEDEE",
                lineHeight: 1.75,
                margin: "0 0 18px 0",
              }}
            >
              The report was deduped against two open tickets within 30m, then
              an Open311 work order was generated for the{" "}
              <Pill>Streets crew</Pill> and dispatched without a single phone
              call.
            </p>

            {/* AI suggestion */}
            <div
              style={{
                border: "1px solid rgba(58,58,64,0.6)",
                background: "rgba(237,237,238,0.02)",
                borderRadius: 8,
                padding: 12,
                maxWidth: 540,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--wl-font-mono)",
                  fontSize: 10,
                  color: "rgb(var(--wl-emerald-rgb))",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                <SparkleIcon />
                Civic suggests
              </div>
              <div
                style={{
                  fontFamily: "var(--wl-font-body)",
                  fontSize: 13,
                  fontWeight: 300,
                  color: "#EDEDEE",
                  lineHeight: 1.55,
                  marginBottom: 10,
                }}
              >
                Merge into the open Main St ticket from yesterday &mdash; same
                30m radius, same crew. One dispatch instead of two.
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgb(var(--wl-emerald-rgb))",
                    fontFamily: "var(--wl-font-body)",
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "3px 8px",
                    cursor: "default",
                  }}
                >
                  Merge
                </button>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(237,237,238,0.5)",
                    fontFamily: "var(--wl-font-body)",
                    fontSize: 12,
                    fontWeight: 300,
                    padding: "3px 8px",
                    cursor: "default",
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT chat panel */}
      <div
        style={{
          width: "30%",
          minWidth: 240,
          background: "#0A0A0B",
          borderLeft: "1px solid rgba(58,58,64,0.5)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            borderBottom: "1px solid rgba(58,58,64,0.5)",
          }}
        >
          <button
            type="button"
            aria-label="History"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              border: "none",
              background: "transparent",
              color: "rgba(237,237,238,0.55)",
              cursor: "default",
            }}
          >
            <HistoryIcon />
          </button>
          <span style={{ fontSize: 13, color: "rgba(237,237,238,0.8)" }}>
            Routing thread
          </span>
          <button
            type="button"
            style={{
              padding: "3px 7px",
              border: "1px solid rgba(58,58,64,0.7)",
              borderRadius: 6,
              background: "transparent",
              color: "rgba(237,237,238,0.55)",
              fontFamily: "var(--wl-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "default",
            }}
          >
            New
          </button>
        </div>

        <div
          style={{
            flex: 1,
            padding: "14px 12px 8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {/* User */}
          <div style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
            <div
              style={{
                background: "rgba(237,237,238,0.08)",
                color: "#EDEDEE",
                padding: "9px 12px",
                borderRadius: 12,
                borderBottomRightRadius: 6,
                fontSize: 12.5,
                lineHeight: 1.5,
                fontWeight: 300,
              }}
            >
              Which crew should this pothole route to?
            </div>
          </div>

          {/* AI */}
          <div style={{ alignSelf: "flex-start", width: "100%" }}>
            <div
              style={{
                fontFamily: "var(--wl-font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgb(var(--wl-emerald-rgb) / 0.8)",
                marginBottom: 5,
              }}
            >
              Routing
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "#EDEDEE",
                fontWeight: 300,
              }}
            >
              Pothole in a paved right-of-way routes to the Streets crew (
              <Pill>dept. PW-Streets</Pill>, SLA 72h). High severity flags it
              for same-week dispatch.
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CHAT_CHIPS.map((c) => (
              <span
                key={c}
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "rgba(237,237,238,0.03)",
                  color: "rgba(237,237,238,0.55)",
                  fontSize: 11.5,
                  fontWeight: 300,
                  border: "1px solid rgba(58,58,64,0.5)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: "8px 12px 12px 12px" }}>
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              background: "rgba(237,237,238,0.04)",
              border: "1px solid rgba(58,58,64,0.5)",
              minHeight: 52,
              padding: "12px 46px 12px 12px",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: "rgba(237,237,238,0.4)",
                fontWeight: 300,
              }}
            >
              Ask anything about this report…
            </div>
            <button
              type="button"
              aria-label="Send"
              style={{
                position: "absolute",
                right: 8,
                bottom: 8,
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "#EDEDEE",
                color: "#0A0A0B",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "default",
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResearchWorkspace({
  expanded = false,
  fill = false,
}: {
  expanded?: boolean;
  fill?: boolean;
}) {
  const height = fill ? "100%" : expanded ? 720 : 600;

  return (
    <div
      role="img"
      aria-label="Mockup of the Civic 311 routing workspace"
      style={
        fill ? { width: "100%", height: "100%", display: "flex" } : undefined
      }
    >
      <BrowserFrame
        url="civic.app/report/cumming-pothole"
        label="EDITOR"
        theme="dark"
        fill={fill}
      >
        <WorkspaceBody height={height} />
      </BrowserFrame>
    </div>
  );
}
