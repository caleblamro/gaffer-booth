import type { ReactNode } from "react";
import { SLOT_LABEL, claimsOf, sideClass } from "../lib/labels";
import type { ConsoleLine, InitMsg, Moment, Segment } from "../types";
import { Check, Pulse } from "./Brand";
import { highlight } from "./Broadcast";

/* ---------- Rundown model: one row per moment the crew has touched ---------- */

interface Status {
  label: string;
  cls: "live" | "ok" | "warn" | "bad" | "neutral" | "muted";
  busy?: boolean;
}

export interface RundownRow {
  id: number;
  clock: string;
  head: string;
  moment: Moment | null;
  seg: Segment | null;
  lines: ConsoleLine[];
  status: Status;
  /** Seconds from the moment arriving to its segment arriving, both measured in this browser. */
  toAir: number | null;
}

export function buildRundown(moments: Moment[], lines: ConsoleLine[], queueIds: number[], segments: Segment[], onAir: Segment | null): RundownRow[] {
  const byMoment = new Map<number, ConsoleLine[]>();
  for (const l of lines) {
    if (l.moment_id === null) continue;
    const list = byMoment.get(l.moment_id) ?? [];
    list.push(l);
    byMoment.set(l.moment_id, list);
  }
  const momentById = new Map(moments.map((m) => [m.id, m]));
  const segById = new Map(segments.map((s) => [s.moment.id, s]));
  const queued = new Set(queueIds);
  const ids = [...new Set([...byMoment.keys(), ...queueIds, ...segById.keys()])].sort((a, b) => b - a);
  return ids.map((id) => {
    const ls = byMoment.get(id) ?? [];
    const seg = segById.get(id) ?? null;
    const m = momentById.get(id) ?? seg?.moment ?? null;
    const last = ls[ls.length - 1];
    const director = ls.find((l) => l.agent === "Director");
    let status: Status;
    if (seg && seg === onAir) status = { label: "On air", cls: "live" };
    else if (seg && !seg.verification.ok) status = { label: "Unverified", cls: "bad" };
    else if (seg && seg.breaking) status = { label: "Breaking", cls: "warn" };
    else if (seg) status = { label: "Aired", cls: "ok" };
    else if (last && (last.status === "drop" || last.status === "discarded")) status = { label: "Dropped", cls: "muted" };
    else if (queued.has(id) && ls.every((l) => l.agent === "Producer")) status = { label: "Queued", cls: "neutral" };
    else if (ls.length > 0) status = { label: "In production", cls: "neutral", busy: true };
    else status = { label: "Detected", cls: "neutral" };
    const toAir = seg && m?.receivedAt ? Math.max(0, (seg.receivedAt - m.receivedAt) / 1000) : null;
    return {
      id,
      clock: m?.clock ?? last?.clock ?? "",
      head: m?.request ? `Talkback: “${m.request}”` : m ? prettyHeadline(m.headline) : (director?.text ?? "Moment"),
      moment: m,
      seg,
      lines: ls,
      status,
      toAir,
    };
  });
}

