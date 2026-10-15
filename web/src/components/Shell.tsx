import type { ReactNode } from "react";
import { Brand } from "./Brand";

export type Page = "live" | "rundown" | "verify" | "stats" | "crew" | "recap";

/** 16px stroke icons, drawn in currentColor by the .nav CSS. */
const ICONS: Record<Page, ReactNode> = {
  live: (
    <>
      <circle cx="8" cy="8" r="1.6" />
      <path d="M5 5a4.2 4.2 0 0 0 0 6M11 5a4.2 4.2 0 0 1 0 6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" />
    </>
  ),
  rundown: (
    <>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.5" cy="4" r=".6" />
      <circle cx="2.5" cy="8" r=".6" />
      <circle cx="2.5" cy="12" r=".6" />
    </>
  ),
  verify: (
    <>
      <path d="M8 1.8 13 3.6v4.1c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.6Z" />
      <path d="m5.6 8 1.7 1.7 3.2-3.4" />
    </>
  ),
  stats: <path d="M2.5 13.5h11M4.5 11V8M8 11V4M11.5 11V6.5" />,
  crew: (
    <>
      <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
      <circle cx="11" cy="4.5" r="1.5" />
      <circle cx="5" cy="11.5" r="1.5" />
    </>
  ),
  recap: (
    <>
      <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </>
  ),
};

const NAV: { id: Page; label: string }[] = [
  { id: "live", label: "Live broadcast" },
  { id: "rundown", label: "Rundown" },
  { id: "verify", label: "Verification log" },
  { id: "stats", label: "Match stats" },
  { id: "crew", label: "Crew" },
  { id: "recap", label: "Full-time recap" },
];

/** "openai:gpt-x" → model name and provider for the sidebar card. */
function describeMode(mode: string): [string, string] {
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
      return ["Template tier", "Offline · no model calls"];
  }
}

interface ShellProps {
  page: Page;
  setPage: (p: Page) => void;
  /** Pages that can't be opened right now, with the reason shown as a tooltip. */
  disabled: Partial<Record<Page, string>>;
  counts?: Partial<Record<Page, number>>;
  mode: string;
  bar: ReactNode;
  children: ReactNode;
}

/** Sidebar, top bar and the scrolling content area shared by the live and full-time screens. */
export function Shell({ page, setPage, disabled, counts, mode, bar, children }: ShellProps) {
  const [model, provider] = describeMode(mode);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => {
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
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {ICONS[n.id]}
                </svg>
                {n.label}
                {count !== undefined && count > 0 && <em>{count}</em>}
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="model">
            <span className="k">Model</span>
            <span className="name">{model}</span>
            <span className="muted">{provider}</span>
          </div>
          <span className="testmode">Synthetic data</span>
        </div>
      </aside>
      <div className="main">
        <header className="bar">{bar}</header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
