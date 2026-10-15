import type { MatchEvent, Side } from "../types";
import { PITCH_H as H, PITCH_W as W, type Frame } from "../lib/positions";

interface Props {
  frame: Frame;
  events: MatchEvent[];
  colors: Record<Side, string>;
  speed: number;
  thumb?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The radar camera: a flat top-down view of the same frame the broadcast cameras use. */
export function Pitch({ frame, events, colors, speed, thumb = false }: Props) {
  const trail = thumb ? [] : events.slice(-7).filter((e) => e.x !== undefined && e.end_x !== undefined);
  const dur = clamp(2.6 / Math.sqrt(speed), 0.25, 0.9);
  const [bx, by] = frame.ball;

  return (
    <svg className="pitch" viewBox={`-4 -4 ${W + 8} ${H + 8}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-4 + i * 9.42} y="-4" width="9.42" height={H + 8} fill={i % 2 ? "var(--grass-a)" : "var(--grass-b)"} />
      ))}
      <g className="lines">
        <rect width={W} height={H} />
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r="9.15" />
        <rect x="0" y={H / 2 - 20.16} width="16.5" height="40.32" />
        <rect x={W - 16.5} y={H / 2 - 20.16} width="16.5" height="40.32" />
        <rect x="0" y={H / 2 - 9.16} width="5.5" height="18.32" />
        <rect x={W - 5.5} y={H / 2 - 9.16} width="5.5" height="18.32" />
        <path d={`M16.5 ${H / 2 - 7.3} A9.15 9.15 0 0 1 16.5 ${H / 2 + 7.3}`} />
        <path d={`M${W - 16.5} ${H / 2 - 7.3} A9.15 9.15 0 0 0 ${W - 16.5} ${H / 2 + 7.3}`} />
        <rect x="-1.2" y={H / 2 - 3.66} width="1.2" height="7.32" />
        <rect x={W} y={H / 2 - 3.66} width="1.2" height="7.32" />
      </g>
      <g className="trail">
        {trail.map((e, i) => (
          <line
            key={e.id}
            x1={e.x}
            y1={e.y}
            x2={e.end_x}
            y2={e.end_y}
            stroke={e.type === "shot" ? "var(--chalk)" : colors[e.team]}
            strokeWidth={e.type === "shot" ? 0.5 : 0.4}
            strokeDasharray={e.type === "shot" || (e.outcome && e.outcome !== "complete") ? "1 .7" : undefined}
            opacity={0.25 + (i / trail.length) * 0.6}
          />
        ))}
      </g>
      {frame.dots.map((d) => (
        <g key={d.id} className="dot" style={{ transform: `translate(${d.x}px, ${d.y}px)`, transitionDuration: `${dur}s` }}>
          {d.active && <circle r="3.6" className="halo" />}
          <circle r="1.85" fill={colors[d.side]} stroke="rgba(243,245,244,.9)" strokeWidth="0.28" />
          {!thumb && <text y="0.62">{d.number}</text>}
        </g>
      ))}
      <g className="ball" style={{ transform: `translate(${bx}px, ${by}px)`, transitionDuration: `${dur}s` }}>
        <circle r="0.85" />
      </g>
    </svg>
  );
}
