import { useMemo } from "react";
import type { InitMsg, MatchEvent, PlayerInfo, Side } from "../types";

const W = 105;
const H = 68;

interface Props {
  init: InitMsg;
  events: MatchEvent[];
  offPitch: Set<string>;
  onPitch: Set<string>;
  speed: number;
}

interface Dot {
  id: string;
  side: Side;
  number: number;
  x: number;
  y: number;
  active: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function ballOf(e: MatchEvent | undefined): [number, number] {
  if (!e) return [W / 2, H / 2];
  const done = e.outcome === undefined || e.outcome === "complete";
  if (done && e.end_x !== undefined && e.end_y !== undefined && e.type !== "shot") {
    return [e.end_x, e.end_y];
  }
  if (e.type === "shot" && e.end_x !== undefined && e.end_y !== undefined) return [e.end_x, e.end_y];
  if (e.x !== undefined && e.y !== undefined) return [e.x, e.y];
  return [W / 2, H / 2];
}

function squad(init: InitMsg, side: Side, offPitch: Set<string>, onPitch: Set<string>): PlayerInfo[] {
  const t = init.lineups[side];
  const starters = t.players.filter((p) => !offPitch.has(p.id));
  const subs = t.bench.filter((p) => onPitch.has(p.id) && !offPitch.has(p.id));
  return [...starters, ...subs];
}

export function Pitch({ init, events, offPitch, onPitch, speed }: Props) {
  const last = events[events.length - 1];
  const [bx, by] = ballOf(last);
  const possession: Side = last?.team ?? "home";

  const dots = useMemo(() => {
    const out: Dot[] = [];
    for (const side of ["home", "away"] as Side[]) {
      // Work in the team's attacking frame (0 = own goal, 105 = opponent goal).
      const ballP = side === "home" ? bx : W - bx;
      const ballY = side === "home" ? by : H - by;
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
          out.push({ id: p.id, side, number: p.number, x: last.x, y: last.y, active });
          continue;
        }
        const [x, y] = side === "home" ? [ax, ay] : [W - ax, H - ay];
        out.push({ id: p.id, side, number: p.number, x, y, active });
      }
    }
    return out;
  }, [init, bx, by, possession, offPitch, onPitch, last]);

  const trail = events.slice(-7).filter((e) => e.x !== undefined && e.end_x !== undefined);
  const dur = clamp(2.6 / Math.sqrt(speed), 0.25, 0.9);
  const colors = { home: init.lineups.home.color, away: init.lineups.away.color };
  const alt = { home: init.lineups.home.alt_color, away: init.lineups.away.alt_color };

  return (
    <svg className="pitch" viewBox={`-3 -3 ${W + 6} ${H + 6}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="stripes" width="15" height={H} patternUnits="userSpaceOnUse">
          <rect width="7.5" height={H} fill="var(--grass-a)" />
          <rect x="7.5" width="7.5" height={H} fill="var(--grass-b)" />
        </pattern>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <rect x="-3" y="-3" width={W + 6} height={H + 6} fill="var(--grass-b)" />
      <rect width={W} height={H} fill="url(#stripes)" />
      <g className="lines">
        <rect width={W} height={H} />
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r="9.15" />
        <circle cx={W / 2} cy={H / 2} r="0.4" className="spot" />
        <rect x="0" y={H / 2 - 20.16} width="16.5" height="40.32" />
        <rect x={W - 16.5} y={H / 2 - 20.16} width="16.5" height="40.32" />
        <rect x="0" y={H / 2 - 9.16} width="5.5" height="18.32" />
        <rect x={W - 5.5} y={H / 2 - 9.16} width="5.5" height="18.32" />
        <circle cx="11" cy={H / 2} r="0.4" className="spot" />
        <circle cx={W - 11} cy={H / 2} r="0.4" className="spot" />
        <path d={`M16.5 ${H / 2 - 7.3} A9.15 9.15 0 0 1 16.5 ${H / 2 + 7.3}`} />
        <path d={`M${W - 16.5} ${H / 2 - 7.3} A9.15 9.15 0 0 0 ${W - 16.5} ${H / 2 + 7.3}`} />
        <rect x="-1.8" y={H / 2 - 3.66} width="1.8" height="7.32" />
        <rect x={W} y={H / 2 - 3.66} width="1.8" height="7.32" />
      </g>
      <rect width={W} height={H} fill="url(#vignette)" />
      <g className="trail">
        {trail.map((e, i) => (
          <line
            key={e.id}
            x1={e.x}
            y1={e.y}
            x2={e.end_x}
            y2={e.end_y}
            stroke={e.type === "shot" ? "var(--accent)" : colors[e.team]}
            strokeWidth={e.type === "shot" ? 0.7 : 0.45}
            strokeDasharray={e.outcome && e.outcome !== "complete" && e.type !== "shot" ? "1 1" : undefined}
            opacity={0.25 + (i / trail.length) * 0.6}
          />
        ))}
      </g>
      {dots.map((d) => (
        <g
          key={d.id}
          className={`dot${d.active ? " active" : ""}`}
          style={{ transform: `translate(${d.x}px, ${d.y}px)`, transitionDuration: `${dur}s` }}
        >
          {d.active && <circle r="3.2" className="halo" />}
          <circle r="1.9" fill={colors[d.side]} stroke={alt[d.side]} strokeWidth="0.35" />
          <text y="0.75" fill={alt[d.side]}>
            {d.number}
          </text>
        </g>
      ))}
      <g className="ball" style={{ transform: `translate(${bx}px, ${by}px)`, transitionDuration: `${dur}s` }}>
        <circle r="0.95" />
      </g>
    </svg>
  );
}
