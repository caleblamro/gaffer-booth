import { useEffect, useState } from "react";
import { Captions, Feed, OverlayLayer, ScoreBug, useOnAir } from "./components/Broadcast";
import { Momentum, StatBars } from "./components/Charts";
import { ControlRoom } from "./components/ControlRoom";
import { Pitch } from "./components/Pitch";
import type { Scenario } from "./types";
import { useBroadcast } from "./useBroadcast";

const LANGS: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
];

const SPEEDS = [10, 20, 40, 80];

export default function App() {
  const { state, start, togglePause, setSpeed, reset } = useBroadcast();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("comeback");
  const [speed, setSpeedLocal] = useState(20);
  const [startMin, setStartMin] = useState(0);
  const [langs, setLangs] = useState<string[]>(["en", "es"]);
  const [lang, setLang] = useState("en");
  const [voice, setVoice] = useState(false);
  const onAir = useOnAir(state.segments);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  const go = () => {
    if (!langs.includes(lang)) setLang(langs[0]);
    start({ scenario, speed, start: startMin, langs });
  };

  if (!state.init) {
    return (
      <div className="setup">
        <div className="brand">
          <span className="logo-dot" />
          <h1>
            GAFFER <em>BOOTH</em>
          </h1>
          <p>An AI broadcast crew that watches the match, decides what matters, proves every number, and puts it on air.</p>
        </div>
        <section className="scenarios">
          {scenarios.map((s) => (
            <button
              key={s.id}
              className={`scenario${scenario === s.id ? " sel" : ""}`}
              onClick={() => setScenario(s.id)}
            >
              <strong>
                {s.home} <i>vs</i> {s.away}
              </strong>
              <span>{s.blurb}</span>
            </button>
          ))}
        </section>
        <section className="opts">
          <label>
            Speed
            <div className="seg">
              {SPEEDS.map((v) => (
                <button key={v} className={speed === v ? "sel" : ""} onClick={() => setSpeedLocal(v)}>
                  {v}×
                </button>
              ))}
            </div>
          </label>
          <label>
            Join from
            <div className="seg">
              {[0, 30, 55, 70].map((v) => (
                <button key={v} className={startMin === v ? "sel" : ""} onClick={() => setStartMin(v)}>
                  {v === 0 ? "Kick-off" : `${v}'`}
                </button>
              ))}
            </div>
          </label>
          <label>
            Commentary
            <div className="seg">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  className={langs.includes(l.id) ? "sel" : ""}
                  onClick={() =>
                    setLangs((cur) =>
                      cur.includes(l.id) ? (cur.length > 1 ? cur.filter((x) => x !== l.id) : cur) : [...cur, l.id].slice(-3),
                    )
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </label>
        </section>
        <button className="golive" onClick={go} disabled={state.status === "connecting"}>
          {state.status === "connecting" ? "Warming up the crew…" : "● Go live"}
        </button>
        <p className="fine">All clubs, players and match data are synthetic.</p>
      </div>
    );
  }

  const init = state.init;
  return (
    <div className="live">
      <header className="topbar">
        <span className="brand-sm">
          <span className="logo-dot" /> GAFFER <em>BOOTH</em>
        </span>
        <span className="title">{init.scenario}</span>
        <span className={`onair ${state.status === "live" && !state.paused ? "on" : ""}`}>
          {state.status === "ended" ? "FULL TIME" : state.paused ? "PAUSED" : "ON AIR"}
        </span>
        <div className="controls">
          <button onClick={togglePause} disabled={state.status !== "live"}>
            {state.paused ? "▶ Resume" : "❚❚ Pause"}
          </button>
          <select
            defaultValue={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            disabled={state.status !== "live"}
          >
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
          <div className="seg small">
            {init.langs.map((l) => (
              <button key={l} className={lang === l ? "sel" : ""} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className={voice ? "sel" : ""} onClick={() => setVoice((v) => !v)} title="Read commentary aloud">
            {voice ? "🔊 Voice" : "🔈 Voice"}
          </button>
          <button onClick={reset}>New match</button>
        </div>
      </header>
      <main className="stage">
        <section className="program">
          <div className="monitor">
            <Pitch init={init} events={state.events} offPitch={state.offPitch} onPitch={state.onPitch} speed={speed} />
            <ScoreBug init={init} score={state.score} />
            <span className="synthetic">SYNTHETIC DATA</span>
            <OverlayLayer seg={onAir} />
            <Captions segments={state.segments} lang={lang} voice={voice} />
          </div>
          <div className="under">
            <Momentum series={state.momentum} init={init} />
            <div className="under-row">
              <StatBars stats={state.stats} init={init} />
              <Feed events={state.events} init={init} />
            </div>
          </div>
        </section>
        <ControlRoom
          init={init}
          lines={state.console}
          moments={state.moments}
          queueIds={state.queueIds}
          segments={state.segments}
        />
      </main>
    </div>
  );
}
