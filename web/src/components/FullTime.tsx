import { useEffect, useState } from "react";
import { sideClass } from "../lib/labels";
import type { InitMsg, Side, TeamStats } from "../types";
import { Check, Pulse } from "./Brand";

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

/**
 * The Verifier checks every number and player name in the report, so once it passes, each of them
 * is a verified claim and is marked as one.
 */
function markClaims(text: string, names: string[]) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const people = [...names].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(`(${[...people, "\\d+(?:[.:+]\\d+)*(?:[-–]\\d+)?%?"].join("|")})`, "g");
  return text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

/** Spreads goal markers along the timeline, dropping a label to a second row when it would collide. */
function placeGoals(goals: Goal[], end: number) {
  const out: (Goal & { left: number; low: boolean })[] = [];
  for (const g of goals) {
    const left = Math.min(100, (minuteOf(g.clock) / end) * 100);
    const prev = out[out.length - 1];
    out.push({ ...g, left, low: prev !== undefined && left - prev.left < 6 ? !prev.low : false });
  }
  return out;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="mini"
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

const STAT4: [string, (s: TeamStats) => string][] = [
  ["Expected goals", (s) => s.xg.toFixed(2)],
  ["Shots", (s) => String(s.shots)],
  ["Possession", (s) => `${s.possession_pct}%`],
  ["Pass accuracy", (s) => `${s.pass_pct}%`],
];

/** Post-match: verified report, ratings computed in code and social copy, from GET /api/recap. */
export function Recap({ init, lang, aired }: { init: InitMsg; lang: string; aired: number }) {
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

  if (!r) {
    return (
      <div className="cells">
        <section className="c notice">
          <div className="ch hud">
            <span>Match report</span>
            <span className="n">{failed ? "Unavailable" : "Working"}</span>
          </div>
          <div className="story">
            <h2>{failed ? "Recap unavailable" : "Writing the match report"}</h2>
            <p>
              {failed
                ? "The recap service didn't answer. The broadcast is over; start a new broadcast or watch this one again."
                : "The Recap writer drafts the report, the Verifier checks every number and ratings are computed from the match data."}
            </p>
            {!failed && (
              <span className="pill neutral">
                <Pulse />
                Working
              </span>
            )}
          </div>
        </section>
      </div>
    );
  }

  const max = Math.max(...r.ratings.map((x) => x.rating));
  const goals = goalsOf(r.turning_points, h.name);
  const scorers = (side: Side) =>
    goals
      .filter((g) => g.side === side)
      .map((g) => `${surname(g.scorer)} ${minute(g.clock)}'`)
      .join(", ");
  const end = Math.max(94, ...goals.map((g) => minuteOf(g.clock)));
  const placed = placeGoals(goals, end);
  const names = [...h.players, ...h.bench, ...a.players, ...a.bench].map((p) => p.name);
  const winner = r.score.home > r.score.away ? "home" : r.score.away > r.score.home ? "away" : null;

  return (
    <div className="cells cols-side ft">
      <div className="stack">
        <section className="c board">
          <div className="ch hud">
            <span>Final score</span>
            <span className={`pill ${r.verification.ok ? "ok" : "bad"}`}>
              {r.verification.ok ? <Check /> : <i />}
              {r.verification.ok ? `Report verified — ${r.verification.checked} claims` : `${r.verification.violations.length} unverified claims`}
            </span>
          </div>
          <div className="scorecard">
            <div className="team">
              <span className="k h" />
              <b>{h.name}</b>
              <span>{scorers("home") || "No goals"}</span>
            </div>
            <div className="final">
              <span className={winner === "away" ? "l" : ""}>{r.score.home}</span>–<span className={winner === "home" ? "l" : ""}>{r.score.away}</span>
            </div>
            <div className="team a">
              <span className="k a" />
              <b>{a.name}</b>
              <span>{scorers("away") || "No goals"}</span>
            </div>
          </div>
          <div className="sub hud">
            <span>Goals</span>
            <span>
              {goals.length} goal{goals.length === 1 ? "" : "s"} — {aired} segment{aired === 1 ? "" : "s"} aired
            </span>
          </div>
          <div className="goals">
            {[0, 15, 30, 45, 60, 75, 90].map((m) => (
              <span key={m} className="tick hud" style={{ left: `${(m / end) * 100}%` }}>
                {m === 45 ? "HT" : m}
              </span>
            ))}
            {placed.map((g, i) => (
              <div className={`gm ${sideClass(g.side)}${g.low ? " low" : ""}`} key={`${g.clock}${i}`} style={{ left: `${g.left}%` }}>
                <i />
                <b>{minute(g.clock)}'</b>
                {surname(g.scorer)}
              </div>
            ))}
          </div>
          <div className="stats4">
            {STAT4.map(([label, f]) => (
              <div key={label}>
                <span className="hud">{label}</span>
                <b>{f(r.stats.home)}</b> <em>/ {f(r.stats.away)}</em>
              </div>
            ))}
          </div>
        </section>
        <section className="c report">
          <div className="ch hud">
            <span>Match report</span>
            <span className="n">
              Recap writer — {r.mode === "llm" ? "model" : "template tier"} — {r.verification.ok ? "every number checked" : "check failed"}
            </span>
          </div>
          <div className="story">
            <h2>{r.headline}</h2>
            <p>{r.verification.ok ? markClaims(r.report, names) : r.report}</p>
          </div>
        </section>
      </div>
      <div className="stack">
        <section className="c">
          <div className="ch hud">
            <span>Player ratings</span>
            <span className="n">Computed in code</span>
          </div>
          <ol className="ratings">
            {r.ratings.slice(0, 8).map((p, i) => (
              <li key={p.id}>
                <span className="t">{String(i + 1).padStart(2, "0")}</span>
                <span className="who">
                  <b>{p.name}</b>
                  {i === 0 && <em className="potm hud">POTM</em>}
                  <small>
                    {p.goals > 0 ? `${p.goals} G — ` : p.key_passes > 1 ? `${p.key_passes} KP — ` : ""}
                    {p.xg.toFixed(2)} xG
                  </small>
                </span>
                <span className={`rbar ${sideClass(p.team)}`} style={{ width: `${(p.rating / max) * 48}px` }} />
                <b className="rt">{p.rating.toFixed(1)}</b>
              </li>
            ))}
          </ol>
        </section>
        <section className="c posts">
          <div className="ch hud">
            <span>Social posts</span>
            <span className="n">{r.social.length} ready</span>
          </div>
          <ul>
            {r.social.map((s) => (
              <li className="post" key={s}>
                {s}
                <div className="pf hud">
                  <span>
                    {s.length} / 200
                    {r.verification.ok && (
                      <>
                        {" — "}
                        <Check /> verified
                      </>
                    )}
                  </span>
                  <CopyButton text={s} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
