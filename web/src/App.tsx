import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Captions, FactSheet, Feed, OverlayLayer, ScoreBug, useCaptionVisible } from "./components/Broadcast";
import { useTweenedFrame } from "./components/CameraView";
import { CameraTabs, Multiview, Shot, useCameraKeys } from "./components/Cameras";
import { Momentum, StatBars } from "./components/Charts";
import { CrewCard, OnAirCard, RundownTable, TalkbackCard, UpNext, VerifyLog, buildRundown, type RundownRow } from "./components/ControlRoom";
import { Recap } from "./components/FullTime";
import { SPEEDS, Setup, Warming } from "./components/Setup";
import { Shell, type Page } from "./components/Shell";
import { PICTURE_KITS, storyline } from "./lib/labels";
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
      <Ended
        state={state}
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

function LangSeg({ init, lang, setLang }: { init: InitMsg; lang: string; setLang: (l: string) => void }) {
  return (
    <div className="segctl" role="group" aria-label="Commentary language">
      {init.langs.map((l) => (
        <button type="button" key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const crumbOf = (init: InitMsg) => `${storyline(init.scenario_id)} scenario · seed ${init.seed}`;

/** The rundown, verification, stats and crew sections, shared by the live and full-time screens. */
function Section({ page, state, init, rows, onOpen }: { page: Page; state: BroadcastState; init: InitMsg; rows: RundownRow[]; onOpen: (s: Segment) => void }) {
  const titles: Partial<Record<Page, string>> = { rundown: "Rundown", verify: "Verification log", stats: "Match stats", crew: "Crew" };
  const aired = rows.filter((r) => r.seg).length;
  return (
    <>
      <div className="title-row">
        <div>
          <div className="crumb">
            {init.lineups.home.name} {state.score.home}–{state.score.away} {init.lineups.away.name} · {state.score.clock}
          </div>
          <h1>{titles[page]}</h1>
        </div>
        {page === "rundown" && (
          <span className="muted sm">
            {rows.length} in rundown · {aired} aired · {state.queueIds.length} queued
          </span>
        )}
      </div>
      {page === "rundown" && (
        <div className="two wide-l">
          <section className="card">
            <RundownTable rows={rows} onOpen={onOpen} />
          </section>
          <div className="col">
            <UpNext moments={state.moments} queueIds={state.queueIds} init={init} />
            <section className="card">
              <div className="card-h">
                <h2>Match feed</h2>
              </div>
              <Feed events={state.events} />
            </section>
          </div>
        </div>
      )}
      {page === "verify" && <VerifyLog rows={rows} lines={state.console} onOpen={onOpen} />}
      {page === "stats" && (
        <div className="col">
          <section className="card">
            <div className="card-h">
              <h2>Momentum</h2>
              <span className="legend">
                <span>
                  <i className="dot h" />
                  {init.lineups.home.name}
                </span>
                <span>
                  <i className="dot a" />
                  {init.lineups.away.name}
                </span>
              </span>
            </div>
            <div className="card-b">
              <Momentum series={state.momentum} height={140} />
            </div>
          </section>
          <section className="card">
            <div className="card-h">
              <h2>Match stats</h2>
              <span className="muted sm">
                {init.lineups.home.short} · {init.lineups.away.short}
              </span>
            </div>
            <div className="card-b">
              <StatBars stats={state.stats} />
            </div>
          </section>
        </div>
      )}
      {page === "crew" && <CrewCard lines={state.console} paused={state.paused} mode={init.mode} />}
    </>
  );
}

interface EndedProps {
  state: BroadcastState;
  init: InitMsg;
  lang: string;
  setLang: (l: string) => void;
  onAgain: () => void;
  onNew: () => void;
}

function Ended({ state, init, lang, setLang, onAgain, onNew }: EndedProps) {
  const [page, setPage] = useState<Page>("recap");
  const [inspect, setInspect] = useState<Segment | null>(null);
  const closeInspector = useCallback(() => setInspect(null), []);
  const rows = useMemo(() => buildRundown(state.moments, state.console, state.queueIds, state.segments, null), [state]);
  return (
    <Shell
      page={page}
      setPage={setPage}
      disabled={{ live: "The broadcast has ended" }}
      counts={{ rundown: rows.length }}
      mode={init.mode}
      bar={
        <>
          <span className="bar-note">
            Broadcast ended at {state.score.clock} · {state.segments.length} segments aired
          </span>
          <div className="bar-r">
            <LangSeg init={init} lang={lang} setLang={setLang} />
            <button type="button" className="btn" onClick={onAgain}>
              Watch again
            </button>
            <button type="button" className="btn primary" onClick={onNew}>
              New broadcast
            </button>
          </div>
        </>
      }
    >
      {page === "recap" ? <Recap init={init} lang={lang} /> : <Section page={page} state={state} init={init} rows={rows} onOpen={setInspect} />}
      {inspect && <FactSheet seg={inspect} onClose={closeInspector} />}
    </Shell>
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
  const [page, setPage] = useState<Page>("live");
  const [voice, setVoice] = useState(false);
  const [multi, setMulti] = useState(false);
  const [inspect, setInspect] = useState<Segment | null>(null);
  const [ask, setAsk] = useState("");
  const askRef = useRef<HTMLInputElement>(null);
  const lastEvent = state.events[state.events.length - 1];
  const frame = useMemo(() => frameAt(init, lastEvent, state.offPitch, state.onPitch), [init, lastEvent, state.offPitch, state.onPitch]);
  const dir = useDirector(init, state.events, state.segments, frame, state.offPitch, state.onPitch);
  useCameraKeys(dir, page === "live");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        togglePause();
      } else if (e.key === "/") {
        e.preventDefault();
        askRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  const closeInspector = useCallback(() => setInspect(null), []);
  const live = state.status === "live";
  const rows = useMemo(
    () => buildRundown(state.moments, state.console, state.queueIds, state.segments, dir.onAir),
    [state.moments, state.console, state.queueIds, state.segments, dir.onAir],
  );
  const lastSeg = state.segments[state.segments.length - 1] ?? null;
  const shownSeg = dir.onAir ?? lastSeg;
  const onAirRow = shownSeg ? (rows.find((r) => r.seg === shownSeg) ?? null) : null;

  const sendTalkback = (e: FormEvent) => {
    e.preventDefault();
    const text = ask.trim();
    if (!text) return;
    onTalkback(text);
    setAsk("");
    askRef.current?.blur();
  };

  const bar = (
    <>
      <form className="ask" onSubmit={sendTalkback} role="search">
        <span className="ico" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={askRef}
          type="text"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          placeholder={`Ask the crew… “Give me a stat on ${init.lineups.home.players[9]?.name ?? "a player"}”`}
          aria-label="Talkback to the crew"
          maxLength={200}
          disabled={!live}
        />
        <kbd>/</kbd>
      </form>
      <div className="bar-r">
        <div className="segctl" role="group" aria-label="Match speed">
          {SPEEDS.map((v) => (
            <button type="button" key={v} className={speed === v ? "on" : ""} onClick={() => setSpeed(v)} disabled={!live}>
              {v}×
            </button>
          ))}
        </div>
        <LangSeg init={init} lang={lang} setLang={setLang} />
        <button type="button" className={`btn${voice ? " on" : ""}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
          Voice {voice ? "on" : "off"}
        </button>
        <button type="button" className="btn" onClick={togglePause} disabled={!live} title="Space">
          {state.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="btn primary" onClick={onEnd}>
          End broadcast
        </button>
      </div>
    </>
  );

  return (
    <Shell
      page={page}
      setPage={setPage}
      disabled={{ recap: "Available at full time" }}
      counts={{ rundown: rows.length }}
      mode={init.mode}
      bar={bar}
    >
      {page === "live" ? (
        <>
          <div className="title-row">
            <div>
              <div className="crumb">{crumbOf(init)}</div>
              <h1>
                {init.lineups.home.name}
                <span className="sc">
                  {state.score.home} – {state.score.away}
                </span>
                {init.lineups.away.name}
              </h1>
            </div>
            {state.paused ? (
              <span className="pill neutral">Paused · {state.score.clock}</span>
            ) : dir.replay ? (
              <span className="pill warn">Replay · {dir.replay.clock}</span>
            ) : (
              <span className="pill live">
                <i />
                Live · {state.score.clock}
              </span>
            )}
          </div>
          <div className="grid">
            <section className="card program">
              <div className="pic">
                {multi ? (
                  <Multiview frame={frame} dir={dir} colors={PICTURE_KITS} events={state.events} speed={speed} />
                ) : (
                  <Program frame={frame} dir={dir} events={state.events} speed={speed} init={init} state={state} lang={lang} voice={voice} onInspect={setInspect} />
                )}
              </div>
              <CameraTabs dir={dir} multi={multi} setMulti={setMulti} />
            </section>
            <OnAirCard row={onAirRow} live={dir.onAir !== null} langs={init.langs} onOpen={setInspect} />
            <section className="card rundown">
              <div className="card-h">
                <h2>Rundown</h2>
                <span className="muted sm">
                  {rows.length} in rundown · {rows.filter((r) => r.seg).length} aired · {state.queueIds.length} queued
                </span>
              </div>
              <div className="scroll">
                <RundownTable rows={rows} onOpen={setInspect} limit={12} />
              </div>
            </section>
            <TalkbackCard rows={rows} />
          </div>
        </>
      ) : (
        <Section page={page} state={state} init={init} rows={rows} onOpen={setInspect} />
      )}
      {inspect && <FactSheet seg={inspect} onClose={closeInspector} />}
    </Shell>
  );
}

interface ProgramProps {
  frame: Frame;
  dir: Direction;
  events: MatchEvent[];
  speed: number;
  init: InitMsg;
  state: BroadcastState;
  lang: string;
  voice: boolean;
  onInspect: (seg: Segment) => void;
}

const COLORS: Record<Side, string> = PICTURE_KITS;

/** The program monitor. It owns the tween so per-frame renders stay inside this subtree. */
function Program({ frame, dir, events, speed, init, state, lang, voice, onInspect }: ProgramProps) {
  const ms = Math.max(250, Math.min(900, 2600 / Math.sqrt(speed)));
  const target = dir.replay?.frame ?? frame;
  const shown = useTweenedFrame(target, dir.replay ? 600 : ms);
  const captionOn = useCaptionVisible(state.segments);
  return (
    <div className="monitor">
      <Shot cam={dir.program} frame={shown} dir={dir} colors={COLORS} events={events} speed={speed} />
      <ScoreBug init={init} score={state.score} />
      {dir.replay ? (
        <span className="ov-tag">
          <i />
          Replay · {dir.replay.clock}
        </span>
      ) : (
        <span className="wm">SYNTHETIC DATA · RENDERED</span>
      )}
      {!dir.replay && <OverlayLayer seg={dir.onAir} onInspect={onInspect} raised={captionOn} />}
      <Captions segments={state.segments} lang={lang} voice={voice} visible={captionOn} />
      {state.paused && (
        <div className="slate">
          <div>
            <span className="pill neutral">Paused at {state.score.clock}</span>
            <b>Broadcast on hold</b>
            <span className="muted">The match clock and the crew are frozen. Nothing airs until you resume.</span>
          </div>
        </div>
      )}
    </div>
  );
}
