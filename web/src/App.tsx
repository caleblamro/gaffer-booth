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
    <div className="seg" role="group" aria-label="Commentary language">
      {init.langs.map((l) => (
        <button type="button" key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const crumbOf = (init: InitMsg) => `${storyline(init.scenario_id)} · seed ${init.seed}`;

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface BugProps {
  state: BroadcastState;
  init: InitMsg;
  rows: RundownRow[];
  status: ReactNode;
}

/** The scorebug strip: tally, teams in side colours, score, clock and a few numbers from the engine. */
function Bug({ state, init, rows, status }: BugProps) {
  const st = state.stats;
  const toAir = median(rows.flatMap((r) => (r.toAir === null ? [] : [r.toAir])));
  return (
    <>
      {status}
      <div className="score">
        <span className="kit h" />
        <span className="h">{init.lineups.home.name}</span>
        <span className="n">
          {state.score.home}–{state.score.away}
        </span>
        <span className="a">{init.lineups.away.name}</span>
        <span className="kit a" />
      </div>
      <span className="clock">{state.score.clock}</span>
      <div className="meta">
        <span>{crumbOf(init)}</span>
        {st && (
          <>
            <span>
              xG{" "}
              <b>
                {st.home.xg.toFixed(2)} – {st.away.xg.toFixed(2)}
              </b>
            </span>
            <span>
              Shots{" "}
              <b>
                {st.home.shots} – {st.away.shots}
              </b>
            </span>
          </>
        )}
        {toAir !== null && (
          <span>
            Median to air <b>{toAir < 0.1 ? `${Math.round(toAir * 1000)} ms` : `${toAir.toFixed(1)} s`}</b>
          </span>
        )}
      </div>
    </>
  );
}

const TITLES: Partial<Record<Page, string>> = { rundown: "Rundown", verify: "Fact check", stats: "Match stats", crew: "Crew" };

/** The rundown, fact-check, stats and crew sections, shared by the live and full-time screens. */
function Section({ page, state, init, rows, onOpen }: { page: Page; state: BroadcastState; init: InitMsg; rows: RundownRow[]; onOpen: (s: Segment) => void }) {
  const aired = rows.filter((r) => r.seg).length;
  return (
    <>
      <div className="title-row">
        <div>
          <div className="eyebrow">
            {init.lineups.home.name} {state.score.home}–{state.score.away} {init.lineups.away.name} · {state.score.clock}
          </div>
          <h1>{TITLES[page]}</h1>
        </div>
        {page === "rundown" && (
          <span className="muted sm">
            {rows.length} in rundown · {aired} aired · {state.queueIds.length} queued
          </span>
        )}
      </div>
      {page === "rundown" && (
        <div className="two wide-l">
          <section className="panel">
            <RundownTable rows={rows} onOpen={onOpen} />
          </section>
          <div className="col">
            <UpNext moments={state.moments} queueIds={state.queueIds} init={init} />
            <section className="panel">
              <div className="ph">
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
          <section className="panel">
            <div className="ph">
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
            <div className="pb">
              <Momentum series={state.momentum} height={140} />
            </div>
          </section>
          <section className="panel">
            <div className="ph">
              <h2>Match stats</h2>
              <span className="r">
                {init.lineups.home.short} · {init.lineups.away.short}
              </span>
            </div>
            <div className="pb">
              <StatBars stats={state.stats} />
            </div>
          </section>
        </div>
      )}
      {page === "crew" && <CrewCard lines={state.console} paused={state.paused} mode={init.mode} />}
    </>
  );
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
          <button type="button" className="btn" onClick={onAgain}>
            Watch again
          </button>
          <button type="button" className="btn go" onClick={onNew}>
            New broadcast
          </button>
        </>
      }
      bug={<Bug state={state} init={init} rows={rows} status={<span className="tally off">FULL TIME</span>} />}
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
        setPage("live");
        // The composer mounts with the live page, so focus after it renders.
        requestAnimationFrame(() => askRef.current?.focus());
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
      <div className="seg" role="group" aria-label="Match speed">
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
    </>
  );
  const actions = (
    <>
      <button type="button" className="btn" onClick={togglePause} disabled={!live} title="Space">
        {state.paused ? "Resume" : "Pause"}
      </button>
      <button type="button" className="btn stop" onClick={onEnd}>
        End broadcast
      </button>
    </>
  );
  const status = state.paused ? (
    <span className="tally off">PAUSED</span>
  ) : live ? (
    <span className="tally">
      <i />
      ON AIR
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
      bug={<Bug state={state} init={init} rows={rows} status={status} />}
      fill={page === "live"}
    >
      {page === "live" ? (
        <div className="stage">
          <section className="panel program">
            <div className="pic">
              {multi ? (
                <Multiview frame={frame} dir={dir} colors={PICTURE_KITS} events={state.events} speed={speed} />
              ) : (
                <Program frame={frame} dir={dir} events={state.events} speed={speed} state={state} lang={lang} voice={voice} onInspect={setInspect} />
              )}
            </div>
            <CameraTabs dir={dir} multi={multi} setMulti={setMulti} />
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
        <span className="ov-tag">
          <i />
          Replay · {dir.replay.clock}
        </span>
      ) : (
        <span className="wm">SYNTHETIC DATA · RENDERED</span>
      )}
      {!dir.replay && <OverlayLayer seg={dir.onAir} onInspect={onInspect} />}
      <Captions segments={state.segments} lang={lang} voice={voice} visible={captionOn} />
      {state.paused && (
        <div className="slate">
          <div>
            <span className="eyebrow">Paused at {state.score.clock}</span>
            <b>Broadcast on hold</b>
            <span className="muted">The match clock and the crew are frozen. Nothing airs until you resume.</span>
          </div>
        </div>
      )}
    </div>
  );
}
