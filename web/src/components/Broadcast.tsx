import { useEffect, useState } from "react";
import { SLOT_LABEL, claimsOf, sideClass } from "../lib/labels";
import type { MatchEvent, OverlayRow, Segment } from "../types";
import { Check } from "./Brand";

/** The dark vertical tab on every graphic. Clicking it opens the fact sheet for that segment. */
function Proof({ seg, onOpen }: { seg: Segment; onOpen: (seg: Segment) => void }) {
  const v = seg.verification;
  const n = v.checked.length;
  const label = !v.ok ? `${v.violations.length} unverified claim${v.violations.length === 1 ? "" : "s"}` : n === 0 ? "No claims to check" : `${n} claim${n === 1 ? "" : "s"} verified`;
  return (
    <button type="button" className={`ck${v.ok ? "" : " bad"}`} onClick={() => onOpen(seg)} title={`${label} · show the evidence`} aria-label={`${label}, show the evidence`}>
      {v.ok ? "VERIFIED" : "UNVERIFIED"}
    </button>
  );
}

function Facts({ rows }: { rows: OverlayRow[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="facts">
      {rows.map((r) => (
        <div key={r.label}>
          <dd>{r.value}</dd>
          <dt>{r.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** On-air graphics: paper cards over the program picture, a side-colour stripe and the verified tab. */
export function OverlayLayer({ seg, onInspect }: { seg: Segment | null; onInspect: (seg: Segment) => void }) {
  if (!seg) return null;
  const o = seg.overlay;
  const rows = o.rows ?? [];
  const side = sideClass(o.team);
  const kick = (
    <div className="k">
      {o.title} · {o.team_name} · {o.clock}
    </div>
  );

  if (o.slot === "full_screen") {
    const assist = rows.find((r) => r.key === "assist");
    const cells = rows.filter((r) => r !== assist).slice(0, 3);
    return (
      <div className={`lt full ${side}`} key={o.moment_id}>
        <span className="side" />
        <div className="body">
          {kick}
          <div className="who">{o.player ?? o.subtitle}</div>
          {assist ? <div className="sub">Assisted by {assist.value}</div> : o.player && <div className="sub">{o.team_name}</div>}
          {o.compare ? (
            <table className="compare">
              <thead>
                <tr>
                  <th className="h">{o.compare.home}</th>
                  <th>
                    {o.compare.score[0]}–{o.compare.score[1]}
                  </th>
                  <th className="a">{o.compare.away}</th>
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
            <Facts rows={cells} />
          )}
        </div>
        <Proof seg={seg} onOpen={onInspect} />
      </div>
    );
  }

  if (o.slot === "stat_card" || o.slot === "player_card") {
    const player = o.slot === "player_card" && o.player;
    return (
      <div className={`lt sidecard ${side} ${o.slot === "player_card" ? "left" : "right"}`} key={o.moment_id}>
        <span className="side" />
        <div className="body">
          {kick}
          <div className="who sm">{player ? o.player : o.subtitle}</div>
          {player && !o.subtitle.includes(o.player ?? "") && <div className="sub">{o.subtitle}</div>}
          <Facts rows={rows.slice(0, 4)} />
        </div>
        <Proof seg={seg} onOpen={onInspect} />
      </div>
    );
  }

  return (
    <div className={`lt wide ${side}`} key={o.moment_id}>
      <span className="side" />
      <div className="body">
        {kick}
        <div className="who sm">{o.subtitle}</div>
      </div>
      <Proof seg={seg} onOpen={onInspect} />
    </div>
  );
}

/** Side sheet listing every checked claim in a segment and the fact key it matched. */
export function FactSheet({ seg, onClose }: { seg: Segment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const v = seg.verification;
  const { ok, total } = claimsOf(seg);
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-label="Fact inspector" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <div>
            <span className="eyebrow">Fact inspector</span>
            <h2>{seg.moment.headline}</h2>
            <span className="muted sm">
              {SLOT_LABEL[seg.slot]} · aired {seg.aired_clock}
            </span>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            Close <kbd>Esc</kbd>
          </button>
        </div>
        <div className="sheet-body">
          <div className="sheet-sum">
            <span className={`pill ${v.ok ? "ok" : "bad"}`}>{v.ok ? "All verified" : "Violations"}</span>
            <span className="muted sm">
              {ok} of {total} claim{total === 1 ? "" : "s"} matched the match data
            </span>
          </div>
          <h3>Said on air</h3>
          <p className="said">{highlight(seg.insight, v.checked.map((c) => c[0]))}</p>
          <h3>Evidence</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Fact key</th>
                <th className="r">Result</th>
              </tr>
            </thead>
            <tbody>
              {v.checked.map(([tok, key], i) => (
                <tr key={i}>
                  <td>{tok}</td>
                  <td className="mono">{key}</td>
                  <td className="r">
                    <span className="pill ok">
                      <Check />
                      Match
                    </span>
                  </td>
                </tr>
              ))}
              {v.violations.map((msg, i) => (
                <tr key={`v${i}`}>
                  <td colSpan={2}>
                    <code className="code bad">{msg}</code>
                  </td>
                  <td className="r">
                    <span className="pill bad">Blocked</span>
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    This segment makes no numeric or named claims.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="fine">Graphics fills cards from fact keys, so their values come straight from the match engine.</p>
        </div>
      </aside>
    </div>
  );
}

/** Marks each verified token where it appears in the sentence. */
export function highlight(text: string, tokens: string[]) {
  const toks = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (toks.length === 0) return text;
  const re = new RegExp(`(${toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) => (toks.includes(part) ? <mark key={i}>{part}</mark> : part));
}

const VOICE_LANG: Record<string, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE" };

export function Captions({ segments, lang, voice, visible }: { segments: Segment[]; lang: string; voice: boolean; visible: boolean }) {
  const latest = segments[segments.length - 1];
  const text = latest ? (latest.commentary[lang] ?? latest.commentary.en) : "";
  useEffect(() => {
    if (!voice || !text || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[lang] ?? lang;
    u.rate = 1.08;
    u.pitch = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [text, voice, lang]);
  if (!latest || !visible) return null;
  return (
    <div className="cap" key={latest.moment.id}>
      <span className="q">
        <span className="lang">{lang.toUpperCase()}</span>
        {text}
      </span>
    </div>
  );
}

/** True while the latest caption is on screen; graphics sit above it. */
export function useCaptionVisible(segments: Segment[]): boolean {
  const latest = segments[segments.length - 1];
  const [hiddenFor, setHiddenFor] = useState(0);
  useEffect(() => {
    if (!latest) return;
    const id = setTimeout(() => setHiddenFor(latest.receivedAt), 9000);
    return () => clearTimeout(id);
  }, [latest]);
  return latest !== undefined && hiddenFor !== latest.receivedAt;
}

const NOTABLE = new Set(["goal", "shot", "save", "yellow_card", "red_card", "substitution", "corner", "foul", "offside", "period_start", "period_end"]);

export function Feed({ events }: { events: MatchEvent[] }) {
  const notable = events.filter((e) => NOTABLE.has(e.type)).slice(-16).reverse();
  if (notable.length === 0) return <p className="empty">Events appear here from kick-off.</p>;
  return (
    <ul className="feed">
      {notable.map((e) => (
        <li key={e.id} className={e.type === "goal" ? "goal" : undefined}>
          <span className="mono">{e.clock}</span>
          <i className={`dot ${sideClass(e.team)}`} />
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
