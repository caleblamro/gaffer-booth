import { useState, type FormEvent } from "react";
import type { ConsoleLine, InitMsg, MatchEvent, Moment, Segment } from "../types";
import { Check, Pulse } from "./Brand";
import { Feed, highlight } from "./Broadcast";

const AGENTS: { name: ConsoleLine["agent"]; role: string }[] = [
  { name: "Director", role: "Decides what airs" },
  { name: "Analyst", role: "Explains why" },
  { name: "Verifier", role: "Checks every claim" },
  { name: "Graphics", role: "Builds the overlay" },
  { name: "Commentator", role: "Voices it live" },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  air: { label: "On air", cls: "fail" },
  approved: { label: "Pass", cls: "pass" },
  ok: { label: "Done", cls: "pass" },
  draft: { label: "Drafted", cls: "idle" },
  rejected: { label: "Rejected", cls: "fail" },
  fallback: { label: "Template", cls: "hold" },
  hold: { label: "Holding", cls: "hold" },
  drop: { label: "Dropped", cls: "hold" },
  discarded: { label: "Discarded", cls: "hold" },
  request: { label: "Talkback", cls: "idle" },
};

function Tag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "idle" };
  return (
    <span className={`tag ${s.cls}`}>
      {s.cls === "pass" && <Check />}
      {s.label}
    </span>
  );
}

interface Props {
  init: InitMsg;
  lines: ConsoleLine[];
  moments: Moment[];
  queueIds: number[];
  segments: Segment[];
  events: MatchEvent[];
  paused: boolean;
  live: boolean;
  onTalkback: (text: string) => void;
}

type Tab = "rundown" | "feed" | "detected";

