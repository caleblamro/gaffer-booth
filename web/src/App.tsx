import { useCallback, useEffect, useMemo, useState } from "react";
import { Wordmark } from "./components/Brand";
import { Captions, FactInspector, OverlayLayer, ScoreBug } from "./components/Broadcast";
import { useTweenedFrame } from "./components/CameraView";
import { CameraSwitcher, Multiview, Shot, useCameraKeys } from "./components/Cameras";
import { Momentum, StatBars } from "./components/Charts";
import { ControlRoom } from "./components/ControlRoom";
import { FullTime } from "./components/FullTime";
import { SPEEDS, Setup, Warming } from "./components/Setup";
import { frameAt, type Frame } from "./lib/positions";
import type { InitMsg, MatchEvent, Scenario, Segment, Side } from "./types";
import { useBroadcast, type BroadcastOptions, type BroadcastState } from "./useBroadcast";
import { useDirector, type Direction } from "./useDirector";

export default function App() {
  const { state, start, togglePause, setSpeed, talkback, reset } = useBroadcast();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("comeback");
  const [speed, setSpeedLocal] = useState(20);
  const [startMin, setStartMin] = useState(0);
  const [langs, setLangs] = useState<string[]>(["en", "es"]);
  const [lang, setLang] = useState("en");
  const [last, setLast] = useState<BroadcastOptions | null>(null);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  const go = (o: BroadcastOptions) => {
    if (!o.langs.includes(lang)) setLang(o.langs[0]);
    setLast(o);
    start(o);
  };
  const fixture = scenarios.find((s) => s.id === scenario);

  if (state.status === "connecting" || (state.status === "live" && !state.init)) {
    return <Warming fixture={fixture ? `${fixture.home} v ${fixture.away}` : "Match"} speed={speed} startMin={startMin} onCancel={reset} />;
  }

  if (!state.init) {
    return (
      <Setup
        scenarios={scenarios}
        scenario={scenario}
        setScenario={setScenario}
        speed={speed}
        setSpeed={setSpeedLocal}
        startMin={startMin}
        setStartMin={setStartMin}
        langs={langs}
        toggleLang={(id) =>
          setLangs((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id].slice(-3)))
        }
        onGo={() => go({ scenario, speed, start: startMin, langs })}
        error={state.status === "error"}
      />
    );
  }

  if (state.status === "ended") {
    return (
      <FullTime
        init={state.init}
        lang={lang}
        setLang={setLang}
        onAgain={() => last && go({ ...last, start: 0, seed: state.init?.seed })}
        onNew={reset}
      />
    );
  }

  return (
    <Live
      state={state}
      init={state.init}
      speed={speed}
      setSpeed={(v) => {
        setSpeedLocal(v);
        setSpeed(v);
      }}
      lang={lang}
      setLang={setLang}
      togglePause={togglePause}
      onTalkback={talkback}
      onEnd={reset}
    />
  );
}

interface LiveProps {
  state: BroadcastState;
  init: InitMsg;
  speed: number;
  setSpeed: (v: number) => void;
  lang: string;
  setLang: (l: string) => void;
  togglePause: () => void;
  onTalkback: (text: string) => void;
  onEnd: () => void;
}

