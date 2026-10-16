import { useState, type ReactNode, type RefObject } from "react";
import { SLOT_LABEL, claimsOf, parseViolation, sideClass, sideOfKey } from "../lib/labels";
import type { ConsoleLine, InitMsg, Moment, Segment, Side } from "../types";
import { Check, Cross, Pulse } from "./Brand";
import { highlight } from "./Broadcast";
import { describeMode } from "./Shell";

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
      {status.busy ? <Pulse /> : <i />}
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

/* ---------- Agent activity, in plain words ---------- */

interface Step {
  dot: "ok" | "bad" | "warn" | "";
  title: string;
}

function stepOf(l: ConsoleLine, seg: Segment | null, langs: string[]): Step {
  const attempt = l.attempt ? ` (attempt ${l.attempt})` : "";
  switch (`${l.agent}:${l.status}`) {
    case "Director:air":
      return { dot: "ok", title: seg ? `Aired ${prettyHeadline(seg.moment.headline)} as ${SLOT_LABEL[seg.slot].toLowerCase()}` : l.text.split(": ")[0].replace(/^AIR /, "Took ") };
    case "Analyst:draft":
      return { dot: "", title: `Drafted${attempt}: “${l.text}”` };
    case "Verifier:approved":
      return { dot: "ok", title: l.checked && l.checked.length > 0 ? `${l.checked.length} of ${l.checked.length} claims matched the data` : "Nothing to check" };
    case "Verifier:rejected":
      return { dot: "bad", title: `Blocked a draft${attempt}: ${l.text}` };
    case "Graphics:ok": {
      const [slot, ...rest] = l.text.split(": ");
      const label = SLOT_LABEL[slot as Segment["slot"]] ?? slot;
      return { dot: "ok", title: `Built the ${label.toLowerCase()} “${rest.join(": ").split(" | ")[0]}”` };
    }
    case "Commentator:ok":
      return { dot: "ok", title: `Voiced in ${langs.map((x) => x.toUpperCase()).join(" and ")}` };
    default:
      return { dot: l.status === "fallback" || l.status === "drop" || l.status === "discarded" ? "warn" : "", title: l.text };
  }
}

/* ---------- On air now ---------- */

const STAGES: Partial<Record<ConsoleLine["agent"], { label: string; cls: string }>> = {
  Director: { label: "Picked", cls: "d" },
  Analyst: { label: "Drafted", cls: "a" },
  Verifier: { label: "Verified", cls: "v" },
  Graphics: { label: "Graphic", cls: "g" },
  Commentator: { label: "Voiced", cls: "o" },
};

