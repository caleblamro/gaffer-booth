import type { ReactNode } from "react";
import { Brand } from "./Brand";

export type Page = "live" | "rundown" | "verify" | "stats" | "crew" | "recap";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "live", label: "Live broadcast", icon: "●" },
  { id: "rundown", label: "Rundown", icon: "≡" },
  { id: "verify", label: "Verification log", icon: "✓" },
  { id: "stats", label: "Match stats", icon: "∿" },
  { id: "crew", label: "Crew", icon: "⚙" },
  { id: "recap", label: "Full-time recap", icon: "◷" },
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
                <i aria-hidden="true">{n.icon}</i>
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