function Live({ state, init, speed, setSpeed, lang, setLang, togglePause, onTalkback, onEnd }: LiveProps) {
  const [voice, setVoice] = useState(false);
  const [view, setView] = useState<"program" | "multi">("program");
  const [inspect, setInspect] = useState<Segment | null>(null);
  const colors = useMemo(() => ({ home: init.lineups.home.color, away: init.lineups.away.color }), [init]);
  const lastEvent = state.events[state.events.length - 1];
  const frame = useMemo(() => frameAt(init, lastEvent, state.offPitch, state.onPitch), [init, lastEvent, state.offPitch, state.onPitch]);
  const dir = useDirector(init, state.events, state.segments, frame, state.offPitch, state.onPitch);
  useCameraKeys(dir, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  const closeInspector = useCallback(() => setInspect(null), []);
  const live = state.status === "live";

  return (
    <div className="screen live-screen">
      <header className="top">
        <Wordmark />
        <span className="sep" />
        <span className="fixture">
          {init.lineups.home.name} v {init.lineups.away.name}
        </span>
        {state.paused ? <span className="tally off">Paused</span> : <span className="tally">On air</span>}
        <div className="right">
          <div className="seg">
            <button type="button" className={view === "program" ? "on" : ""} onClick={() => setView("program")}>
              Program
            </button>
            <button type="button" className={view === "multi" ? "on" : ""} onClick={() => setView("multi")}>
              Multiview
            </button>
          </div>
          <button type="button" className="btn" onClick={togglePause} disabled={!live}>
            {state.paused ? "Resume" : "Pause"} <span className="kbd">Space</span>
          </button>
          <div className="seg">
            {SPEEDS.slice(1).map((v) => (
              <button type="button" key={v} className={speed === v ? "on" : ""} onClick={() => setSpeed(v)} disabled={!live}>
                {v}×
              </button>
            ))}
          </div>
          <div className="seg">
            {init.langs.map((l) => (
              <button type="button" key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className={`btn${voice ? " on" : ""}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
            Voice {voice ? "on" : "off"}
          </button>
          <button type="button" className="btn ghost" onClick={onEnd}>
            End match
          </button>
        </div>
      </header>
      {view === "multi" ? (
        <main className="stage multi">
          <Multiview frame={frame} dir={dir} colors={colors} events={state.events} speed={speed} />
          <div className="mv-bar">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className="kbd">
                {n}
              </span>
            ))}
            <span className="note">Press a number to cut. A manual cut puts the Director on manual until you press A.</span>
            <button type="button" className="btn" onClick={dir.take}>
              Cut to preview <span className="kbd">Enter</span>
            </button>
          </div>
        </main>
      ) : (
        <main className="stage">
          <section className="prog">
            <Program
              frame={frame}
              dir={dir}
              colors={colors}
              events={state.events}
              speed={speed}
              init={init}
              state={state}
              lang={lang}
              voice={voice}
              onInspect={setInspect}
            />
            <CameraSwitcher frame={frame} dir={dir} colors={colors} events={state.events} speed={speed} />
            <div className="panel strip">
              <section>
                <div className="hd">
                  <span className="eyebrow">Momentum</span>
                  <span className="key">
                    <span>
                      <i style={{ background: colors.home }} />
                      {init.lineups.home.short}
                    </span>
                    <span>
                      <i style={{ background: colors.away }} />
                      {init.lineups.away.short}
                    </span>
                  </span>
                </div>
                <Momentum series={state.momentum} init={init} />
              </section>
              <section>
                <div className="hd">
                  <span className="eyebrow">Match stats</span>
                  <span className="mono faint">
                    {init.lineups.home.short} · {init.lineups.away.short}
                  </span>
                </div>
                <StatBars stats={state.stats} init={init} />
              </section>
            </div>
          </section>
          <ControlRoom
            init={init}
            lines={state.console}
            moments={state.moments}
            queueIds={state.queueIds}
            segments={state.segments}
            events={state.events}
            paused={state.paused}
            live={live}
            onTalkback={onTalkback}
          />
        </main>
      )}
      {inspect && <FactInspector seg={inspect} onClose={closeInspector} />}
    </div>
  );
}

interface ProgramProps {
  frame: Frame;
  dir: Direction;
  colors: Record<Side, string>;
  events: MatchEvent[];
  speed: number;
  init: InitMsg;
  state: BroadcastState;
  lang: string;
  voice: boolean;
  onInspect: (seg: Segment) => void;
}

/** The program monitor. It owns the tween so per-frame renders stay inside this subtree. */
function Program({ frame, dir, colors, events, speed, init, state, lang, voice, onInspect }: ProgramProps) {
  const ms = Math.max(250, Math.min(900, 2600 / Math.sqrt(speed)));
  const target = dir.replay?.frame ?? frame;
  const shown = useTweenedFrame(target, dir.replay ? 600 : ms);
  return (
    <div className="monitor">
      <Shot cam={dir.program} frame={shown} dir={dir} colors={colors} events={events} speed={speed} />
      <ScoreBug init={init} score={state.score} />
      {dir.replay ? (
        <span className="replay">
          <i />
          Replay · {dir.replay.clock}
        </span>
      ) : (
        <span className="wm">SYNTHETIC DATA · RENDERED</span>
      )}
      {!dir.replay && <OverlayLayer seg={dir.onAir} onInspect={onInspect} />}
      <Captions segments={state.segments} lang={lang} voice={voice} />
      {state.paused && (
        <div className="slate">
          <div>
            <span className="eyebrow">Broadcast paused at {state.score.clock}</span>
            <span className="d">Hold</span>
            <span className="dim">The match clock and the crew are frozen. Nothing airs until you resume.</span>
          </div>
        </div>
      )}
    </div>
  );
}
