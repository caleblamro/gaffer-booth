import { useEffect, useState } from "react";
import type { InitMsg, Side, TeamStats } from "../types";
import { Check, Pulse, Wordmark } from "./Brand";

interface Rating {
  id: string;
  name: string;
  team: Side;
  rating: number;
  goals: number;
  xg: number;
  key_passes: number;
  touches: number;
}

interface Recap {
  headline: string;
  report: string;
  social: string[];
  ratings: Rating[];
  score: { home: number; away: number };
  stats: Record<Side, TeamStats>;
  turning_points: { clock: string; what: string }[];
  mode: string;
  verification: { ok: boolean; checked: number; violations: string[] };
}

interface Goal {
  clock: string;
  side: Side;
  scorer: string;
}

/** Turning points arrive as "GOAL <team>: <scorer>"; the timeline only plots goals. */
function goalsOf(points: { clock: string; what: string }[], home: string): Goal[] {
  return points
    .filter((t) => t.what.startsWith("GOAL "))
    .map((t) => {
      const [team, scorer = ""] = t.what.slice(5).split(": ");
      return { clock: t.clock, side: team === home ? "home" : "away", scorer };
    });
}

const surname = (name: string) => name.split(" ").slice(-1)[0];
const minute = (clock: string) => clock.split(":")[0];

/** "67:12" → 67.2, "90+4:30" → 91 (stoppage time is pinned near the end of its half). */
const minuteOf = (clock: string) => {
  const [mm, ss = "0"] = clock.split(":");
  const [base, extra] = mm.split("+");
  return extra === undefined ? Number(base) + Number(ss) / 60 : Number(base) + Math.min(Number(extra), 4) * 0.25;
};

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => setDone(false),
        )
      }
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

interface Props {
  init: InitMsg;
  lang: string;
  setLang: (l: string) => void;
  onAgain: () => void;
  onNew: () => void;
}

/** Post-match: verified report, ratings computed in code and social copy, from GET /api/recap. */
export function FullTime({ init, lang, setLang, onAgain, onNew }: Props) {
  const [recap, setRecap] = useState<{ key: string; data: Recap | null; failed: boolean } | null>(null);
  const key = `${init.scenario_id}:${init.seed}:${lang}`;

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ scenario: init.scenario_id, seed: String(init.seed), lang });
    fetch(`/api/recap?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Recap) => live && setRecap({ key, data, failed: false }))
      .catch(() => live && setRecap({ key, data: null, failed: true }));
    return () => {
      live = false;
    };
  }, [init.scenario_id, init.seed, lang, key]);

  const h = init.lineups.home;
  const a = init.lineups.away;
  const r = recap?.key === key ? recap.data : null;
  const failed = recap?.key === key && recap.failed;
  const max = r ? Math.max(...r.ratings.map((x) => x.rating)) : 10;
  const goals = r ? goalsOf(r.turning_points, h.name) : [];
  const scorers = (side: Side) =>
    goals
      .filter((g) => g.side === side)
      .map((g) => `${surname(g.scorer)} ${minute(g.clock)}'`)
      .join(", ");

  return (
    <div className="screen">
      <header className="top">
        <Wordmark />
        <span className="sep" />
        <span className="fixture">
          {h.name} v {a.name}
        </span>
        <span className="tally off">Full time</span>
        <div className="right">
          <div className="seg">
            {init.langs.map((l) => (
              <button type="button" key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={onAgain}>
            Watch again
          </button>
          <button type="button" className="btn primary" onClick={onNew}>
            New match
          </button>
        </div>
      </header>
      {!r ? (
        <div className="warming">
          <div className="card">
            <span className="eyebrow">Full time</span>
            <h1 className="d">{failed ? "Recap unavailable" : "Writing the match report"}</h1>
            <p>
              {failed
                ? "The recap service didn't answer. The broadcast is over; start a new match or watch this one again."
                : "The Recap writer drafts the report, the Verifier checks every number and ratings are computed from the match data."}
            </p>
            {!failed && (
              <span className="tag idle">
                <Pulse />
                Working
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="ft-grid">
          <section className="ft-main">
            <div className="ft">
              <div className="team">
                <i style={{ background: h.color }} />
                <span className="d">{h.name}</span>
                <small>{scorers("home")}</small>
              </div>
              <span className="d score">
                {r.score.home}
                <b>–</b>
                {r.score.away}
              </span>
              <div className="team r">
                <i style={{ background: a.color }} />
                <span className="d">{a.name}</span>
                <small>{scorers("away")}</small>
              </div>
            </div>
            <div className="tl">
              <span className="axis" />
              <span className="ht" />
              {goals.map((g, i) => (
                <span className={`g${i % 2 ? " lo" : ""}`} key={`${g.clock}${i}`} style={{ left: `${Math.min(100, (minuteOf(g.clock) / 90) * 100)}%` }}>
                  <i style={{ background: init.lineups[g.side].color }} />
                  <span>
                    {minute(g.clock)}' {surname(g.scorer)}
                  </span>
                </span>
              ))}
            </div>
            <span className="eyebrow">Match report</span>
            <h1 className="d headline">{r.headline}</h1>
            <p className="report">{r.report}</p>
            <div className="meta">
              <span className={`tag ${r.verification.ok ? "pass" : "fail"}`}>
                {r.verification.ok && <Check />}
                {r.verification.ok ? `${r.verification.checked} facts verified` : `${r.verification.violations.length} unverified`}
              </span>
              <span className="mono faint">Recap writer · {r.mode === "llm" ? "Foundry" : "template tier"}</span>
            </div>
            <div className="cmp">
              {(
                [
                  ["xG", (s: TeamStats) => s.xg.toFixed(2)],
                  ["Shots", (s: TeamStats) => String(s.shots)],
                  ["Possession", (s: TeamStats) => `${s.possession_pct}%`],
                  ["Pass accuracy", (s: TeamStats) => `${s.pass_pct}%`],
                ] as const
              ).map(([label, f]) => (
                <div key={label}>
                  <span className="eyebrow">{label}</span>
                  <b>
                    {f(r.stats.home)}
                    <em>·</em>
                    {f(r.stats.away)}
                  </b>
                </div>
              ))}
            </div>
          </section>
          <aside className="ft-side">
            <div className="sec">
              <div className="hd">
                <span className="eyebrow">Player ratings</span>
                <span className="mono faint">computed in code</span>
              </div>
              <table className="ratings">
                <tbody>
                  {r.ratings.slice(0, 10).map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <span className="c" style={{ background: init.lineups[p.team].color }} />
                        {p.name}
                        {i === 0 && <span className="potm">POTM</span>}
                      </td>
                      <td className="r">
                        {p.goals > 0 ? `${p.goals} G · ` : ""}
                        {p.xg.toFixed(2)} xG
                      </td>
                      <td className="rt">
                        <div className="rb">
                          <i style={{ width: `${(p.rating / max) * 64}px` }} />
                          <b>{p.rating.toFixed(1)}</b>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sec">
              <div className="hd">
                <span className="eyebrow">Social posts</span>
                <span className="mono faint">{r.social.length} ready</span>
              </div>
              {r.social.map((s) => (
                <div className="post" key={s}>
                  <p>{s}</p>
                  <div className="row">
                    <span className="mono faint">{s.length} / 200</span>
                    <CopyButton text={s} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
