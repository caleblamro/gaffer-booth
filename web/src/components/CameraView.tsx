import { memo, useEffect, useRef, useState } from "react";
import { GOALS, MARKINGS, VIEW_H, VIEW_W, projectLine, projectPolygon, projector, type Rig } from "../lib/camera";
import { blendFrames, type Frame } from "../lib/positions";
import type { Side } from "../types";

interface Props {
  frame: Frame;
  rig: Rig;
  colors: Record<Side, string>;
  /** Thumbnails skip shirt numbers and the vignette. */
  thumb?: boolean;
}

const STRIPES = 14;
const STRIPE = 8.07;

/** A broadcast camera: pinhole projection of the pitch, players as upright figures, near to far. */
export const CameraView = memo(function CameraView({ frame, rig, colors, thumb = false }: Props) {
  const P = projector(rig);
  const ground: string[] = [];
  const quad = (pts: [number, number, number][]) => projectPolygon(P, pts);

  const bowl = quad([
    [-30, -30, 0],
    [135, -30, 0],
    [135, 98, 0],
    [-30, 98, 0],
  ]);
  const stands = [
    quad([
      [-30, -30, 0],
      [135, -30, 0],
      [135, -30, 12],
      [-30, -30, 12],
    ]),
    quad([
      [-30, 98, 0],
      [-30, 98, 14],
      [135, 98, 14],
      [135, 98, 0],
    ]),
  ];
  for (let i = 0; i < STRIPES; i++) {
    const x0 = -4 + i * STRIPE;
    ground.push(
      quad([
        [x0, -4, 0],
        [x0 + STRIPE, -4, 0],
        [x0 + STRIPE, 72, 0],
        [x0, 72, 0],
      ]) ?? "",
    );
  }

  const bodies = frame.dots
    .map((d) => ({ d, foot: P([d.x, d.y, 0]), head: P([d.x, d.y, 1.82]), hip: P([d.x, d.y, 0.95]) }))
    // Skip anyone too close to the lens to stand upright in frame (the head projects below the feet).
    .filter((b) => b.foot && b.head && b.hip && b.foot[2] > 2 && b.foot[1] - b.head[1] > 0 && b.foot[1] > b.hip[1])
    .sort((a, b) => b.foot![2] - a.foot![2]);
  const ball = P([frame.ball[0], frame.ball[1], 0.11]);
  const ballR = ball ? Math.max(2.5, (VIEW_W * rig.fov * 0.5 * 0.11) / ball[2]) : 0;

  return (
    <svg className="cam" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={VIEW_W} height={VIEW_H} fill="var(--stand-0)" />
      {bowl && <polygon points={bowl} fill="var(--stand-2)" />}
      {stands.map((s, i) => s && <polygon key={i} points={s} fill="var(--stand-1)" />)}
      {ground.map((g, i) => g && <polygon key={i} points={g} fill={i % 2 ? "var(--grass-a)" : "var(--grass-b)"} />)}
      <g fill="none" stroke="var(--grass-line)" strokeWidth={thumb ? 4 : 2.2} strokeLinejoin="round">
        {MARKINGS.map((m, i) => {
          const pts = projectLine(P, m);
          return pts && <polyline key={i} points={pts} />;
        })}
      </g>
      {GOALS.map((g, i) => {
        const net = projectPolygon(P, g.net);
        const post = projectLine(P, g.frame);
        return (
          <g key={i}>
            {net && <polygon points={net} fill="rgba(243,245,244,.12)" />}
            {post && <polyline points={post} fill="none" stroke="var(--chalk)" strokeWidth={thumb ? 5 : 3.2} />}
          </g>
        );
      })}
      {bodies.map(({ d, foot, head, hip }) => {
        const h = foot![1] - head![1];
        const w = Math.max(3, h * 0.3);
        return (
          <g key={d.id}>
            <ellipse cx={foot![0]} cy={foot![1]} rx={w * 0.8} ry={w * 0.22} fill="rgba(0,0,0,.35)" />
            {d.active && (
              <ellipse
                cx={foot![0]}
                cy={foot![1]}
                rx={w * 1.5}
                ry={w * 0.42}
                fill="none"
                stroke="var(--chalk)"
                strokeWidth={Math.max(1, w * 0.07)}
                strokeDasharray={`${w * 0.25} ${w * 0.18}`}
              />
            )}
            <rect x={foot![0] - w * 0.36} y={hip![1]} width={w * 0.72} height={foot![1] - hip![1]} rx={w * 0.2} fill="#101614" />
            <rect x={foot![0] - w / 2} y={head![1] + h * 0.14} width={w} height={hip![1] - head![1] - h * 0.1} rx={w * 0.3} fill={colors[d.side]} />
            <circle cx={head![0]} cy={head![1] + h * 0.06} r={h * 0.075} fill="#c9a98a" />
            {!thumb && h > 46 && (
              <text x={foot![0]} y={head![1] + h * 0.42} fill="#fff" textAnchor="middle" className="cam-num" style={{ fontSize: h * 0.2 }}>
                {d.number}
              </text>
            )}
          </g>
        );
      })}
      {ball && <circle cx={ball[0]} cy={ball[1]} r={ballR} fill="#fff" stroke="#0a0d0c" strokeWidth="1" />}
      {!thumb && <rect width={VIEW_W} height={VIEW_H} fill="url(#cam-vignette)" />}
      <defs>
        <radialGradient id="cam-vignette" cx="50%" cy="60%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
    </svg>
  );
});

/** Eases the displayed frame toward each new target so cameras pan and players run instead of jumping. */
export function useTweenedFrame(target: Frame, ms: number): Frame {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const latest = useRef(target);

  useEffect(() => {
    from.current = latest.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      const f = blendFrames(from.current, target, eased);
      latest.current = f;
      setShown(f);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown;
}
