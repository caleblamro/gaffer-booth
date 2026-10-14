import { useEffect, useState } from "react";
import type { InitMsg, MatchEvent, Score, Segment } from "../types";

export function ScoreBug({ init, score }: { init: InitMsg; score: Score }) {
  const h = init.lineups.home;
  const a = init.lineups.away;
  return (
    <div className="scorebug">
      <span className="sb-team" style={{ ["--c" as string]: h.color }}>
        {h.short}
      </span>
      <span className="sb-score">
        {score.home}
        <i>-</i>
        {score.away}
      </span>
      <span className="sb-team" style={{ ["--c" as string]: a.color }}>
        {a.short}
      </span>
      <span className="sb-clock">{score.clock}</span>
    </div>
  );
}

const HOLD_MS: Record<string, number> = {
  full_screen: 6500,
  stat_card: 8000,
  lower_third: 6000,
  player_card: 7500,
};

/** Shows the most recent segment's graphic for a few seconds. */
export function useOnAir(segments: Segment[]): Segment | null {
  const latest = segments[segments.length - 1] ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!latest) return null;
  return now - latest.receivedAt < (HOLD_MS[latest.slot] ?? 6000) ? latest : null;
}

function Verified({ seg }: { seg: Segment }) {
  const v = seg.verification;
  return (
    <span className={`verified ${v.ok ? "ok" : "bad"}`} title={v.checked.map((c) => `${c[0]} ← ${c[1]}`).join("\n")}>
      {v.ok ? "✓" : "!"} {v.checked.length} fact{v.checked.length === 1 ? "" : "s"} verified
    </span>
  );
}

export function OverlayLayer({ seg }: { seg: Segment | null }) {
  if (!seg) return null;
  const o = seg.overlay;
  const style = { ["--team" as string]: o.color };
  if (o.slot === "full_screen") {
    return (
      <div className="ov ov-full" key={o.moment_id} style={style}>
        <div className="ov-full-card">
          <div className="ov-kicker">
            <span>{o.team_name}</span>
            <span>{o.clock}</span>
          </div>
          <h2 className="ov-title">{o.title}</h2>
          {o.player && <div className="ov-player">{o.player}</div>}
          {o.compare ? (
            <table className="ov-compare">
              <thead>
                <tr>
                  <th style={{ color: o.compare.home_color }}>{o.compare.home}</th>
                  <th className="ov-cmp-score">
                    {o.compare.score[0]} - {o.compare.score[1]}
                  </th>
                  <th style={{ color: o.compare.away_color }}>{o.compare.away}</th>
                </tr>
              </thead>
              <tbody>
                {o.compare.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.home}</td>
                    <td className="lbl">{r.label}</td>
                    <td>{r.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Rows rows={o.rows ?? []} />
          )}
          <p className="ov-insight">{seg.insight}</p>
          <Verified seg={seg} />
        </div>
      </div>
    );
  }
  if (o.slot === "stat_card" || o.slot === "player_card") {
    return (
      <div className={`ov ov-side ${o.slot === "player_card" ? "left" : "right"}`} key={o.moment_id} style={style}>
        <div className="ov-side-head">
          <span className="ov-chip">{o.title}</span>
          <span className="ov-sub">{o.subtitle}</span>
        </div>
        <Rows rows={o.rows ?? []} />
        <p className="ov-insight">{seg.insight}</p>
        <Verified seg={seg} />
      </div>
    );
  }
  return (
    <div className="ov ov-lower" key={o.moment_id} style={style}>
      <span className="ov-chip">{o.title}</span>
      <div className="ov-lower-body">
        <strong>{o.subtitle}</strong>
        <span>{seg.insight}</span>
      </div>
      <Verified seg={seg} />
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value?: string }[] }) {
  return (
    <dl className="ov-rows">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const VOICE_LANG: Record<string, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE" };

export function Captions({ segments, lang, voice }: { segments: Segment[]; lang: string; voice: boolean }) {
  const latest = segments[segments.length - 1];
  const text = latest ? latest.commentary[lang] ?? latest.commentary.en : "";
  useEffect(() => {
    if (!voice || !text || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[lang] ?? lang;
    u.rate = 1.08;
    u.pitch = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [text, voice, lang]);
  if (!latest) return null;
  return (
    <div className="captions" key={latest.moment.id}>
      <span className="cap-mic">{lang.toUpperCase()}</span>
      <span>{text}</span>
    </div>
  );
}

const ICON: Record<string, string> = {
  goal: "⚽",
  shot: "◎",
  save: "🧤",
  yellow_card: "🟨",
  red_card: "🟥",
  substitution: "⇄",
  corner: "⚑",
  foul: "✕",
  offside: "⚐",
  period_start: "▶",
  period_end: "■",
};

const NOTABLE = new Set(Object.keys(ICON));

export function Feed({ events, init }: { events: MatchEvent[]; init: InitMsg }) {
  const notable = events.filter((e) => NOTABLE.has(e.type)).slice(-6).reverse();
  return (
    <ul className="feed">
      {notable.map((e) => (
        <li key={e.id}>
          <span className="feed-clock">{e.clock}</span>
          <span className="feed-icon">{ICON[e.type]}</span>
          <span className="feed-team" style={{ color: init.lineups[e.team].color }}>
            {init.lineups[e.team].short}
          </span>
          <span className="feed-text">{describe(e)}</span>
        </li>
      ))}
    </ul>
  );
}

function describe(e: MatchEvent): string {
  switch (e.type) {
    case "shot":
      return `${e.player} shot, ${e.outcome?.replace("_", " ")} (xG ${e.xg?.toFixed(2)})`;
    case "goal":
      return `Goal, ${e.player}`;
    case "save":
      return `Save by ${e.player}`;
    case "substitution":
      return `${e.detail?.on} on for ${e.detail?.off}`;
    case "period_start":
      return e.period === 1 ? "Kick-off" : "Second half under way";
    case "period_end":
      return e.period === 1 ? "Half-time" : "Full-time";
    default:
      return `${e.type.replace("_", " ")}${e.player ? `, ${e.player}` : ""}`;
  }
}
