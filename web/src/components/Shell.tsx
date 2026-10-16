import type { ReactNode } from "react";
import { Brand, ThemeToggle } from "./Brand";

export type Page = "live" | "rundown" | "verify" | "stats" | "crew" | "recap";

const NAV: { id: Page; label: string; title: string }[] = [
  { id: "live", label: "Live", title: "Live gallery" },
  { id: "rundown", label: "Rundown", title: "Rundown" },
  { id: "verify", label: "Checks", title: "Verification log" },
  { id: "stats", label: "Stats", title: "Match stats" },
  { id: "crew", label: "Crew", title: "Crew" },
  { id: "recap", label: "Full time", title: "Full time" },
];

/** "openai:gpt-x" → model name and provider. */
export function describeMode(mode: string): [string, string] {
  const [kind, ...rest] = mode.split(":");
  const model = rest.join(":");
  switch (kind) {
    case "foundry":
      return [model, "Azure AI Foundry"];
    case "azure-openai":
      return [model, "Azure OpenAI"];
    case "openai":
      return [model, "OpenAI-compatible API"];
    default:
      return ["Template tier", "offline"];
  }
}

/** "67:12" → 67.2, "90+4:30" → 94.5. Null when the clock can't be read. */
export function minuteOf(clock: string): number | null {
  const [mm, ss = "0"] = clock.split(":");
  const [base, extra = "0"] = mm.split("+");
  const v = Number(base) + Number(extra) + Number(ss) / 60;
  return Number.isFinite(v) ? v : null;
}

const RULER_TICKS = Array.from({ length: 37 }, (_, i) => i * 2.5);
const at = (m: number) => `calc(40px + (100% - 80px) * ${Math.min(Math.max(m, 0), 90) / 90})`;

/** The HUD ruler on the right edge is the match clock: a tick every 2.5', labels every 15', the accent line at now. */
export function Ruler({ now, label }: { now: number | null; label?: string }) {
  return (
    <div className="ruler" aria-hidden="true">
      {RULER_TICKS.map((m) => (
        <i key={m} className={`tk${m % 15 === 0 ? " m" : ""}`} style={{ top: at(m) }} />
      ))}
      {RULER_TICKS.filter((m) => m % 15 === 0).map((m) => (
        <span key={m} className="n" style={{ top: at(m) }}>
          {m}
        </span>
      ))}
      {now !== null && (
        <div className="now" style={{ top: at(now) }}>
          {label && <span>{label}</span>}
        </div>
      )}
    </div>
  );
}

/** The 48px top bar: logo cell, mono nav, ruled cells on the right ending in the primary action. */
export function TopBar({ nav, right }: { nav: ReactNode; right: ReactNode }) {
  return (
    <header className="top">
      <Brand />
      <nav className="nav hud" aria-label="Sections">
        {nav}
      </nav>
      <div className="sp" />
      {right}
    </header>
  );
}

/** Content column with its hairline rules, plus the match-clock ruler on the right edge. */
export function Frame({ children, now, label, fill = false }: { children: ReactNode; now: number | null; label?: string; fill?: boolean }) {
  return (
    <div className="frame">
      <div className={`page${fill ? " fill" : ""}`}>{children}</div>
      <Ruler now={now} label={label} />
    </div>
  );
}

interface ShellProps {
  page: Page;
  setPage: (p: Page) => void;
  /** Pages that can't be opened right now, with the reason shown as a tooltip. */
  disabled: Partial<Record<Page, string>>;
  counts?: Partial<Record<Page, number>>;
  /** Ruled cells on the right of the top bar; the theme toggle follows them. */
  controls: ReactNode;
  /** Action cells after the theme toggle; the last one is the primary action. */
  actions: ReactNode;
  /** The title row: scoreline and its meta. */
  title: ReactNode;
  /** Right-hand text of the page strip. */
  meta: string;
  /** Match clock for the ruler. */
  clock: string;
  /** The live gallery fills the window; other pages scroll. */
  fill?: boolean;
  children: ReactNode;
}

/** Top bar, page strip, title row and content shared by the live and full-time screens. */
export function Shell({ page, setPage, disabled, counts, controls, actions, title, meta, clock, fill = false, children }: ShellProps) {
  const idx = NAV.findIndex((n) => n.id === page);
  return (
    <div className="app">
      <TopBar
        nav={NAV.map((n) => {
          const why = disabled[n.id];
          const count = counts?.[n.id];
          return (
            <button
              type="button"
              key={n.id}
              className={page === n.id ? "on" : ""}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => setPage(n.id)}
              disabled={why !== undefined}
              title={why}
            >
              {n.label}
              {count !== undefined && count > 0 && <sup>{count}</sup>}
            </button>
          );
        })}
        right={
          <>
            {controls}
            <ThemeToggle />
            {actions}
          </>
        }
      />
      <Frame now={minuteOf(clock)} label={clock} fill={fill}>
        <div className="strip hud">
          <span>
            {String(idx + 1).padStart(2, "0")} / {NAV[idx].title}
          </span>
          <span className="ell">{meta}</span>
        </div>
        <div className="title">{title}</div>
        <main className="body">{children}</main>
      </Frame>
    </div>
  );
}
