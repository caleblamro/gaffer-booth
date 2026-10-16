import type { Side, TeamStats } from "../types";

const TICKS = [0, 15, 30, 45, 60, 75, 90];

export function Momentum({ series, height = 58 }: { series: [number, number][]; height?: number }) {
  const W = 600;
  const H = height;
  const mid = H / 2;
  const maxAbs = Math.max(4, ...series.map(([, v]) => Math.abs(v)));
  const x = (m: number) => (Math.min(m, 90) / 90) * W;
  const y = (v: number) => mid - (v / maxAbs) * (mid - 2);
  const pts = series.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`);
  const area = pts.length ? `M${x(series[0][0])},${mid} L${pts.join(" L")} L${x(series[series.length - 1][0])},${mid} Z` : "";
  const now = series.length ? series[series.length - 1][0] : null;
  return (
    <div className="mom">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} aria-label="Momentum by minute">
        <defs>
          <clipPath id="mom-top">
            <rect width={W} height={mid} />
          </clipPath>
          <clipPath id="mom-bottom">
            <rect y={mid} width={W} height={mid} />
          </clipPath>
        </defs>
        {[15, 30, 60, 75].map((m) => (
          <line key={m} x1={x(m)} x2={x(m)} y1="0" y2={H} stroke="var(--line)" />
        ))}
        <line x1={x(45)} x2={x(45)} y1="0" y2={H} stroke="var(--line-2)" strokeDasharray="2 3" />
        <path d={area} fill="var(--home)" clipPath="url(#mom-top)" opacity="0.85" />
        <path d={area} fill="var(--away)" clipPath="url(#mom-bottom)" opacity="0.85" />
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--faint)" strokeWidth="0.6" />
        {now !== null && <line x1={x(now)} x2={x(now)} y1="2" y2={H - 2} stroke="var(--ink)" strokeWidth="1.2" />}
      </svg>
      <div className="ticks">
        {TICKS.map((m) => (
          <span key={m} style={{ left: `${(m / 90) * 100}%` }}>
            {m === 45 ? "HT" : `${m}'`}
          </span>
        ))}
      </div>
    </div>
  );
}

const ROWS: { key: keyof TeamStats; label: string; fmt?: (v: number) => string }[] = [
  { key: "possession_pct", label: "Possession", fmt: (v) => `${v}%` },
  { key: "xg", label: "xG", fmt: (v) => v.toFixed(2) },
  { key: "shots", label: "Shots" },
  { key: "on_target", label: "On target" },
  { key: "pass_pct", label: "Pass accuracy", fmt: (v) => `${v}%` },
  { key: "final_third_entries", label: "Final-third entries" },
  { key: "corners", label: "Corners" },
  { key: "fouls", label: "Fouls" },
];

export function StatBars({ stats }: { stats: Record<Side, TeamStats> | null }) {
  if (!stats) return <p className="empty">Stats arrive with the first touches.</p>;
  return (
    <div className="stats">
      {ROWS.map((r) => {
        const h = Number(stats.home[r.key] ?? 0);
        const a = Number(stats.away[r.key] ?? 0);
        const tot = h + a || 1;
        const f = r.fmt ?? ((v: number) => String(v));
        return (
          <div className="st" key={r.key}>
            <b>{f(h)}</b>
            <div>
              <span>{r.label}</span>
              <i>
                <em style={{ width: `${(h / tot) * 100}%`, background: "var(--home)" }} />
                <em style={{ width: `${(a / tot) * 100}%`, background: "var(--away)" }} />
              </i>
            </div>
            <b>{f(a)}</b>
          </div>
        );
      })}
    </div>
  );
}
