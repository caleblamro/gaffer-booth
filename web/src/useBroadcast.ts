import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConsoleLine,
  InitMsg,
  MatchEvent,
  Moment,
  Score,
  Segment,
  Side,
  TeamStats,
} from "./types";

export interface BroadcastOptions {
  scenario: string;
  speed: number;
  start: number;
  langs: string[];
  /** Replays a specific match; omitted, the engine searches for a seed that fits the scenario. */
  seed?: number;
}

export interface BroadcastState {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  init: InitMsg | null;
  events: MatchEvent[];
  score: Score;
  stats: Record<Side, TeamStats> | null;
  momentum: [number, number][];
  topPlayers: { id: string; name: string; team: Side; goals: number; xg: number }[];
  moments: Moment[];
  queueIds: number[];
  console: ConsoleLine[];
  segments: Segment[];
  offPitch: Set<string>;
  onPitch: Set<string>;
  paused: boolean;
}

const EMPTY: BroadcastState = {
  status: "idle",
  init: null,
  events: [],
  score: { home: 0, away: 0, clock: "00:00", period: 1 },
  stats: null,
  momentum: [],
  topPlayers: [],
  moments: [],
  queueIds: [],
  console: [],
  segments: [],
  offPitch: new Set(),
  onPitch: new Set(),
  paused: false,
};

function wsUrl(o: BroadcastOptions): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({
    scenario: o.scenario,
    speed: String(o.speed),
    start: String(o.start),
    langs: o.langs.join(","),
  });
  if (o.seed !== undefined) q.set("seed", String(o.seed));
  return `${proto}://${location.host}/ws/broadcast?${q}`;
}

export function useBroadcast() {
  const [state, setState] = useState<BroadcastState>(EMPTY);
  const ws = useRef<WebSocket | null>(null);
  const seq = useRef(0);

  const stop = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  const start = useCallback(
    (o: BroadcastOptions) => {
      stop();
      setState({ ...EMPTY, status: "connecting", offPitch: new Set(), onPitch: new Set() });
      const sock = new WebSocket(wsUrl(o));
      ws.current = sock;
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        setState((s) => reduce(s, msg, seq));
      };
      sock.onerror = () => setState((s) => ({ ...s, status: "error" }));
      sock.onclose = () =>
        setState((s) => (s.status === "live" || s.status === "connecting" ? { ...s, status: "ended" } : s));
    },
    [stop],
  );

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  const togglePause = useCallback(() => {
    setState((s) => {
      send({ cmd: s.paused ? "resume" : "pause" });
      return { ...s, paused: !s.paused };
    });
  }, [send]);

  const setSpeed = useCallback((v: number) => send({ cmd: "speed", value: v }), [send]);

  /** Producer talkback: a free-text request the crew answers on air next. */
  const talkback = useCallback((text: string) => send({ cmd: "talkback", text }), [send]);

  const reset = useCallback(() => {
    stop();
    setState(EMPTY);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { state, start, stop, togglePause, setSpeed, talkback, reset };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduce(s: BroadcastState, msg: any, seq: React.MutableRefObject<number>): BroadcastState {
  switch (msg.type) {
    case "init":
      return { ...s, status: "live", init: msg };
    case "event": {
      const e: MatchEvent = msg.event;
      let { offPitch, onPitch } = s;
      if (e.type === "substitution" && e.detail) {
        offPitch = new Set(offPitch).add(String(e.detail.off_id));
        onPitch = new Set(onPitch).add(String(e.detail.on_id));
      } else if (e.type === "red_card" && e.player_id) {
        offPitch = new Set(offPitch).add(e.player_id);
      }
      const events = s.events.length > 60 ? [...s.events.slice(-40), e] : [...s.events, e];
      return { ...s, events, score: msg.score, offPitch, onPitch };
    }
    case "stats":
      return { ...s, stats: msg.stats, momentum: msg.momentum, topPlayers: msg.top_players };
    case "moment":
      return { ...s, moments: [...s.moments.slice(-30), msg.moment], queueIds: [...s.queueIds, msg.moment.id] };
    case "queue":
      return { ...s, queueIds: msg.ids };
    case "console":
      seq.current += 1;
      return { ...s, console: [...s.console.slice(-200), { ...msg, seq: seq.current }] };
    case "segment":
      return { ...s, segments: [...s.segments, { ...msg, receivedAt: Date.now() }] };
    case "end":
      return { ...s, status: "ended", score: msg.score, stats: msg.stats };
    default:
      return s;
  }
}
