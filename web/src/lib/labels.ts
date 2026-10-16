import type { Segment, Side } from "../types";

export const SLOT_LABEL: Record<Segment["slot"], string> = {
  full_screen: "Full screen",
  stat_card: "Stat card",
  player_card: "Player card",
  lower_third: "Lower third",
};

/** Scenario titles are just the fixture, so the storyline label comes from the id. */
export const storyline = (id: string) => (id === "classic" ? "Open game" : id.charAt(0).toUpperCase() + id.slice(1).replaceAll("_", " "));

/** The UI palette is side-based: home is cobalt (--home), away tangerine (--away). */
export const sideClass = (s: Side) => (s === "home" ? "h" : "a");

export const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** Kit colours for the rendered picture and the radar, as theme tokens. */
export const PICTURE_KITS: Record<Side, string> = { home: "var(--kit-home)", away: "var(--kit-away)" };

/** Shirt-number ink for each side's kit. */
export const KIT_INK: Record<Side, string> = { home: "var(--kit-home-ink)", away: "var(--kit-away-ink)" };

export const claimsOf = (seg: Segment) => {
  const ok = seg.verification.checked.length;
  return { ok, total: ok + seg.verification.violations.length };
};

/** Which side a verified fact key belongs to, when the key says so; otherwise null. */
export function sideOfKey(key: string, team: Side): Side | null {
  if (/(^|_)home(_|$)/.test(key)) return "home";
  if (/(^|_)away(_|$)/.test(key)) return "away";
  if (key.startsWith("opp_")) return other(team);
  if (key.startsWith("team_")) return team;
  return null;
}

/** "number '0.83' not in evidence" → the blocked token and why. */
export function parseViolation(v: string): { token: string; why: string } {
  const m = v.match(/^\w+ '(.+)' (.+)$/);
  return m ? { token: m[1], why: m[2] } : { token: v, why: "" };
}
