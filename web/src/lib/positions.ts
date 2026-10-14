import type { InitMsg, MatchEvent, PlayerInfo, Side } from "../types";

export const PITCH_W = 105;
export const PITCH_H = 68;

export interface Dot {
  id: string;
  side: Side;
  number: number;
  name: string;
  x: number;
  y: number;
  active: boolean;
}

export interface Frame {
  dots: Dot[];
  ball: [number, number];
  possession: Side;
  activeId: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function ballOf(e: MatchEvent | undefined): [number, number] {
  if (!e) return [PITCH_W / 2, PITCH_H / 2];
  const done = e.outcome === undefined || e.outcome === "complete";
  if (done && e.end_x !== undefined && e.end_y !== undefined && e.type !== "shot") {
    return [e.end_x, e.end_y];
  }
  if (e.type === "shot" && e.end_x !== undefined && e.end_y !== undefined) return [e.end_x, e.end_y];
  if (e.x !== undefined && e.y !== undefined) return [e.x, e.y];
  return [PITCH_W / 2, PITCH_H / 2];
}

function squad(init: InitMsg, side: Side, offPitch: Set<string>, onPitch: Set<string>): PlayerInfo[] {
  const t = init.lineups[side];
  const starters = t.players.filter((p) => !offPitch.has(p.id));
  const subs = t.bench.filter((p) => onPitch.has(p.id) && !offPitch.has(p.id));
  return [...starters, ...subs];
}

/**
 * Where everyone stands after an event. The engine only reports the ball and the player on it,
 * so the rest of the shape is derived from formation anchors shifted toward the ball.
 * Every view (radar and the broadcast cameras) reads from this one function.
 */
export function frameAt(init: InitMsg, last: MatchEvent | undefined, offPitch: Set<string>, onPitch: Set<string>): Frame {
  const [bx, by] = ballOf(last);
  const possession: Side = last?.team ?? "home";
  const dots: Dot[] = [];
  for (const side of ["home", "away"] as Side[]) {
    // Work in the team's attacking frame (0 = own goal, 105 = opponent goal).
    const ballP = side === "home" ? bx : PITCH_W - bx;
    const ballY = side === "home" ? by : PITCH_H - by;
    const attacking = possession === side;
    const shift = (ballP - 50) * (attacking ? 0.62 : 0.5);
    for (const p of squad(init, side, offPitch, onPitch)) {
      let [ax, ay] = p.anchor;
      if (p.role === "GK") {
        ax = clamp(ax + shift * 0.08, 2, 16);
      } else {
        ax = clamp(ax + shift, 4, 101);
        ay = ay + (ballY - 34) * (attacking ? 0.18 : 0.32);
      }
      // Gentle deterministic jitter so the shape breathes between events.
      const j = ((p.number * 37 + (last?.id ?? 0) * 13) % 7) - 3;
      ax += j * 0.5;
      ay = clamp(ay + j * 0.4, 2, 66);
      const active = last?.player_id === p.id;
      if (active && last?.x !== undefined && last?.y !== undefined) {
        dots.push({ id: p.id, side, number: p.number, name: p.name, x: last.x, y: last.y, active });
        continue;
      }
      const [x, y] = side === "home" ? [ax, ay] : [PITCH_W - ax, PITCH_H - ay];
      dots.push({ id: p.id, side, number: p.number, name: p.name, x, y, active });
    }
  }
  return { dots, ball: [bx, by], possession, activeId: last?.player_id ?? null };
}

/** Linear blend between two frames, matched by player id (subs and red cards just appear). */
export function blendFrames(a: Frame, b: Frame, t: number): Frame {
  const from = new Map(a.dots.map((d) => [d.id, d]));
  const dots = b.dots.map((d) => {
    const p = from.get(d.id);
    return p ? { ...d, x: p.x + (d.x - p.x) * t, y: p.y + (d.y - p.y) * t } : d;
  });
  const ball: [number, number] = [a.ball[0] + (b.ball[0] - a.ball[0]) * t, a.ball[1] + (b.ball[1] - a.ball[1]) * t];
  return { ...b, dots, ball };
}