const fmtMs = (ms: number) => (ms < 95 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

/**
 * Time to air split by when each agent's last console line reached this browser. Stages can overlap
 * on the server (Graphics runs alongside the Analyst), so each step is the wait since the previous one.
 */
function pathToAir(row: RundownRow) {
  const start = row.moment?.receivedAt;
  if (!row.seg || !start) return null;
  const last = new Map<string, number>();
  for (const l of row.lines) if (STAGES[l.agent] && l.receivedAt) last.set(l.agent, l.receivedAt);
  const marks = [...last].sort((x, y) => x[1] - y[1]);
  let prev = start;
  const stages = marks.map(([agent, t]) => {
    const ms = Math.max(0, t - prev);
    prev = Math.max(prev, t);
    return { ...STAGES[agent as ConsoleLine["agent"]]!, ms };
  });
  return { stages, total: Math.max(0, row.seg.receivedAt - start) };
}

function PathToAir({ row }: { row: RundownRow }) {
  const path = pathToAir(row);
  if (!path) return null;
  const { stages, total } = path;
  return (
    <div className="path">
      <div className="hd hud">
        <span>{row.moment?.kind === "goal" ? "Goal" : "Moment"} to air</span>
        <b>{fmtMs(total)}</b>
      </div>
      {stages.length > 0 && (
        <>
          <div className="bars" style={{ gridTemplateColumns: stages.map((s) => `${Math.max(s.ms, total * 0.025, 1)}fr`).join(" ") }}>
            {stages.map((s, i) => (
              <i key={i} className={s.cls} />
            ))}
          </div>
          <div className="legend" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
            {stages.map((s, i) => (
              <div key={i}>
                <b>{fmtMs(s.ms)}</b>
                {s.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** "team_xg_total" → "Team xg total", for fact keys the moment has no label for. */
const prettyKey = (k: string) => {
  const t = k.replaceAll("_", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Claims({ row, onOpen }: { row: RundownRow; onOpen: (seg: Segment) => void }) {
  const seg = row.seg!;
  const keyOf = new Map<string, string>();
  for (const [tok, key] of seg.verification.checked) if (!keyOf.has(tok)) keyOf.set(tok, key);
  const labelOf = new Map(seg.moment.facts.map((f) => [f.key, f.label]));
  const drafts = row.lines.filter((l) => l.agent === "Verifier" && l.status === "rejected").flatMap((l) => l.text.split("; "));
  const blocked = [...seg.verification.violations, ...drafts];
  const judge = row.lines.find((l) => l.agent === "Verifier" && l.status === "approved")?.mode;
  return (
    <>
      <div className="sub hud">
        <span>Claims</span>
        <span>
          {keyOf.size} checked{blocked.length > 0 && ` / ${blocked.length} cut`}
          <button type="button" className="mini" onClick={() => onOpen(seg)} title={judge ? `Checked by ${judge.replace("+", " + ")}` : "Open the fact inspector"}>
            Evidence
          </button>
        </span>
      </div>
      {keyOf.size + blocked.length === 0 ? (
        <p className="empty">This segment makes no numeric or named claims.</p>
      ) : (
        <ul className="claims">
          {[...keyOf].map(([tok, key]) => (
            <li key={tok} className="y">
              <span>
                {labelOf.get(key) ?? prettyKey(key)}
                {(labelOf.get(key) ?? prettyKey(key)).toLowerCase() !== key.replaceAll("_", " ") && <span className="src">{key}</span>}
              </span>
              <b>{tok}</b>
              <Check />
            </li>
          ))}
          {blocked.map((v, i) => {
            const { token, why } = parseViolation(v);
            return (
              <li key={`b${i}`} className="x" title={v}>
                <span>
                  <s>{token}</s>
                  {why && <span className="src">{why}</span>}
                </span>
                <b />
                <Cross />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function RowList({ rows, empty, tag }: { rows: RundownRow[]; empty: string; tag: (r: RundownRow) => ReactNode }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="rows">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="t">{r.clock || "–"}</span>
          <span className="ell" title={r.head}>
            {r.head}
          </span>
          {tag(r)}
        </li>
      ))}
    </ul>
  );
}

interface OnAirProps {
  row: RundownRow | null;
  rows: RundownRow[];
  live: boolean;
  names: Record<Side, string>;
  onOpen: (seg: Segment) => void;
}

export function OnAirCard({ row, rows, live, names, onOpen }: OnAirProps) {
  const seg = row?.seg ?? null;
  const upNext = rows.filter((r) => !r.seg && r.status.cls !== "muted").reverse().slice(0, 3);
  const earlier = rows.filter((r) => r.seg && r !== row).slice(0, 4);
  return (
    <section className="c onair">
      <div className="ch hud">
        {live ? (
          <span className="live">
            <i />
            On air
          </span>
        ) : (
          <span>{seg ? "Last on air" : "Standby"}</span>
        )}
        <span className="n">{seg ? `Since ${seg.aired_clock}` : "Watching the feed"}</span>
      </div>
      <div className="scroll">
        {!row || !seg ? (
          <div className="story">
            <span className="hud n">Nothing aired yet</span>
            <h2>
              Watching the <i className="s">feed.</i>
            </h2>
            <p>The Director takes the first moment to air as soon as the detector flags one.</p>
          </div>
        ) : (
          <>
            <div className="story">
              <span className="hud n">
                {SLOT_LABEL[seg.slot]}
                {seg.breaking ? " — breaking" : ""} — {names[seg.moment.team]} {seg.moment.clock}
              </span>
              <h2>{row.head}</h2>
              <p>{highlight(seg.insight, seg.verification.checked.map((x) => x[0]))}</p>
            </div>
            <Claims row={row} onOpen={onOpen} />
            <PathToAir row={row} />
          </>
        )}
        <div className="sub hud">
          <span>Up next</span>
          <span>{upNext.length} waiting</span>
        </div>
        <RowList rows={upNext} empty="Nothing waiting. Detected moments queue here for the Director." tag={(r) => <em className={`tag hud${r.status.busy ? " busy" : ""}`}>{r.status.busy ? "Drafting" : r.status.label}</em>} />
        <div className="sub hud">
          <span>Earlier</span>
          <span>{rows.filter((r) => r.seg).length} aired</span>
        </div>
        <RowList rows={earlier} empty="Aired segments collect here." tag={(r) => <em className="tag hud">{r.seg!.breaking ? "Breaking" : SLOT_LABEL[r.seg!.slot]}</em>} />
      </div>
    </section>
  );
}

/* ---------- Talkback and crew: the producer's intercom ---------- */

function Reply({ row }: { row: RundownRow }) {
  const work = row.lines.filter((l) => l.agent !== "Producer");
  const last = work[work.length - 1];
  if (row.seg) {
    const team = row.seg.moment.team;
    const n = row.seg.verification.checked.length;
    return (
      <div className="m crew">
        <span className="w">Analyst</span>
        <span>
          <span className="clamp">{factChips(row.seg.insight, row.seg.verification.checked, team)}</span>
          <small className={row.seg.verification.ok ? "" : "bad"}>
            Aired {row.seg.aired_clock} as {SLOT_LABEL[row.seg.slot].toLowerCase()} — {row.seg.verification.ok ? `${n} claim${n === 1 ? "" : "s"} verified` : "unverified"}
          </small>
        </span>
      </div>
    );
  }
  if (row.status.cls === "muted") {
    return (
      <div className="m crew">
        <span className="w">Director</span>
        <span>
          <small className="bad">Dropped — {last?.text ?? "not aired"}</small>
        </span>
      </div>
    );
  }
  const doing =
    !last || last.agent === "Director"
      ? "Analyst drafting"
      : last.agent === "Analyst"
        ? "Verifying the draft"
        : last.agent === "Verifier" && last.status === "rejected"
          ? "Blocked, redrafting"
          : last.agent === "Verifier"
            ? "Verified, voicing it"
            : `${last.agent} working`;
  return (
    <div className="m crew">
      <span className="w">{last?.agent ?? "Director"}</span>
      <span>
        <small className="busy">
          <Pulse />
          {last ? `${doing} — ${last.clock}` : "Queued for the Director"}
        </small>
      </span>
    </div>
  );
}

const AGENT_NAMES: ConsoleLine["agent"][] = ["Director", "Analyst", "Verifier", "Graphics", "Commentator"];

interface Tag {
  label: string;
  cls: "on" | "busy" | "";
}

/** Live for the Director while a graphic holds; agents with work left on the segment in production are busy. */
function crewTag(agent: ConsoleLine["agent"], rows: RundownRow[], onAir: boolean, paused: boolean): Tag {
  if (paused) return { label: "Paused", cls: "" };
  if (agent === "Director") return onAir ? { label: "Live", cls: "on" } : { label: "Idle", cls: "" };
  const busy = rows.find((r) => r.status.busy);
  if (!busy) return { label: "Idle", cls: "" };
  const ls = busy.lines;
  const lastIdx = (pred: (l: ConsoleLine) => boolean) => ls.reduce((n, l, i) => (pred(l) ? i : n), -1);
  const draft = lastIdx((l) => l.agent === "Analyst" && l.status === "draft");
  const verdict = lastIdx((l) => l.agent === "Verifier");
  const approved = lastIdx((l) => l.agent === "Verifier" && l.status === "approved");
  const done = (a: string) => ls.some((l) => l.agent === a);
  if (agent === "Analyst" && (draft < 0 || (verdict > draft && approved < 0))) return { label: "Drafting", cls: "busy" };
  if (agent === "Verifier" && draft >= 0 && draft > verdict) return { label: "Checking", cls: "busy" };
  if (agent === "Graphics" && !done("Graphics")) return { label: "Building", cls: "busy" };
  if (agent === "Commentator" && approved >= 0 && !done("Commentator")) return { label: "Voicing", cls: "busy" };
  return { label: "Idle", cls: "" };
}

interface TalkbackProps {
  rows: RundownRow[];
  lines: ConsoleLine[];
  init: InitMsg;
  live: boolean;
  onAir: boolean;
  paused: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onSend: (text: string) => void;
}

export function TalkbackCard({ rows, lines, init, live, onAir, paused, inputRef, onSend }: TalkbackProps) {
  const [ask, setAsk] = useState("");
  const asks = rows.filter((r) => r.lines.some((l) => l.agent === "Producer" && l.status === "request"));
  const lastByAgent = new Map<string, ConsoleLine>();
  for (const l of lines) lastByAgent.set(l.agent, l);
  const [model, provider] = describeMode(init.mode);
  const send = (text: string) => {
    const t = text.trim();
    if (!t || !live) return;
    onSend(t);
    setAsk("");
  };
  const h = init.lineups.home.players[9]?.name;
  const a = init.lineups.away.players[9]?.name;
  const ideas = [h && `Give me a stat on ${h}`, "Who has been most dangerous?", a && `How is ${a} playing?`].filter(Boolean) as string[];
  return (
    <div className="bottom">
      <section className="c talk">
        <div className="ch hud">
          <span>Talkback</span>
          <span className="n">Answers air after checks</span>
        </div>
        <div className="msgs">
          {asks.length === 0 && <p className="hint">Ask the crew for a stat or an angle. The answer airs next as a verified graphic.</p>}
          {asks.reverse().map((r) => {
            const q = r.lines.find((l) => l.agent === "Producer")!;
            return (
              <div key={r.id} className="thread">
                <div className="m">
                  <span className="w">You {q.clock}</span>
                  <span>{q.text}</span>
                </div>
                <Reply row={r} />
              </div>
            );
          })}
        </div>
        <div className="sugg">
          {ideas.map((t) => (
            <button type="button" key={t} onClick={() => send(t)} disabled={!live}>
              {t}
            </button>
          ))}
        </div>
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            send(ask);
            inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            placeholder="Ask the crew…"
            aria-label="Talkback to the crew"
            maxLength={200}
            disabled={!live}
          />
          <kbd>/</kbd>
          <button type="submit" className="send hud" disabled={!live || !ask.trim()}>
            Send
          </button>
        </form>
      </section>
      <section className="c crew">
        <div className="ch hud">
          <span>Crew</span>
          <span className="n ell" title={provider}>
            {model}
          </span>
        </div>
        <ul>
          {AGENT_NAMES.map((name) => {
            const l = lastByAgent.get(name);
            const tag = crewTag(name, rows, onAir, paused);
            const seg = l?.moment_id != null ? (rows.find((r) => r.id === l.moment_id)?.seg ?? null) : null;
            return (
              <li key={name} title={l?.text}>
                <b>{name}</b>
                <span>{l ? stepOf(l, seg, init.langs).title : AGENTS.find((x) => x.name === name)!.role}</span>
                <em className={`hud ${tag.cls}`}>{tag.label}</em>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** The insight with each verified token as a mono chip, coloured by side when its fact key names one. */
function factChips(text: string, checked: [string, string][], team: Side) {
  const sideOf = new Map<string, Side | null>();
  for (const [tok, key] of checked) if (tok && !sideOf.get(tok)) sideOf.set(tok, sideOfKey(key, team));
  const toks = [...sideOf.keys()].sort((x, y) => y.length - x.length);
  if (toks.length === 0) return text;
  const re = new RegExp(`(${toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) => {
    if (!sideOf.has(part)) return part;
    const s = sideOf.get(part);
    return (
      <em key={i} className={s ? sideClass(s) : undefined}>
        {part}
      </em>
    );
  });
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
    <div className="cells">
      <section className="c">
        <div className="ch hud">
          <span>Agents</span>
          <span className="n">{describeMode(mode).join(" — ")}</span>
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
                    <b className="disp">{a.name}</b>
                    <span className="sub-l">{a.role}</span>
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
    </div>
  );
}

/* ---------- Verification log ---------- */

export function VerifyLog({ rows, lines, onOpen }: { rows: RundownRow[]; lines: ConsoleLine[]; onOpen: (seg: Segment) => void }) {
  const aired = rows.filter((r) => r.seg);
  const decisions = lines.filter((l) => l.agent === "Verifier").reverse();
  const checked = aired.reduce((n, r) => n + r.seg!.verification.checked.length, 0);
  return (
    <div className="cells cols-2">
      <section className="c">
        <div className="ch hud">
          <span>Aired segments</span>
          <span className="n">
            {aired.length} aired / {checked} claims checked
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
                    <td className="r mono">
                      {c.ok}/{c.total}
                    </td>
                    <td className="r">
                      <span className={`pill ${r.seg!.verification.ok ? "ok" : "bad"}`}>
                        {r.seg!.verification.ok ? <Check /> : <Cross />}
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
      <section className="c">
        <div className="ch hud">
          <span>Verifier decisions</span>
          <span className="n">
            {decisions.filter((d) => d.status === "rejected").length} blocked / {decisions.filter((d) => d.status === "approved").length} passed
          </span>
        </div>
        {decisions.length === 0 ? (
          <p className="empty">Each draft the Analyst writes is checked against the match data before it can air.</p>
        ) : (
          <ol className="log">
            {decisions.map((l) => (
              <li key={l.seq}>
                <i className={l.status === "approved" ? "ok" : l.status === "rejected" ? "bad" : ""} />
                <div>
                  <b>{l.status === "approved" ? l.text : l.status === "rejected" ? `Blocked a draft${l.attempt ? ` (attempt ${l.attempt})` : ""}` : l.text}</b>
                  <span className="hud">
                    {l.clock} — {l.mode} — {l.ms} ms
                  </span>
                  {l.status === "rejected" &&
                    l.text.split("; ").map((c, i) => (
                      <code key={i} className="code bad">
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
    <section className="c">
      <div className="ch hud">
        <span>Up next</span>
        <span className="n">{queue.length} waiting</span>
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
              <span className="mono">p {m.priority.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
