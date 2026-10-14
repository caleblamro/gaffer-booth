import { useEffect, useRef } from "react";
import type { ConsoleLine, InitMsg, Moment, Segment } from "../types";

const AGENTS: { name: ConsoleLine["agent"]; role: string; glyph: string }[] = [
  { name: "Director", role: "decides what airs", glyph: "D" },
  { name: "Analyst", role: "explains why", glyph: "A" },
  { name: "Verifier", role: "checks every claim", glyph: "V" },
  { name: "Graphics", role: "builds the overlay", glyph: "G" },
  { name: "Commentator", role: "voices it live", glyph: "C" },
];

interface Props {
  init: InitMsg;
  lines: ConsoleLine[];
  moments: Moment[];
  queueIds: number[];
  segments: Segment[];
}

export function ControlRoom({ init, lines, moments, queueIds, segments }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const waiting = new Set(queueIds);
  const queue = moments.filter((m) => waiting.has(m.id)).slice(-6);
  const lastByAgent = new Map<string, ConsoleLine>();
  for (const l of lines) lastByAgent.set(l.agent, l);
  const verified = segments.reduce((n, s) => n + s.verification.checked.length, 0);
  const rejected = lines.filter((l) => l.agent === "Verifier" && l.status === "rejected").length;

  return (
    <aside className="control">
      <header className="cr-head">
        <h3>Control room</h3>
        <span className={`mode ${init.mode === "offline" ? "off" : "on"}`}>
          {init.mode === "offline" ? "fallback tier" : init.mode}
        </span>
      </header>

      <div className="crew">
        {AGENTS.map((a) => {
          const l = lastByAgent.get(a.name);
          return (
            <div key={a.name} className={`agent ag-${a.name.toLowerCase()} st-${l?.status ?? "idle"}`}>
              <span className="glyph">{a.glyph}</span>
              <div>
                <strong>{a.name}</strong>
                <small>{l ? `${l.status} · ${l.ms}ms` : a.role}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cr-metrics">
        <div>
          <b>{segments.length}</b>
          <span>{segments.length === 1 ? "segment" : "segments"} aired</span>
        </div>
        <div>
          <b>{verified}</b>
          <span>facts verified</span>
        </div>
        <div>
          <b>{rejected}</b>
          <span>drafts rejected</span>
        </div>
      </div>

      <div className="queue">
        <span className="q-label">Detected</span>
        {queue.length === 0 && <span className="q-empty">watching the feed…</span>}
        {queue.map((m) => (
          <span key={m.id} className="q-chip" style={{ borderColor: init.lineups[m.team].color }}>
            {m.clock} {m.headline}
          </span>
        ))}
      </div>

      <div className="log" ref={scroller}>
        {lines.map((l) => (
          <div key={l.seq} className={`line ag-${l.agent.toLowerCase()} st-${l.status}`}>
            <span className="l-clock">{l.clock}</span>
            <span className="l-agent">{l.agent}</span>
            <span className="l-status">{label(l.status)}</span>
            <span className="l-text">
              {l.text}
              {l.checked && l.checked.length > 0 && (
                <span className="l-claims">
                  {l.checked.slice(0, 6).map(([tok, key], i) => (
                    <code key={i} title={key}>
                      {tok}
                    </code>
                  ))}
                </span>
              )}
            </span>
            <span className="l-meta">
              {l.mode} · {l.ms}ms
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function label(s: string): string {
  return (
    {
      air: "ON AIR",
      hold: "HOLD",
      drop: "DROP",
      draft: "DRAFT",
      approved: "✓ PASS",
      rejected: "✗ REJECT",
      fallback: "FALLBACK",
      ok: "READY",
    }[s] ?? s.toUpperCase()
  );
}
