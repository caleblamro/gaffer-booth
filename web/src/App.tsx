import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Captions, FactSheet, Feed, OverlayLayer, useCaptionVisible } from "./components/Broadcast";
import { useTweenedFrame } from "./components/CameraView";
import { CameraTabs, Multiview, Shot, useCameraKeys } from "./components/Cameras";
import { Momentum, StatBars } from "./components/Charts";
import { CrewCard, OnAirCard, RundownTable, TalkbackCard, UpNext, VerifyLog, buildRundown, type RundownRow } from "./components/ControlRoom";
import { Recap } from "./components/FullTime";
import { SPEEDS, Setup, Warming } from "./components/Setup";
import { Shell, type Page } from "./components/Shell";
import { PICTURE_KITS, storyline } from "./lib/labels";
import { frameAt, type Frame } from "./lib/positions";
import type { InitMsg, MatchEvent, Scenario, Segment } from "./types";
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
    <div className="cell hud" role="group" aria-label="Commentary language">
      {init.langs.map((l) => (
        <button type="button" key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const metaOf = (init: InitMsg) => `Synthetic match — ${storyline(init.scenario_id)} — seed ${init.seed}`;

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface TitleProps {
  state: BroadcastState;
  init: InitMsg;
  rows: RundownRow[];
  status: ReactNode;
}

/** The title row: kit squares, the scoreline in Archivo, and the tally with a few numbers from the engine. */
function Scoreline({ state, init, rows, status }: TitleProps) {
  const st = state.stats;
  const toAir = median(rows.flatMap((r) => (r.toAir === null ? [] : [r.toAir])));
  const facts = [
    st && `xG ${st.home.xg.toFixed(2)} to ${st.away.xg.toFixed(2)}`,
    st && `shots ${st.home.shots} to ${st.away.shots}`,
    toAir !== null && `median to air ${toAir < 0.1 ? `${Math.round(toAir * 1000)} ms` : `${toAir.toFixed(1)} s`}`,
  ].filter(Boolean);
  return (
    <>
      <h1>
        <span className="k h" aria-hidden="true" />
        {init.lineups.home.name}{" "}
        <span className="sc">
          {state.score.home}–{state.score.away}
        </span>{" "}
        {init.lineups.away.name}
        <span className="k a" aria-hidden="true" />
      </h1>
      <div className="meta">
        {status}
        {facts.length > 0 && <span className="facts">{facts.join(", ")}</span>}
      </div>
    </>
  );
}

/** The rundown, checks, stats and crew pages, shared by the live and full-time screens. */
function Section({ page, state, init, rows, onOpen }: { page: Page; state: BroadcastState; init: InitMsg; rows: RundownRow[]; onOpen: (s: Segment) => void }) {
  const aired = rows.filter((r) => r.seg).length;
  if (page === "rundown")
    return (
      <div className="cells cols-side">
        <section className="c">
          <div className="ch hud">
            <span>Rundown</span>
            <span className="n">
              {rows.length} in rundown / {aired} aired / {state.queueIds.length} queued
            </span>
          </div>
          <RundownTable rows={rows} onOpen={onOpen} />
        </section>
        <div className="stack">
          <UpNext moments={state.moments} queueIds={state.queueIds} init={init} />
          <section className="c">
            <div className="ch hud">
              <span>Match feed</span>
              <span className="n">Latest first</span>
            </div>
            <Feed events={state.events} />
          </section>
        </div>
      </div>
    );
  if (page === "verify") return <VerifyLog rows={rows} lines={state.console} onOpen={onOpen} />;
  if (page === "stats")
    return (
      <div className="cells">
        <section className="c">
          <div className="ch hud">
            <span>Momentum</span>
            <span className="legend">
              <span>
                <i className="dot h" />
                {init.lineups.home.short}
              </span>
              <span>
                <i className="dot a" />
                {init.lineups.away.short}
              </span>
            </span>
          </div>
          <div className="pb">
            <Momentum series={state.momentum} height={180} />
          </div>
        </section>
        <section className="c b">
          <div className="ch hud">
            <span>Match stats</span>
            <span className="n">
              {init.lineups.home.short} / {init.lineups.away.short}
            </span>
          </div>
          <StatBars stats={state.stats} />
        </section>
      </div>
    );
  return <CrewCard lines={state.console} paused={state.paused} mode={init.mode} />;
}

const claimCount = (rows: RundownRow[]) => rows.reduce((n, r) => n + (r.seg?.verification.checked.length ?? 0), 0);

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
      counts={{ rundown: rows.length, verify: claimCount(rows) }}
      controls={<LangSeg init={init} lang={lang} setLang={setLang} />}
      actions={
        <>
          <button type="button" className="tb hud" onClick={onAgain}>
            Watch again
          </button>
          <button type="button" className="tb cta hud" onClick={onNew}>
            New broadcast
          </button>
        </>
      }
      title={
        <Scoreline
          state={state}
          init={init}
          rows={rows}
          status={
            <span className="live hud off">
              <i />
              Full time {state.score.clock}
            </span>
          }
        />
      }
      meta={metaOf(init)}
      clock={state.score.clock}
    >
      {page === "recap" ? <Recap init={init} lang={lang} aired={state.segments.length} /> : <Section page={page} state={state} init={init} rows={rows} onOpen={setInspect} />}
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
        // Focus at once when the composer is already mounted, so the next keystrokes land in it;
        // from another page it mounts with the live page, so focus after that render.
        if (askRef.current) askRef.current.focus();
        else {
          setPage("live");
          requestAnimationFrame(() => askRef.current?.focus());
        }
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
  const names = { home: init.lineups.home.name, away: init.lineups.away.name };

  const controls = (
    <>
      <div className="cell hud" role="group" aria-label="Match speed">
        {SPEEDS.map((v) => (
          <button type="button" key={v} className={speed === v ? "on" : ""} aria-pressed={speed === v} onClick={() => setSpeed(v)} disabled={!live}>
            {v}×
          </button>
        ))}
      </div>
      <LangSeg init={init} lang={lang} setLang={setLang} />
      <div className="cell hud">
        <button type="button" className={voice ? "on" : ""} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
          Voice {voice ? "on" : "off"}
        </button>
      </div>
    </>
  );
  const actions = (
    <>
      <button type="button" className="tb hud" onClick={togglePause} disabled={!live} title="Space">
        {state.paused ? "Resume" : "Pause"}
      </button>
      <button type="button" className="tb cta hud" onClick={onEnd}>
        End broadcast
      </button>
    </>
  );
  const status = state.paused ? (
    <span className="live hud off">
      <i />
      Paused {state.score.clock}
    </span>
  ) : live ? (
    <span className="live hud">
      <i />
      On air {state.score.clock}
    </span>
  ) : null;

  return (
    <Shell
      page={page}
      setPage={setPage}
      disabled={{ recap: "Available at full time" }}
      counts={{ rundown: rows.length, verify: claimCount(rows) }}
      controls={controls}
      actions={actions}
      title={<Scoreline state={state} init={init} rows={rows} status={status} />}
      meta={metaOf(init)}
      clock={state.score.clock}
      fill={page === "live"}
    >
      {page === "live" ? (
        <div className="stage">
          <section className="c program">
            <div className="ch hud">
              <CameraTabs dir={dir} multi={multi} setMulti={setMulti} />
            </div>
            <div className="pic">
              {multi ? (
                <Multiview frame={frame} dir={dir} colors={PICTURE_KITS} events={state.events} speed={speed} />
              ) : (
                <Program frame={frame} dir={dir} events={state.events} speed={speed} state={state} lang={lang} voice={voice} onInspect={setInspect} />
              )}
            </div>
          </section>
          <OnAirCard row={onAirRow} rows={rows} live={dir.onAir !== null} names={names} onOpen={setInspect} />
          <TalkbackCard rows={rows} lines={state.console} init={init} live={live} onAir={dir.onAir !== null} paused={state.paused} inputRef={askRef} onSend={onTalkback} />
        </div>
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
  state: BroadcastState;
  lang: string;
  voice: boolean;
  onInspect: (seg: Segment) => void;
}

/** The program monitor. It owns the tween so per-frame renders stay inside this subtree. */
function Program({ frame, dir, events, speed, state, lang, voice, onInspect }: ProgramProps) {
  const ms = Math.max(250, Math.min(900, 2600 / Math.sqrt(speed)));
  const target = dir.replay?.frame ?? frame;
  const shown = useTweenedFrame(target, dir.replay ? 600 : ms);
  const captionOn = useCaptionVisible(state.segments);
  return (
    <div className={`monitor${captionOn ? " capt" : ""}`}>
      <Shot cam={dir.program} frame={shown} dir={dir} colors={PICTURE_KITS} events={events} speed={speed} />
      {dir.replay ? (
        <span className="ov-tag hud">
          <i />
          Replay {dir.replay.clock}
        </span>
      ) : (
        <span className="wm hud">Synthetic data — rendered</span>
      )}
      {!dir.replay && <OverlayLayer seg={dir.onAir} onInspect={onInspect} />}
      <Captions segments={state.segments} lang={lang} voice={voice} visible={captionOn} />
      {state.paused && (
        <div className="slate">
          <div>
            <span className="hud">Paused at {state.score.clock}</span>
            <b>Broadcast on hold</b>
            <span className="muted">The match clock and the crew are frozen. Nothing airs until you resume.</span>
          </div>
        </div>
      )}
    </div>
  );
}
