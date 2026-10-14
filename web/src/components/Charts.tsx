import type { InitMsg, Side, TeamStats } from "../types";

export function Momentum({ series, init }: { series: [number, number][]; init: InitMsg }) {
  const W = 600;
  const H = 70;
  const mid = H / 2;
  const maxAbs = Math.max(4, ...series.map(([, v]) => Math.abs(v)));
  const x = (m: number) => (Math.min(m, 96) / 96) * W;
  const y = (v: number) => mid - (v / maxAbs) * (mid - 4);
  const pts = series.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`);
  const area = pts.length ? `M${x(series[0][0])},${mid} L${pts.join(" L")} L${x(series[series.length - 1][0])},${mid} Z` : "";
  return (
    <div className="momentum">
      <div className="panel-label">
        <span style={{ color: init.lineups.home.color }}>▲ {init.lineups.home.short}</span>
        Momentum
        <span style={{ color: init.lineups.away.color }}>{init.lineups.away.short} ▼</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <clipPath id="top">
            <rect width={W} height={mid} />
          </clipPath>
          <clipPath id="bottom">
            <rect y={mid} width={W} height={mid} />
          </clipPath>
        </defs>
        <line x1={x(45)} x2={x(45)} y1="0" y2={H} className="ht" />
        <path d={area} fill={init.lineups.home.color} clipPath="url(#top)" opacity="0.85" />
        <path d={area} fill={init.lineups.away.color} clipPath="url(#bottom)" opacity="0.85" />
        <line x1="0" x2={W} y1={mid} y2={mid} className="axis" />
      </svg>
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
];

export function StatBars({ stats, init }: { stats: Record<Side, TeamStats> | null; init: InitMsg }) {
  if (!stats) return <div className="stats empty">Stats arrive with the first touches…</div>;
  return (
    <div className="stats">
      {ROWS.map((r) => {
        const h = Number(stats.home[r.key] ?? 0);
        const a = Number(stats.away[r.key] ?? 0);
        const tot = h + a || 1;
        const f = r.fmt ?? ((v: number) => String(v));
        return (
          <div className="stat" key={r.key}>
            <span className="v">{f(h)}</span>
            <div className="bar">
              <i style={{ width: `${(h / tot) * 100}%`, background: init.lineups.home.color }} />
              <i style={{ width: `${(a / tot) * 100}%`, background: init.lineups.away.color }} />
            </div>
            <span className="v">{f(a)}</span>
            <span className="l">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}
