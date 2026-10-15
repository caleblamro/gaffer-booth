import { useCallback, useEffect, useMemo, useState } from "react";
import type { CameraId } from "./lib/camera";
import { frameAt, type Frame } from "./lib/positions";
import type { InitMsg, MatchEvent, Segment, Side } from "./types";

/** How long each graphic slot stays on air, in ms. */
export const HOLD_MS: Record<Segment["slot"], number> = {
  full_screen: 6500,
  stat_card: 8000,
  lower_third: 6000,
  player_card: 7500,
};

const SLOT_CAMERA: Record<Segment["slot"], CameraId> = {
  full_screen: "main",
  stat_card: "tactical",
  player_card: "iso",
  lower_third: "reverse",
};

const REPLAY_STEP_MS = 700;
const REPLAY_EVENTS = 6;

export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

interface Replay {
  events: MatchEvent[];
  startsAt: number;
  side: Side;
  clock: string;
}

export interface Direction {
  program: CameraId;
  preview: CameraId;
  auto: boolean;
  /** Segment currently holding a graphic slot. */
  onAir: Segment | null;
  /** Set while the replay of the last goal is playing; the program shows this frame instead of live. */
  replay: { frame: Frame; clock: string } | null;
  attack: Side;
  focus: [number, number] | null;
  cut: (cam: CameraId) => void;
  take: () => void;
  handBack: () => void;
}

/**
 * The Director's camera choices. In auto mode each graphic slot has a camera, and a goal is followed
 * by a replay from behind the goal. Any manual cut switches to manual until handed back.
 */
export function useDirector(
  init: InitMsg,
  events: MatchEvent[],
  segments: Segment[],
  frame: Frame,
  offPitch: Set<string>,
  onPitch: Set<string>,
): Direction {
  const now = useNow(200);
  const [manual, setManual] = useState<CameraId | null>(null);

  const latest = segments[segments.length - 1] ?? null;
  const onAir = latest && now - latest.receivedAt < (HOLD_MS[latest.slot] ?? 6000) ? latest : null;

  // A goal is followed by a replay of the events leading up to it, once its graphic comes off.
  const goalSeg = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) if (segments[i].moment.kind === "goal") return segments[i];
    return null;
  }, [segments]);
  const replay = useMemo<Replay | null>(() => {
    if (!goalSeg) return null;
    let gi = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "goal" && events[i].clock <= goalSeg.moment.clock) {
        gi = i;
        break;
      }
    }
    if (gi < 0) return null;
    return {
      events: events.slice(Math.max(0, gi - REPLAY_EVENTS + 1), gi + 1),
      startsAt: goalSeg.receivedAt + HOLD_MS.full_screen,
      side: events[gi].team,
      clock: events[gi].clock,
    };
    // Only re-derive when a new goal segment lands; later events must not shift the replay window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalSeg]);

  const replayEnd = replay ? replay.startsAt + replay.events.length * REPLAY_STEP_MS + 900 : 0;
  const replaying = replay !== null && now >= replay.startsAt && now < replayEnd;
  const replayFrame = useMemo(() => {
    if (!replay || !replaying) return null;
    const i = Math.min(replay.events.length - 1, Math.floor((now - replay.startsAt) / REPLAY_STEP_MS));
    return { frame: frameAt(init, replay.events[i], offPitch, onPitch), clock: replay.clock };
  }, [replay, replaying, now, init, offPitch, onPitch]);

  const autoProgram: CameraId = replaying ? "goal" : onAir ? SLOT_CAMERA[onAir.slot] : "main";
  const program = manual ?? autoProgram;

  const attacking = (replaying && replay ? replay.side : frame.possession) as Side;
  const ballP = attacking === "home" ? frame.ball[0] : 105 - frame.ball[0];
  const pendingReplay = replay !== null && now < replay.startsAt;
  const preview: CameraId = pendingReplay ? "goal" : program === "main" ? (ballP > 70 ? "goal" : "tactical") : "main";

  const focusName = onAir?.overlay.player ?? onAir?.moment.player ?? null;
  const focusDot = (focusName && frame.dots.find((d) => d.name === focusName)) || frame.dots.find((d) => d.active) || null;

  const cut = useCallback((cam: CameraId) => setManual(cam), []);
  const take = useCallback(() => setManual(preview), [preview]);
  const handBack = useCallback(() => setManual(null), []);

  return {
    program,
    preview: preview === program ? "tactical" : preview,
    auto: manual === null,
    onAir,
    replay: replayFrame,
    attack: attacking,
    focus: focusDot ? [focusDot.x, focusDot.y] : null,
    cut,
    take,
    handBack,
  };
}