/** "GOAL Harbour City: Wes Varga" reads as "Goal, Wes Varga" in tables. */
const prettyHeadline = (h: string) => h.replace(/^GOAL [^:]+: (.+)$/, "Goal, $1");

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill ${status.cls}`}>
      {status.cls === "live" && <i />}
      {status.busy && <Pulse />}
      {status.label}
    </span>
  );
}

const fmtSecs = (s: number | null) => (s === null ? "–" : `${s.toFixed(1)} s`);

/* ---------- Rundown table ---------- */

export function RundownTable({ rows, onOpen, limit }: { rows: RundownRow[]; onOpen: (seg: Segment) => void; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) return <p className="empty">The rundown fills as the Director takes moments to air.</p>;
  return (
    <table className="tbl rundown-tbl">
      <thead>
        <tr>
          <th>Time</th>
          <th>Moment</th>
          <th>Graphic</th>
          <th>Status</th>
          <th className="r">Claims</th>
          <th className="r">To air</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => {
          const c = r.seg ? claimsOf(r.seg) : null;
          return (
            <tr
              key={r.id}
              className={`${r.status.cls === "live" ? "hl" : ""}${r.seg ? " link" : ""}`}
              onClick={r.seg ? () => onOpen(r.seg!) : undefined}
              title={r.seg ? "Open the fact inspector" : undefined}
            >
              <td className="mono">{r.clock}</td>
              <td className="ell">{r.status.cls === "live" ? <b>{r.head}</b> : r.head}</td>
              <td>{r.seg ? SLOT_LABEL[r.seg.slot] : "–"}</td>
              <td>
                <StatusPill status={r.status} />
              </td>
              <td className="r">{c ? `${c.ok}/${c.total}` : "–"}</td>
              <td className="r">{fmtSecs(r.toAir)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- On air now: summary and the segment's console timeline ---------- */

interface Step {
  dot: "ok" | "bad" | "warn" | "";
  title: ReactNode;
  sub: string;
  codes?: string[];
  keys?: string[];
}

function stepOf(l: ConsoleLine, seg: Segment | null, langs: string[]): Step {
  const meta = (extra?: string) => [l.agent, l.clock, extra ?? `${l.ms} ms`].filter(Boolean).join(" · ");
  const attempt = l.attempt ? ` (attempt ${l.attempt})` : "";
  switch (`${l.agent}:${l.status}`) {
    case "Director:air": {
      const reason = l.text.split(": ").slice(1).join(": ");
      return { dot: "ok", title: seg ? `Aired as ${SLOT_LABEL[seg.slot].toLowerCase()}` : "Took it to air", sub: meta(reason || l.mode) };
    }
    case "Analyst:draft":
      return { dot: "", title: `Drafted the insight${attempt}`, sub: meta(`${l.mode} · ${l.ms} ms`) };
    case "Verifier:approved":
      return {
        dot: "ok",
        title: l.checked && l.checked.length > 0 ? `All ${l.checked.length} claims matched match data` : "Nothing to check",
        sub: meta(`${l.mode} · ${l.ms} ms`),
        keys: l.checked?.map((c) => c[1]),
      };
    case "Verifier:rejected":
      return { dot: "bad", title: `Blocked the draft${attempt}`, sub: meta(`${l.mode} · ${l.ms} ms`), codes: l.text.split("; ") };
    case "Graphics:ok": {
      const [slot, ...rest] = l.text.split(": ");
      const label = SLOT_LABEL[slot as Segment["slot"]] ?? slot;
      return { dot: "ok", title: `Built the ${label.toLowerCase()} “${rest.join(": ").split(" | ")[0]}”`, sub: meta(`${l.mode} · ${l.ms} ms`) };
    }
    case "Commentator:ok":
      return { dot: "ok", title: `Commentary voiced in ${langs.map((x) => x.toUpperCase()).join(", ")}`, sub: meta(`${l.mode} · ${l.ms} ms`) };
    case "Producer:request":
      return { dot: "", title: `Talkback: “${l.text}”`, sub: meta("you") };
    default:
      return { dot: l.status === "fallback" || l.status === "drop" || l.status === "discarded" ? "warn" : "", title: l.text, sub: meta(`${l.status} · ${l.mode}`) };
  }
}

export function Timeline({ row, langs }: { row: RundownRow; langs: string[] }) {
  const steps = row.lines.map((l) => ({ key: l.seq, ...stepOf(l, row.seg, langs) })).reverse();
  return (
    <ol className="tl">
      {steps.map((s) => (
        <li key={s.key}>
          <i className={`d ${s.dot}`} />
          <div>
            <b>{s.title}</b>
            <span>{s.sub}</span>
            {s.codes?.map((c, i) => (
              <code key={i} className="chip bad">
                {c}
              </code>
            ))}
            {s.keys && s.keys.length > 0 && (
              <span className="keys">
                {[...new Set(s.keys)].slice(0, 6).map((k) => (
                  <code key={k} className="chip">
                    {k}
                  </code>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
      {row.moment && (
        <li>
          <i className="d" />
          <div>
            <b>{row.moment.kind === "talkback" ? "Talkback request queued" : "Moment detected"}</b>
            <span>
              Moment detector · {row.moment.clock} · priority {row.moment.priority.toFixed(2)}
            </span>
          </div>
        </li>
      )}
    </ol>
  );
}

export function OnAirCard({ row, live, langs, onOpen }: { row: RundownRow | null; live: boolean; langs: string[]; onOpen: (seg: Segment) => void }) {
  const seg = row?.seg ?? null;
  const c = seg ? claimsOf(seg) : null;
  return (
    <section className="card seg">
      <div className="card-h">
        <h2>{live ? "On air now" : "Last on air"}</h2>
        {seg &&
          (seg.verification.ok ? (
            <button type="button" className="pill ok" onClick={() => onOpen(seg)} title="Open the fact inspector">
              Verified
            </button>
          ) : (
            <button type="button" className="pill bad" onClick={() => onOpen(seg)}>
              Unverified
            </button>
          ))}
      </div>
      {!row || !seg ? (
        <p className="empty">Nothing has aired yet. The Director takes the first moment as soon as the detector flags one.</p>
      ) : (
        <div className="seg-body">
          <div className="seg-sum">
            <div className="kv">
              <span>Moment</span>
              <b title={row.head}>{row.head}</b>
            </div>
            <div className="kv">
              <span>Graphic</span>
              <b>
                {SLOT_LABEL[seg.slot]}
                {seg.breaking ? " · breaking" : ""}
              </b>
            </div>
            <div className="kv">
              <span>Claims checked</span>
              <b>{c!.total === 0 ? "None to check" : `${c!.ok} of ${c!.total}`}</b>
            </div>
            <div className="kv">
              <span>Time to air</span>
              <b>{fmtSecs(row.toAir)}</b>
            </div>
          </div>
          <p className="said">{highlight(seg.insight, seg.verification.checked.map((x) => x[0]))}</p>
          <h3>Timeline</h3>
          <Timeline row={row} langs={langs} />
        </div>
      )}
    </section>
  );
}

/* ---------- Talkback: producer requests and the crew's answers ---------- */

export function TalkbackCard({ rows }: { rows: RundownRow[] }) {
  const asks = rows.filter((r) => r.lines.some((l) => l.agent === "Producer" && l.status === "request"));
  const pending = asks.filter((r) => !r.seg && r.status.cls !== "muted").length;
  return (
    <section className="card talk">
      <div className="card-h">
        <h2>Talkback</h2>
        {pending > 0 ? <span className="pill neutral">{pending} in progress</span> : <span className="muted sm">Press / to ask</span>}
      </div>
      <div className="talk-body">
        {asks.length === 0 && <p className="empty">Ask the crew from the bar above. The answer airs next as a verified graphic.</p>}
        {asks
          .slice()
          .reverse()
          .map((r) => {
            const ask = r.lines.find((l) => l.agent === "Producer")!;
            const work = r.lines.filter((l) => l.agent !== "Producer");
            const last = work[work.length - 1];
            return (
              <div key={r.id} className="thread">
                <div className="msg me">
                  <b>You · {ask.clock}</b>
                  {ask.text}
                </div>
                {r.seg ? (
                  <div className="msg crew">
                    <b>
                      Crew · on air {r.seg.aired_clock} · {SLOT_LABEL[r.seg.slot].toLowerCase()}
                    </b>
                    <span className="clamp">{highlight(r.seg.insight, r.seg.verification.checked.map((x) => x[0]))}</span>
                  </div>
                ) : r.status.cls === "muted" ? (
                  <div className="msg crew">
                    <b>Director · dropped</b>
                    {last?.text}
                  </div>
                ) : (
                  <div className="msg crew">
                    <b>{last ? `${last.agent} · working` : "Director · queued"}</b>
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                    {last && <em>{last.text}</em>}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}

/* ---------- Crew ---------- */

const AGENTS: { name: ConsoleLine["agent"]; role: string }[] = [
  { name: "Director", role: "Decides what airs" },
  { name: "Analyst", role: "Explains why" },
  { name: "Verifier", role: "Checks every claim" },
  { name: "Graphics", role: "Builds the overlay" },
  { name: "Commentator", role: "Voices it live" },
];

const LINE_STATUS: Record<string, Status> = {
  air: { label: "On air", cls: "live" },
  approved: { label: "Pass", cls: "ok" },
  ok: { label: "Done", cls: "ok" },
  draft: { label: "Drafted", cls: "neutral" },
  rejected: { label: "Rejected", cls: "bad" },
  fallback: { label: "Template", cls: "warn" },
  hold: { label: "Holding", cls: "muted" },
  drop: { label: "Dropped", cls: "muted" },
  discarded: { label: "Discarded", cls: "muted" },
  request: { label: "Talkback", cls: "neutral" },
};

export function CrewCard({ lines, paused, mode }: { lines: ConsoleLine[]; paused: boolean; mode: string }) {
  const lastByAgent = new Map<string, ConsoleLine>();
  for (const l of lines) lastByAgent.set(l.agent, l);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Crew</h2>
        <span className={`pill ${mode === "offline" ? "warn" : "neutral"}`}>{mode === "offline" ? "Template tier" : mode}</span>
      </div>
      <table className="tbl crew-tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Last action</th>
            <th>Mode</th>
            <th className="r">Took</th>
            <th className="r">Status</th>
          </tr>
        </thead>
        <tbody>
          {AGENTS.map((a) => {
            const l = lastByAgent.get(a.name);
            const st: Status = paused ? { label: "Paused", cls: "muted" } : l ? (LINE_STATUS[l.status] ?? { label: l.status, cls: "neutral" }) : { label: "Ready", cls: "neutral" };
            return (
              <tr key={a.name}>
                <td>
                  <b>{a.name}</b>
                  <span className="muted sm block">{a.role}</span>
                </td>
                <td className="ell wide">{l ? l.text : <span className="muted">Waiting for the first moment</span>}</td>
                <td className="mono">{l?.mode ?? "–"}</td>
                <td className="r mono">{l ? `${l.ms} ms` : "–"}</td>
                <td className="r">
                  <StatusPill status={st} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ---------- Verification log ---------- */

export function VerifyLog({ rows, lines, onOpen }: { rows: RundownRow[]; lines: ConsoleLine[]; onOpen: (seg: Segment) => void }) {
  const aired = rows.filter((r) => r.seg);
  const decisions = lines.filter((l) => l.agent === "Verifier").reverse();
  const checked = aired.reduce((n, r) => n + r.seg!.verification.checked.length, 0);
  return (
    <div className="two">
      <section className="card">
        <div className="card-h">
          <h2>Aired segments</h2>
          <span className="muted sm">
            {aired.length} aired · {checked} claims checked
          </span>
        </div>
        {aired.length === 0 ? (
          <p className="empty">Every segment that airs is listed here with the claims the Verifier matched.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Aired</th>
                <th>Moment</th>
                <th>Graphic</th>
                <th className="r">Claims</th>
                <th className="r">Result</th>
              </tr>
            </thead>
            <tbody>
              {aired.map((r) => {
                const c = claimsOf(r.seg!);
                return (
                  <tr key={r.id} className="link" onClick={() => onOpen(r.seg!)} title="Open the fact inspector">
                    <td className="mono">{r.seg!.aired_clock}</td>
                    <td className="ell">{r.head}</td>
                    <td>{SLOT_LABEL[r.seg!.slot]}</td>
                    <td className="r">
                      {c.ok}/{c.total}
                    </td>
                    <td className="r">
                      <span className={`pill ${r.seg!.verification.ok ? "ok" : "bad"}`}>
                        {r.seg!.verification.ok && <Check />}
                        {r.seg!.verification.ok ? "Verified" : "Violations"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <div className="card-h">
          <h2>Verifier decisions</h2>
          <span className="muted sm">
            {decisions.filter((d) => d.status === "rejected").length} blocked · {decisions.filter((d) => d.status === "approved").length} passed
          </span>
        </div>
        {decisions.length === 0 ? (
          <p className="empty">Each draft the Analyst writes is checked against the match data before it can air.</p>
        ) : (
          <ol className="tl pad">
            {decisions.map((l) => (
              <li key={l.seq}>
                <i className={`d ${l.status === "approved" ? "ok" : l.status === "rejected" ? "bad" : ""}`} />
                <div>
                  <b>{l.status === "approved" ? l.text : l.status === "rejected" ? `Blocked a draft${l.attempt ? ` (attempt ${l.attempt})` : ""}` : l.text}</b>
                  <span>
                    {l.clock} · {l.mode} · {l.ms} ms
                  </span>
                  {l.status === "rejected" &&
                    l.text.split("; ").map((c, i) => (
                      <code key={i} className="chip bad">
                        {c}
                      </code>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/* ---------- Detected moments waiting for the Director ---------- */

export function UpNext({ moments, queueIds, init }: { moments: Moment[]; queueIds: number[]; init: InitMsg }) {
  const waiting = new Set(queueIds);
  const queue = moments.filter((m) => waiting.has(m.id)).reverse();
  return (
    <section className="card">
      <div className="card-h">
        <h2>Up next</h2>
        <span className="muted sm">{queue.length} waiting</span>
      </div>
      {queue.length === 0 ? (
        <p className="empty">Watching the feed. Detected moments wait here until the Director takes them.</p>
      ) : (
        <ul className="feed">
          {queue.map((m) => (
            <li key={m.id}>
              <span className="mono">{m.clock}</span>
              <i className={`dot ${sideClass(m.team)}`} title={init.lineups[m.team].name} />
              <span>{m.request ? `Talkback: “${m.request}”` : m.headline}</span>
              <span className="mono muted">p {m.priority.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
