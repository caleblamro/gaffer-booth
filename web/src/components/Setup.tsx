import type { Scenario } from "../types";
import { Pulse, Wordmark } from "./Brand";

export const LANGS: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
];
export const SPEEDS = [10, 20, 40, 80];
const STARTS = [0, 30, 55, 70];

// Club colours mirror booth/sim/teams.py so the fixture list can show kits before kick-off.
const KIT: Record<string, { c: string; alt: string }> = {
  "Harbour City": { c: "#1e6fd9", alt: "#ffffff" },
  "Kingsmoor Athletic": { c: "#d92b3a", alt: "#ffffff" },
  "Ravenshollow FC": { c: "#222831", alt: "#f5c518" },
  "Westbridge Rovers": { c: "#0f9d58", alt: "#ffffff" },
};

// Scenario titles are just the fixture, so the storyline label comes from the id.
const storyline = (id: string) => (id === "classic" ? "Open game" : id.charAt(0).toUpperCase() + id.slice(1).replaceAll("_", " "));

const CREW = [
  ["Director", "decides what airs"],
  ["Analyst", "explains why"],
  ["Verifier", "checks every claim"],
  ["Graphics", "builds the overlay"],
  ["Commentator", "voices it live"],
];

interface SetupProps {
  scenarios: Scenario[];
  scenario: string;
  setScenario: (id: string) => void;
  speed: number;
  setSpeed: (v: number) => void;
  startMin: number;
  setStartMin: (v: number) => void;
  langs: string[];
  toggleLang: (id: string) => void;
  onGo: () => void;
  error: boolean;
}

function Club({ name }: { name: string }) {
  const k = KIT[name] ?? { c: "var(--fg-3)", alt: "transparent" };
  return (
    <span>
      <i style={{ background: k.c, boxShadow: `inset 0 0 0 1px ${k.alt === "#ffffff" ? "transparent" : k.alt}` }} />
      {name}
    </span>
  );
}

export function Setup(p: SetupProps) {
  const minutes = (90 * 60) / p.speed / 60;
  return (
    <div className="screen">
      <header className="top">
        <Wordmark />
      </header>
      <div className="setup">
        <section className="setup-main">
          <div className="intro">
            <span className="eyebrow">Choose a match</span>
            <h1 className="d">
              Pick the story.
              <br />
              The crew calls it.
            </h1>
            <p>Five agents watch a live feed, decide what matters, prove every number against the data and put it on air as graphics and commentary.</p>
          </div>
          <div className="fixtures" role="radiogroup" aria-label="Match">
            {p.scenarios.length === 0 && <p className="empty">Loading fixtures from the match engine…</p>}
            {p.scenarios.map((s, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={p.scenario === s.id}
                key={s.id}
                className={`fx${p.scenario === s.id ? " on" : ""}`}
                onClick={() => p.setScenario(s.id)}
              >
                <span className="no">0{i + 1}</span>
                <span className="teams">
                  <Club name={s.home} />
                  <span className="v">v</span>
                  <Club name={s.away} />
                </span>
                <span className="story">
                  <b>{storyline(s.id)}</b>
                  <span>{s.blurb}</span>
                </span>
                <span className="radio" />
              </button>
            ))}
          </div>
        </section>
        <aside className="setup-side">
          <div className="field">
            <span className="eyebrow">Match speed</span>
            <div className="seg full">
              {SPEEDS.map((v) => (
                <button type="button" key={v} className={p.speed === v ? "on" : ""} onClick={() => p.setSpeed(v)}>
                  {v}×
                </button>
              ))}
            </div>
            <span className="hint">90 minutes in about {minutes >= 2 ? `${Math.round(minutes * 2) / 2} min` : `${Math.round(minutes * 60)} s`}.</span>
          </div>
          <div className="field">
            <span className="eyebrow">Join from</span>
            <div className="seg full">
              {STARTS.map((v) => (
                <button type="button" key={v} className={p.startMin === v ? "on" : ""} onClick={() => p.setStartMin(v)}>
                  {v === 0 ? "Kick-off" : `${v}'`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="eyebrow">Commentary, up to 3</span>
            <div className="seg full">
              {LANGS.map((l) => (
                <button type="button" key={l.id} className={p.langs.includes(l.id) ? "on" : ""} onClick={() => p.toggleLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="eyebrow">On the crew</span>
            <div className="crewmini">
              {CREW.map(([n, r], i) => (
                <div key={n}>
                  <span className="mono">0{i + 1}</span>
                  <span>
                    <b>{n}</b>
                    {r}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="go">
            {p.error && <p className="err">Couldn't reach the broadcast server. Check the API is running on port 8000, then try again.</p>}
            <button type="button" className="btn primary" onClick={p.onGo} disabled={p.scenarios.length === 0}>
              Go live
            </button>
            <p>All clubs, players and match data are synthetic.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Warming({ fixture, speed, startMin, onCancel }: { fixture: string; speed: number; startMin: number; onCancel: () => void }) {
  return (
    <div className="screen">
      <header className="top">
        <Wordmark />
        <span className="sep" />
        <span className="fixture">{fixture}</span>
        <span className="tally off">Standby</span>
      </header>
      <div className="warming">
        <div className="card">
          <span className="eyebrow">
            Going live {startMin === 0 ? "at kick-off" : `from ${startMin}'`} · {speed}×
          </span>
          <h1 className="d">Warming up the crew</h1>
          <p>Seeding the storyline and connecting each agent. If a model misses the broadcast deadline, its template tier takes over.</p>
          <div className="rows">
            {CREW.map(([n, r], i) => (
              <div className="row" key={n}>
                <span className="mono">0{i + 1}</span>
                <div>
                  <b>{n}</b>
                  <small>{r}</small>
                </div>
                <span className="tag idle">
                  <Pulse />
                  Connecting
                </span>
              </div>
            ))}
          </div>
          <div className="bar">
            <i />
          </div>
          <div className="foot">
            <span>The match starts as soon as the engine sends the line-ups.</span>
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