/** The crew rail: agent status, then the rundown grouped by moment, newest first. */
export function ControlRoom({ init, lines, moments, queueIds, segments, events, paused, live, onTalkback }: Props) {
  const [tab, setTab] = useState<Tab>("rundown");
  const [open, setOpen] = useState<number | null>(null);
  const [ask, setAsk] = useState("");

  const sendTalkback = (e: FormEvent) => {
    e.preventDefault();
    const text = ask.trim();
    if (!text) return;
    onTalkback(text);
    setAsk("");
    setTab("rundown");
    setOpen(null);
  };

  const lastByAgent = new Map<string, ConsoleLine>();
  for (const l of lines) lastByAgent.set(l.agent, l);
  const waiting = new Set(queueIds);
  const queue = moments.filter((m) => waiting.has(m.id));
  const byMoment = new Map<number, ConsoleLine[]>();
  for (const l of lines) {
    if (l.moment_id === null) continue;
    const list = byMoment.get(l.moment_id) ?? [];
    list.push(l);
    byMoment.set(l.moment_id, list);
  }
  const momentById = new Map(moments.map((m) => [m.id, m]));
  const segByMoment = new Map(segments.map((s) => [s.moment.id, s]));
  const rundown = [...byMoment.keys()].reverse().slice(0, 12);
  const current = open ?? rundown[0] ?? null;
  const offline = init.mode === "offline";

  return (
    <aside className="rail">
      <div className="rail-h">
        <h3>Crew</h3>
        <span className={`tag ${offline ? "hold" : "idle"}`}>{offline ? "Template tier" : init.mode}</span>
      </div>
      <div className="crewlist">
        {AGENTS.map((a, i) => {
          const l = lastByAgent.get(a.name);
          const busy = !paused && l?.status === "draft" && a.name === "Analyst";
          return (
            <div key={a.name} className={`agent${l?.status === "air" ? " live" : ""}`}>
              <span className="n">0{i + 1}</span>
              <div>
                <b>{a.name}</b>
                <small>{l ? `${l.text.slice(0, 48)}${l.text.length > 48 ? "…" : ""}` : a.role}</small>
              </div>
              {paused ? (
                <span className="tag idle">Paused</span>
              ) : l ? (
                busy ? (
                  <span className="tag idle">
                    <Pulse />
                    {l.ms} ms
                  </span>
                ) : (
                  <Tag status={l.status} />
                )
              ) : (
                <span className="tag idle">Ready</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "rundown"} className={tab === "rundown" ? "on" : ""} onClick={() => setTab("rundown")}>
          Rundown<em>{byMoment.size}</em>
        </button>
        <button type="button" role="tab" aria-selected={tab === "feed"} className={tab === "feed" ? "on" : ""} onClick={() => setTab("feed")}>
          Match feed
        </button>
        <button type="button" role="tab" aria-selected={tab === "detected"} className={tab === "detected" ? "on" : ""} onClick={() => setTab("detected")}>
          Detected<em>{queue.length}</em>
        </button>
      </div>
      <div className="log">
        {tab === "feed" && <Feed events={events} init={init} />}
        {tab === "detected" &&
          (queue.length === 0 ? (
            <p className="empty">Watching the feed. Detected moments wait here until the Director takes them.</p>
          ) : (
            queue
              .slice()
              .reverse()
              .map((m) => (
                <div key={m.id} className="mo">
                  <div className="h">
                    <span className="mono">{m.clock}</span>
                    <b>{m.headline}</b>
                    <span className="mono faint">p {m.priority.toFixed(2)}</span>
                  </div>
                </div>
              ))
          ))}
        {tab === "rundown" &&
          (rundown.length === 0 ? (
            <p className="empty">The rundown fills as the Director takes moments to air.</p>
          ) : (
            rundown.map((id) => {
              const ls = byMoment.get(id) ?? [];
              const m = momentById.get(id);
              const seg = segByMoment.get(id);
              const last = ls[ls.length - 1];
              const director = ls.find((l) => l.agent === "Director");
              const head = m?.request ? `Talkback: “${m.request}”` : (m?.headline ?? director?.text ?? "Moment");
              const isOpen = id === current;
              return (
                <div key={id} className={`mo${isOpen ? " cur" : ""}`}>
                  <button type="button" className="h" onClick={() => setOpen(isOpen ? -1 : id)} aria-expanded={isOpen}>
                    <span className="mono">{m?.clock ?? last?.clock}</span>
                    <b>{head}</b>
                    {seg ? (
                      <span className={`tag ${seg.verification.ok ? "pass" : "fail"}`}>
                        {seg.verification.ok && <Check />}
                        {seg.verification.checked.length} / {seg.verification.checked.length + seg.verification.violations.length}
                      </span>
                    ) : (
                      last && <Tag status={last.status} />
                    )}
                  </button>
                  {!isOpen && seg && (
                    <p className="sub">
                      {seg.breaking ? "breaking · " : ""}
                      {seg.slot.replace("_", " ")} · {seg.verification.checked.length > 0 ? "verified" : "no numeric claims"}
                    </p>
                  )}
                  {isOpen && (
                    <div className="steps">
                      {ls.map((l) => (
                        <div key={l.seq} className={`step st-${l.status}`}>
                          <span>{l.agent}</span>
                          <div>
                            <p>{l.checked && l.checked.length > 0 ? highlight(l.text, l.checked.map((c) => c[0])) : l.text}</p>
                            {l.checked && l.checked.length > 0 && (
                              <div className="keys">
                                {l.checked.slice(0, 8).map(([, key], i) => (
                                  <code key={i}>{key}</code>
                                ))}
                              </div>
                            )}
                            <span className="meta">
                              {STATUS[l.status]?.label ?? l.status} · {l.mode} · {l.ms} ms
                              {l.attempt ? ` · attempt ${l.attempt}` : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ))}
      </div>
      <div className="next">
        <span className="eyebrow">Up next</span>
        {queue[0] ? (
          <span className="q">
            <i style={{ background: init.lineups[queue[0].team].color }} />
            <span className="mono faint">{queue[0].clock}</span>
            {queue[0].headline}
          </span>
        ) : (
          <span className="faint">Nothing queued</span>
        )}
      </div>
      <form className="next talkback" onSubmit={sendTalkback}>
        <span className="eyebrow">Talkback</span>
        <input
          type="text"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask the crew, e.g. give me a stat on a player"
          aria-label="Talkback to the crew"
          maxLength={200}
          disabled={!live}
        />
        <button type="submit" className="btn" disabled={!live || !ask.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
