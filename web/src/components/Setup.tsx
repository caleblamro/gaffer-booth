import { storyline } from "../lib/labels";
import type { Scenario } from "../types";
import { Brand, Pulse, ThemeToggle } from "./Brand";

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

/** Touchline markings drawn faintly behind the hero copy. */
function PitchLines() {
  return (
    <svg className="hero-lines" viewBox="0 0 105 68" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="1" y="1" width="103" height="66" />
      <line x1="52.5" y1="1" x2="52.5" y2="67" />
      <circle cx="52.5" cy="34" r="9.15" />
      <rect x="1" y="13.84" width="16.5" height="40.32" />
      <rect x="1" y="24.84" width="5.5" height="18.32" />
      <path d="M17.5 26.7 A9.15 9.15 0 0 1 17.5 41.3" />
      <rect x="87.5" y="13.84" width="16.5" height="40.32" />
      <rect x="98.5" y="24.84" width="5.5" height="18.32" />
      <path d="M87.5 26.7 A9.15 9.15 0 0 0 87.5 41.3" />
    </svg>
  );
}

function Hero({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <div className="hero">
      <header className="hero-top">
        <Brand />
        <nav className="hero-nav">
          {nav && (
            <>
              <a href="/docs" target="_blank" rel="noreferrer">
                API docs
              </a>
              <a href="https://github.com/caleblamro/gaffer-booth" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </>
          )}
          <ThemeToggle />
        </nav>
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
          <PitchLines />
          <span className="eyebrow">Live gallery · synthetic match data</span>
          <h1>
            An AI broadcast crew that <em>proves</em> every number it puts on air.
          </h1>
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
          <div>
            <span className="eyebrow">Run sheet</span>
            <h2>Start a broadcast</h2>
          </div>
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
              <div className="seg full">
                {SPEEDS.map((v) => (
                  <button type="button" key={v} className={p.speed === v ? "on" : ""} onClick={() => p.setSpeed(v)}>
                    {v}×
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="lbl">Join from</span>
              <div className="seg full">
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
            <div className="seg full">
              {LANGS.map((l) => (
                <button type="button" key={l.id} className={p.langs.includes(l.id) ? "on" : ""} onClick={() => p.toggleLang(l.id)} aria-pressed={p.langs.includes(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {p.error && <p className="err">Couldn't reach the broadcast server. Check the API is running on port 8000, then try again.</p>}
          <button type="submit" className="btn go big" disabled={p.scenarios.length === 0}>
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
                <span className="tag">
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
