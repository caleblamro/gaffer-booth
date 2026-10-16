import type { ReactNode } from "react";
import { storyline } from "../lib/labels";
import type { Scenario } from "../types";
import { Pulse, ThemeToggle } from "./Brand";
import { Frame, TopBar } from "./Shell";

export const LANGS: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
];
export const SPEEDS = [10, 20, 40, 80];
const STARTS = [0, 30, 55, 70];
const MAX_LANGS = 3;

const CREW = [
  ["Director", "Decides what airs"],
  ["Analyst", "Explains why"],
  ["Verifier", "Checks every claim"],
  ["Graphics", "Builds the overlay"],
  ["Commentator", "Voices it live"],
];

const RINGS = [130, 215, 300, 395, 500, 620, 760];

/** The pitch's centre circle, drawn as Artcraft-style concentric rings with ticks, behind the hero. */
function Rings() {
  const ticks = (r: number, n: number, len: number) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      return <line key={`${r}-${i}`} x1={c * r} y1={s * r} x2={c * (r + len)} y2={s * (r + len)} />;
    });
  return (
    <svg className="rings" viewBox="-800 -420 1600 840" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g className="faint">
        <line x1="0" y1="-420" x2="0" y2="420" />
        <rect x="-780" y="-200" width="165" height="400" />
        <rect x="-780" y="-92" width="55" height="184" />
        <rect x="615" y="-200" width="165" height="400" />
        <rect x="725" y="-92" width="55" height="184" />
        <circle r="215" strokeDasharray="3 7" />
      </g>
      {RINGS.map((r) => (
        <circle key={r} r={r} />
      ))}
      <g>{ticks(300, 72, 8)}</g>
      <g>{ticks(500, 96, 10)}</g>
      <path className="arc" d={`M ${395 * Math.cos(2.4)} ${395 * Math.sin(2.4)} A 395 395 0 0 1 ${395 * Math.cos(4.3)} ${395 * Math.sin(4.3)}`} />
      <path className="arc" d={`M ${620 * Math.cos(-0.9)} ${620 * Math.sin(-0.9)} A 620 620 0 0 1 ${620 * Math.cos(0.5)} ${620 * Math.sin(0.5)}`} />
    </svg>
  );
}

function SetupShell({ children, now, label, right }: { children: ReactNode; now: number | null; label?: string; right: ReactNode }) {
  return (
    <div className="app">
      <TopBar
        nav={
          <>
            <span className="on">Broadcast</span>
            <a href="/docs" target="_blank" rel="noreferrer">
              API docs
            </a>
            <a href="https://github.com/caleblamro/gaffer-booth" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </>
        }
        right={
          <>
            <ThemeToggle />
            {right}
          </>
        }
      />
      <Frame now={now} label={label}>
        {children}
      </Frame>
    </div>
  );
}

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

