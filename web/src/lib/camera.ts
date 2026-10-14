import type { Side } from "../types";
import { PITCH_H, PITCH_W, type Frame } from "./positions";

/** World space: X along the pitch (0-105 m), Y across (0-68 m), Z up, in metres. */
export type Vec3 = [number, number, number];

export type CameraId = "main" | "tactical" | "goal" | "iso" | "reverse" | "radar";

export const CAMERAS: { id: CameraId; name: string }[] = [
  { id: "main", name: "Main" },
  { id: "tactical", name: "Tactical" },
  { id: "goal", name: "Behind goal" },
  { id: "iso", name: "Isolation" },
  { id: "reverse", name: "Reverse" },
  { id: "radar", name: "Radar" },
];

export interface Rig {
  pos: Vec3;
  at: Vec3;
  /** Focal length as a fraction of image width. */
  fov: number;
}

export const VIEW_W = 1600;
export const VIEW_H = 900;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where each camera sits for a given frame. `attack` is the side whose attacking goal the
 * behind-goal camera covers; `focus` is the player the isolation camera follows.
 */
export function rigFor(id: Exclude<CameraId, "radar">, frame: Frame, attack: Side, focus: [number, number] | null): Rig {
  const [bx, by] = frame.ball;
  switch (id) {
    case "main": {
      const x = clamp(bx, 18, 87);
      return { pos: [lerp(52.5, x, 0.7), -24, 15], at: [x, lerp(34, by, 0.5), 0], fov: 1.9 };
    }
    case "tactical":
      return { pos: [52.5, -58, 74], at: [52.5, 36, 0], fov: 1.32 };
    case "goal":
      return attack === "home"
        ? { pos: [PITCH_W + 16, 38, 7], at: [PITCH_W - 30, 32, 0], fov: 1.5 }
        : { pos: [-16, 30, 7], at: [30, 36, 0], fov: 1.5 };
    case "iso": {
      const [fx, fy] = focus ?? frame.ball;
      const dir = attack === "home" ? 1 : -1;
      return { pos: [fx - 9 * dir, fy - 24, 7], at: [fx + 2 * dir, fy, 0.9], fov: 2.3 };
    }
    case "reverse": {
      const x = clamp(bx, 18, 87);
      return { pos: [lerp(52.5, x, 0.6), PITCH_H + 34, 20], at: [x, by, 0], fov: 1.75 };
    }
  }
}

export interface Projector {
  (p: Vec3): [number, number, number] | null;
  depth: (p: Vec3) => number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Pinhole projection into a VIEW_W x VIEW_H image. Returns [x, y, depth] or null behind the lens. */
export function projector(rig: Rig): Projector {
  const f = norm(sub(rig.at, rig.pos));
  const r = norm(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  const k = VIEW_W * rig.fov * 0.5;
  const P = ((p: Vec3) => {
    const d = sub(p, rig.pos);
    const z = dot(d, f);
    if (z < 0.5) return null;
    return [VIEW_W / 2 + (k * dot(d, r)) / z, VIEW_H / 2 - (k * dot(d, u)) / z, z];
  }) as Projector;
  P.depth = (p: Vec3) => dot(sub(p, rig.pos), f);
  return P;
}

const NEAR = 0.6;

/** Clips a planar polygon against the near plane, then projects it to an SVG points string. */
export function projectPolygon(P: Projector, pts: Vec3[]): string | null {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = P.depth(a) - NEAR;
    const db = P.depth(b) - NEAR;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  if (out.length < 3) return null;
  return toPoints(P, out);
}

/** Projects a polyline, dropping points behind the lens. Lines are pre-subdivided so this stays smooth. */
export function projectLine(P: Projector, pts: Vec3[]): string | null {
  return toPoints(P, pts);
}

function toPoints(P: Projector, pts: Vec3[]): string | null {
  const q: string[] = [];
  for (const p of pts) {
    const v = P(p);
    if (v) q.push(`${v[0].toFixed(1)},${v[1].toFixed(1)}`);
  }
  return q.length > 1 ? q.join(" ") : null;
}

const seg = (a: [number, number], b: [number, number], n = 24): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, 0]);

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t), 0];
  });

const box = (x0: number, y0: number, x1: number, y1: number, n: number): Vec3[] => [
  ...seg([x0, y0], [x1, y0], n),
  ...seg([x1, y0], [x1, y1], n).slice(1),
  ...seg([x1, y1], [x0, y1], n).slice(1),
  ...seg([x0, y1], [x0, y0], n).slice(1),
];

/** Pitch markings in world space, built once. */
export const MARKINGS: Vec3[][] = (() => {
  const W = PITCH_W;
  const H = PITCH_H;
  const lines: Vec3[][] = [box(0, 0, W, H, 32), seg([W / 2, 0], [W / 2, H]), arc(W / 2, H / 2, 9.15, 0, Math.PI * 2)];
  for (const [x0, dx] of [
    [0, 1],
    [W, -1],
  ] as const) {
    lines.push(box(x0, H / 2 - 20.16, x0 + 16.5 * dx, H / 2 + 20.16, 12));
    lines.push(box(x0, H / 2 - 9.16, x0 + 5.5 * dx, H / 2 + 9.16, 6));
    const a = dx > 0 ? 0 : Math.PI;
    lines.push(arc(x0 + 11 * dx, H / 2, 9.15, a - 0.93, a + 0.93, 16));
  }
  return lines;
})();

export const GOALS: { frame: Vec3[]; net: Vec3[] }[] = [0, PITCH_W].map((x0) => {
  const dx = x0 === 0 ? -1 : 1;
  const y0 = PITCH_H / 2 - 3.66;
  const y1 = PITCH_H / 2 + 3.66;
  return {
    frame: [
      [x0, y0, 0],
      [x0, y0, 2.44],
      [x0, y1, 2.44],
      [x0, y1, 0],
    ],
    net: [
      [x0, y0, 2.44],
      [x0, y1, 2.44],
      [x0 + 2 * dx, y1, 1.6],
      [x0 + 2 * dx, y0, 1.6],
    ],
  };
});
