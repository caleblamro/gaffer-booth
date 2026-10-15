import { useEffect, useRef } from "react";
import { storyline } from "../lib/labels";
import type { Scenario } from "../types";
import { Brand, Pulse } from "./Brand";

export const LANGS: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
];
export const SPEEDS = [10, 20, 40, 80];
const STARTS = [0, 30, 55, 70];

const CREW = [
  ["Director", "Decides what airs"],
  ["Analyst", "Explains why"],
  ["Verifier", "Checks every claim"],
  ["Graphics", "Builds the overlay"],
  ["Commentator", "Voices it live"],
];

/** A Stripe-like gradient mesh: soft colour blobs blended on a canvas, redrawn on resize. */
function Mesh() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const r = c.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      c.width = r.width * d;
      c.height = r.height * d;
      const g = c.getContext("2d");
      if (!g) return;
      g.scale(d, d);
      g.fillStyle = "#a960ee";
      g.fillRect(0, 0, r.width, r.height);
      const blobs: [number, number, number, string][] = [
        [0.08, 0.9, 0.42, "#ff333d"],
        [0.35, 0.95, 0.38, "#ff8a4d"],
        [0.62, 0.95, 0.4, "#ffcb57"],
        [0.9, 0.85, 0.45, "#90e0ff"],
        [0.75, 0.45, 0.4, "#a960ee"],
      ];
      for (const [x, y, rad, col] of blobs) {
        const gr = g.createRadialGradient(x * r.width, y * r.height, 0, x * r.width, y * r.height, rad * r.width);
        gr.addColorStop(0, col);
        gr.addColorStop(1, `${col}00`);
        g.fillStyle = gr;
        g.fillRect(0, 0, r.width, r.height);
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);
  return (
    <div className="wash" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}

function Hero({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <div className="hero">
      <Mesh />
      <header className="hero-top">
        <Brand onDark />
        {nav && (
          <nav className="hero-nav">
            <a href="/docs" target="_blank" rel="noreferrer">
              API docs
            </a>
            <a href="https://github.com/caleblamro/gaffer-booth" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        )}
      </header>
      {children}
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
  return (
    <Hero>
      <div className="hero-body">
        <div className="lead">
          <h1>An AI broadcast crew that proves every number it puts on air.</h1>
          <p>
            Five agents watch a live match, decide what matters, explain it, check each claim against the data and voice it in up to three languages.
            Built on Microsoft Agent Framework.
          </p>
          <div className="proof-stats">
            <div>
              <b>100%</b>
              <span>of on-air numbers checked</span>
            </div>
            <div>
              <b>5</b>
              <span>agents on the crew</span>
            </div>
            <div>
              <b>3</b>
              <span>languages at once</span>
            </div>
          </div>
        </div>
        <form
          className="start"
          onSubmit={(e) => {
            e.preventDefault();
            p.onGo();
          }}
        >
          <h2>Start a broadcast</h2>
          <div>
            <span className="lbl">Match</span>
            <div className="opts" role="radiogroup" aria-label="Match">
              {p.scenarios.length === 0 && <p className="empty">Loading fixtures from the match engine…</p>}
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
                  <span className="tag">{storyline(s.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="row2">
            <div>
              <span className="lbl">Speed</span>
              <div className="segctl full">
                {SPEEDS.map((v) => (
                  <button type="button" key={v} className={p.speed === v ? "on" : ""} onClick={() => p.setSpeed(v)}>
                    {v}×
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="lbl">Join from</span>
              <div className="segctl full">
                {STARTS.map((v) => (
                  <button type="button" key={v} className={p.startMin === v ? "on" : ""} onClick={() => p.setStartMin(v)}>
                    {v === 0 ? "Kick-off" : `${v}'`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <span className="lbl">
              Commentary languages <em>up to 3</em>
            </span>
            <div className="segctl full">
              {LANGS.map((l) => (
                <button type="button" key={l.id} className={p.langs.includes(l.id) ? "on" : ""} onClick={() => p.toggleLang(l.id)} aria-pressed={p.langs.includes(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {p.error && <p className="err">Couldn't reach the broadcast server. Check the API is running on port 8000, then try again.</p>}
          <button type="submit" className="btn primary go" disabled={p.scenarios.length === 0}>
            Go live
          </button>
          <p className="fine">
            90 minutes in about {minutes >= 2 ? `${Math.round(minutes * 2) / 2} min` : `${Math.round(minutes * 60)} s`}. All clubs, players and match data are synthetic.
          </p>
        </form>
      </div>
    </Hero>
  );
}

export function Warming({ fixture, speed, startMin, onCancel }: { fixture: string; speed: number; startMin: number; onCancel: () => void }) {
  return (
    <Hero nav={false}>
      <div className="warm">
        <div className="start">
          <div>
            <span className="lbl">
              {fixture} · {startMin === 0 ? "from kick-off" : `from ${startMin}'`} · {speed}×
            </span>
            <h2>Warming up the crew</h2>
            <p className="muted">Seeding the storyline and connecting each agent. If a model misses the broadcast deadline, its template tier takes over.</p>
          </div>
          <div className="crew-rows">
            {CREW.map(([n, r]) => (
              <div key={n}>
                <span>
                  <b>{n}</b>
                  <small>{r}</small>
                </span>
                <span className="pill neutral">
                  <Pulse />
                  Connecting
                </span>
              </div>
            ))}
          </div>
          <div className="progress">
            <i />
          </div>
          <div className="warm-foot">
            <span className="muted sm">The match starts as soon as the engine sends the line-ups.</span>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Hero>
  );
}