export function Setup(p: SetupProps) {
  const minutes = (90 * 60) / p.speed / 60;
  const runtime = minutes >= 2 ? `${Math.round(minutes * 2) / 2} min` : `${Math.round(minutes * 60)} s`;
  const fixture = p.scenarios.find((s) => s.id === p.scenario);
  const ready = p.scenarios.length > 0;
  return (
    <SetupShell
      now={p.startMin}
      label={p.startMin === 0 ? "KO" : `${p.startMin}'`}
      right={
        <button type="submit" form="run-sheet" className="tb cta hud" disabled={!ready}>
          Go live
        </button>
      }
    >
      <section className="hero">
        <Rings />
        <div className="hero-in">
          <h1 className="wordmark">Gaffer Booth</h1>
          <h2>
            Every number on air, <i className="s">checked.</i>
          </h2>
          <p>
            Five agents watch a live match, decide what matters, explain it, check each claim against the match data and voice it in up to three
            languages.
          </p>
          <div className="ctas">
            <button type="submit" form="run-sheet" className="btn go lg hud" disabled={!ready}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
              </svg>
              Start broadcast
            </button>
            <a className="btn lg hud" href="#run-sheet">
              Run sheet
            </a>
          </div>
          <p className="meta hud">
            Synthetic match data <span>·</span> {CREW.length} agents <span>·</span> Up to {MAX_LANGS} languages <span>·</span> Microsoft Agent Framework
          </p>
        </div>
      </section>
      <form
        id="run-sheet"
        className="run"
        onSubmit={(e) => {
          e.preventDefault();
          p.onGo();
        }}
      >
        <div className="strip hud">
          <span>01 / Run sheet</span>
          <span className="ell">
            {fixture ? `${fixture.home} v ${fixture.away}` : "Loading fixtures"} — {p.speed}× — {p.startMin === 0 ? "from kick-off" : `from ${p.startMin}'`}
          </span>
        </div>
        <div className="cells run-grid">
          <section className="c">
            <div className="ch hud">
              <span>Match</span>
              <span className="n">{String(p.scenarios.length).padStart(2, "0")}</span>
            </div>
            <div className="opts" role="radiogroup" aria-label="Match">
              {!ready && <p className="empty">Loading fixtures from the match engine…</p>}
              {p.scenarios.map((s) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={p.scenario === s.id}
                  key={s.id}
                  className={`opt${p.scenario === s.id ? " on" : ""}`}
                  onClick={() => p.setScenario(s.id)}
                >
                  <span className="rd" />
                  <span>
                    <b>
                      {s.home} v {s.away}
                    </b>
                    <small>{s.blurb}</small>
                  </span>
                  <em className="hud">{storyline(s.id)}</em>
                </button>
              ))}
            </div>
          </section>
          <section className="c">
            <div className="ch hud">
              <span>Speed</span>
              <span className="n">90' in {runtime}</span>
            </div>
            <div className="seg hud" role="group" aria-label="Speed">
              {SPEEDS.map((v) => (
                <button type="button" key={v} className={p.speed === v ? "on" : ""} aria-pressed={p.speed === v} onClick={() => p.setSpeed(v)}>
                  {v}×
                </button>
              ))}
            </div>
            <div className="ch hud b">
              <span>Join from</span>
              <span className="n">Match clock</span>
            </div>
            <div className="seg hud" role="group" aria-label="Join from">
              {STARTS.map((v) => (
                <button type="button" key={v} className={p.startMin === v ? "on" : ""} aria-pressed={p.startMin === v} onClick={() => p.setStartMin(v)}>
                  {v === 0 ? "Kick-off" : `${v}'`}
                </button>
              ))}
            </div>
            <div className="ch hud b">
              <span>Commentary</span>
              <span className="n">Up to {MAX_LANGS}</span>
            </div>
            <div className="seg hud" role="group" aria-label="Commentary languages">
              {LANGS.map((l) => (
                <button type="button" key={l.id} className={p.langs.includes(l.id) ? "on" : ""} onClick={() => p.toggleLang(l.id)} aria-pressed={p.langs.includes(l.id)} aria-label={l.label} title={l.label}>
                  {l.id}
                </button>
              ))}
            </div>
          </section>
          <section className="c go-cell">
            <div className="ch hud">
              <span>Crew</span>
              <span className="n">{String(CREW.length).padStart(2, "0")}</span>
            </div>
            <ul className="crew-list">
              {CREW.map(([n, r]) => (
                <li key={n}>
                  <b>{n}</b>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {p.error && <p className="err">Couldn't reach the broadcast server. Check the API is running on port 8000, then try again.</p>}
            <button type="submit" className="btn go block hud" disabled={!ready}>
              Go live
            </button>
            <p className="fine">All clubs, players and match data are synthetic.</p>
          </section>
        </div>
      </form>
    </SetupShell>
  );
}

export function Warming({ fixture, speed, startMin, onCancel }: { fixture: string; speed: number; startMin: number; onCancel: () => void }) {
  return (
    <SetupShell
      now={startMin}
      label={startMin === 0 ? "KO" : `${startMin}'`}
      right={
        <button type="button" className="tb cta hud" onClick={onCancel}>
          Cancel
        </button>
      }
    >
      <section className="hero warm">
        <Rings />
        <div className="c warm-card">
          <div className="ch hud">
            <span>Warming up</span>
            <span className="n">
              {fixture} — {startMin === 0 ? "from kick-off" : `from ${startMin}'`} — {speed}×
            </span>
          </div>
          <div className="story">
            <h2>
              Warming up the <i className="s">crew.</i>
            </h2>
            <p>Seeding the storyline and connecting each agent. If a model misses the broadcast deadline, its template tier takes over.</p>
          </div>
          <ul className="crew-list">
            {CREW.map(([n, r]) => (
              <li key={n}>
                <b>{n}</b>
                <span>{r}</span>
                <em className="hud">
                  <Pulse />
                  Connecting
                </em>
              </li>
            ))}
          </ul>
          <div className="progress">
            <i />
          </div>
          <div className="warm-foot">
            <span>The match starts as soon as the engine sends the line-ups.</span>
            <button type="button" className="btn hud" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    </SetupShell>
  );
}
