import type { ReactNode } from "react";
import { Brand, ThemeToggle } from "./Brand";

export type Page = "live" | "rundown" | "verify" | "stats" | "crew" | "recap";

const NAV: { id: Page; label: string }[] = [
  { id: "live", label: "Gallery" },
  { id: "rundown", label: "Rundown" },
  { id: "verify", label: "Fact check" },
  { id: "stats", label: "Stats" },
  { id: "crew", label: "Crew" },
  { id: "recap", label: "Full time" },
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

interface ShellProps {
  page: Page;
  setPage: (p: Page) => void;
  /** Pages that can't be opened right now, with the reason shown as a tooltip. */
  disabled: Partial<Record<Page, string>>;
  counts?: Partial<Record<Page, number>>;
  /** Right-hand controls in the top bar; the theme toggle sits among them. */
  controls: ReactNode;
  actions: ReactNode;
  /** The scorebug strip under the top bar. */
  bug: ReactNode;
  /** The live gallery fills the window; other pages scroll. */
  fill?: boolean;
  children: ReactNode;
}

/** Top bar with section tabs, the scorebug strip and the content area shared by the live and full-time screens. */
export function Shell({ page, setPage, disabled, counts, controls, actions, bug, fill = false, children }: ShellProps) {
  return (
    <div className="app">
      <header className="top">
        <Brand />
        <nav className="tabs" aria-label="Sections">
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
                {n.label}
                {count !== undefined && count > 0 && <span className="n">{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="top-r">
          {controls}
          <ThemeToggle />
          {actions}
        </div>
      </header>
      <div className="bug">{bug}</div>
      <main className={`content${fill ? " fill" : ""}`}>{children}</main>
    </div>
  );
}
