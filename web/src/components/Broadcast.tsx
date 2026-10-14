import { useEffect, useState, type CSSProperties } from "react";
import type { InitMsg, MatchEvent, OverlayRow, Score, Segment } from "../types";
import { Check } from "./Brand";

const teamVar = (c: string) => ({ ["--c" as string]: c }) as CSSProperties;

export function ScoreBug({ init, score }: { init: InitMsg; score: Score }) {
  const h = init.lineups.home;
  const a = init.lineups.away;
  return (
    <div className="bug">
      <span className="t">
        <i style={teamVar(h.color)} />
        {h.short}
      </span>
      <span className="s">
        {score.home}
        <b>-</b>
        {score.away}
      </span>
      <span className="t">
        {a.short}
        <i style={teamVar(a.color)} />
      </span>
      <span className="c">{score.clock}</span>
    </div>
  );
}

/** "✓ N facts verified". Clicking it opens the fact inspector for that segment. */
export function Proof({ seg, onOpen }: { seg: Segment; onOpen?: (seg: Segment) => void }) {
  const v = seg.verification;
  const n = v.checked.length;
  return (
    <button type="button" className={`proof${v.ok ? "" : " bad"}`} onClick={() => onOpen?.(seg)} title="Show the evidence">
      {v.ok && <Check />}
      {v.ok ? `${n} fact${n === 1 ? "" : "s"} verified` : `${v.violations.length} unverified`}
    </button>
  );
}

function Facts({ rows, cols }: { rows: OverlayRow[]; cols: number }) {
  return (
    <dl className="facts" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** On-air graphics: chalk boards over the program picture. */
export function OverlayLayer({ seg, onInspect }: { seg: Segment | null; onInspect: (seg: Segment) => void }) {
  if (!seg) return null;
  const o = seg.overlay;
  const rows = o.rows ?? [];

  if (o.slot === "full_screen") {
    return (
      <div className="gfx gfx-full" key={o.moment_id}>
        <div className="board" style={teamVar(o.color)}>
          <div className="stripe" />
          <div className="in">
            <div className="kick">
              <span className="teamchip">
                <i />
                {o.team_name}
              </span>
              <span className="mono">{o.clock}</span>
            </div>
            <div className="d gtitle">{o.title}</div>
            {o.player && <div className="d-semi gplayer">{o.player}</div>}
          </div>
          {o.compare ? (
            <table className="compare">
              <thead>
                <tr>
                  <th style={{ color: o.compare.home_color }}>{o.compare.home}</th>
                  <th className="sc">
                    {o.compare.score[0]}-{o.compare.score[1]}
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
            rows.length > 0 && <Facts rows={rows} cols={Math.min(4, rows.length)} />
          )}
          <div className="in foot">
            <p className="say">{seg.insight}</p>
            <Proof seg={seg} onOpen={onInspect} />
          </div>
        </div>
      </div>
    );
  }

  if (o.slot === "stat_card" || o.slot === "player_card") {
    const player = o.slot === "player_card";
    return (
      <div className={`gfx gfx-side ${player ? "left" : "right"}`} key={o.moment_id}>
        <div className="board" style={teamVar(o.color)}>
          <div className="stripe" />
          <div className="in">
            <div className="kick">
              <span>{o.title}</span>
              <span className="mono">{o.clock}</span>
            </div>
            <div className="d-semi stitle">{player && o.player ? o.player : o.subtitle}</div>
            {player && o.player && !o.subtitle.includes(o.player) && <span className="pos">{o.subtitle}</span>}
          </div>
          {rows.length > 0 && <Facts rows={rows} cols={rows.length === 3 ? 3 : 2} />}
          <div className="in foot">
            <p className="say">{seg.insight}</p>
            <Proof seg={seg} onOpen={onInspect} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gfx gfx-lower" key={o.moment_id}>
      <div className="board lt" style={teamVar(o.color)}>
        <span className="ltc" />
        <div className="ltk">
          <span className="kick">
            {o.title} · {o.clock}
          </span>
          <b className="d-semi">{o.subtitle}</b>
        </div>
        <p className="say">{seg.insight}</p>
        <Proof seg={seg} onOpen={onInspect} />
      </div>
    </div>
  );
}

/** Popover listing every checked claim in a segment and the fact key it matched. */
export function FactInspector({ seg, onClose }: { seg: Segment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const v = seg.verification;
  return (
    <div className="pop-scrim" onClick={onClose}>
      <div className="pop" role="dialog" aria-label="Fact inspector" onClick={(e) => e.stopPropagation()}>
        <div className="ph">
          <b>
            {v.checked.length} fact{v.checked.length === 1 ? "" : "s"} checked
          </b>
          <span className={`tag ${v.ok ? "pass" : "fail"}`}>{v.ok ? "All verified" : "Violations"}</span>
          <button type="button" className="btn ghost x" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="sent">{highlight(seg.insight, v.checked.map((c) => c[0]))}</div>
        <table>
          <tbody>
            {v.checked.map(([tok, key], i) => (
              <tr key={i}>
                <td>{tok}</td>
                <td>{key}</td>
                <td>
                  <Check />
                </td>
              </tr>
            ))}
            {v.violations.map((msg, i) => (
              <tr key={`v${i}`} className="bad">
                <td colSpan={3}>{msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pf">
          {seg.moment.headline} · {seg.slot.replace("_", " ")} · aired {seg.aired_clock}. Graphics fills boards from fact keys, so
          their values come straight from the match engine.
        </div>
      </div>
    </div>
  );
}

/** Underlines each verified token where it appears in the sentence. */
export function highlight(text: string, tokens: string[]) {
  const toks = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (toks.length === 0) return text;
  const re = new RegExp(`(${toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) =>
    toks.includes(part) ? (
      <span key={i} className="claim">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const VOICE_LANG: Record<string, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE" };

export function Captions({ segments, lang, voice }: { segments: Segment[]; lang: string; voice: boolean }) {
  const latest = segments[segments.length - 1];
  const text = latest ? (latest.commentary[lang] ?? latest.commentary.en) : "";
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    if (!voice || !text || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[lang] ?? lang;
    u.rate = 1.08;
    u.pitch = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [text, voice, lang]);
  useEffect(() => {
    if (!latest) return;
    const id = setTimeout(() => setShownAt(latest.receivedAt), 9000);
    return () => clearTimeout(id);
  }, [latest]);
  if (!latest || shownAt === latest.receivedAt) return null;
  return (
    <div className="caption" key={latest.moment.id}>
      <span className="lang">{lang.toUpperCase()}</span>
      <span>{text}</span>
    </div>
  );
}

const NOTABLE = new Set(["goal", "shot", "save", "yellow_card", "red_card", "substitution", "corner", "foul", "offside", "period_start", "period_end"]);

export function Feed({ events, init }: { events: MatchEvent[]; init: InitMsg }) {
  const notable = events.filter((e) => NOTABLE.has(e.type)).slice(-14).reverse();
  if (notable.length === 0) return <p className="empty">Events appear here from kick-off.</p>;
  return (
    <ul className="feed">
      {notable.map((e) => (
        <li key={e.id} className={e.type === "goal" ? "goal" : undefined}>
          <span className="mono">{e.clock}</span>
          <i style={{ background: init.lineups[e.team].color }} />
          <span>{describe(e)}</span>
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
